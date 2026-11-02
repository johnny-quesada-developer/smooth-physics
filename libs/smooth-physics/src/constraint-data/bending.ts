import { arcCosine, clampSigned, fround, multiply, toDegrees } from '../float32/scalar.ts';
import { cross, dot, normalize, subtractVectors } from '../float32/vector.ts';
import { transformPoint } from '../float32/matrix.ts';
import { isExcluded, isNotSimulated, VOLUME_SIGN } from '../cloth-mesh/attributes.ts';
import { pairKey } from '../cloth-mesh/multi-map.ts';
import type { ClothMesh } from '../cloth-mesh/types.ts';

// The angle limits are in degrees between the two triangle normals.
const TRIANGLE_BENDING_MAX_ANGLE = 120;
const VOLUME_MIN_ANGLE = 90;
const VOLUME_SCALE = 1000;

export type BendingPair = [number, number, number, number];
export type BendingData = { readonly pairs: readonly BendingPair[]; readonly rest: Float32Array; readonly sign: Int8Array };

// For every two triangles that share an edge: the vertices opposite the edge, then the edge's two ends. A pair bent
// less than TRIANGLE_BENDING_MAX_ANGLE keeps its rest angle, the sign telling which way it folds. A pair folded between
// VOLUME_MIN_ANGLE and 179 degrees keeps the rest volume of the tetrahedron its four vertices span, once per vertex
// set, with the sign VOLUME_SIGN.
export function createBendingData(mesh: ClothMesh): BendingData | null {
  if (!mesh.triangles.length || !mesh.edges.length) return null;
  const attributes = mesh.attributes;
  const positions = mesh.localPositions;
  const pairs: BendingPair[] = [];
  const rest: number[] = [];
  const sign: number[] = [];
  const volumes = new Set<string>();

  for (const [edgeStart, edgeEnd] of mesh.edges) {
    const sharingTriangles = mesh.edgeTriangles.values(pairKey(edgeStart, edgeEnd));
    for (let firstIndex = 0; firstIndex < sharingTriangles.length - 1; firstIndex++) {
      const firstTriangle = mesh.triangles[sharingTriangles[firstIndex]];
      for (let secondIndex = firstIndex + 1; secondIndex < sharingTriangles.length; secondIndex++) {
        const secondTriangle = mesh.triangles[sharingTriangles[secondIndex]];
        const vertices: BendingPair = [
          firstTriangle.find((vertex) => vertex !== edgeStart && vertex !== edgeEnd) ?? -1,
          secondTriangle.find((vertex) => vertex !== edgeStart && vertex !== edgeEnd) ?? -1,
          edgeStart,
          edgeEnd,
        ];
        if (vertices.every((vertex) => isNotSimulated(attributes[vertex]))) continue;
        if (vertices.some((vertex) => isExcluded(attributes[vertex]))) continue;

        const [firstApexPosition, secondApexPosition, edgeStartPosition, edgeEndPosition] = [
          positions[vertices[0]],
          positions[vertices[1]],
          positions[vertices[2]],
          positions[vertices[3]],
        ];
        const firstNormal = normalize(cross(subtractVectors(edgeStartPosition, firstApexPosition), subtractVectors(edgeEndPosition, firstApexPosition)));
        const secondNormal = normalize(cross(subtractVectors(edgeEndPosition, secondApexPosition), subtractVectors(edgeStartPosition, secondApexPosition)));
        const restAngle = arcCosine(clampSigned(dot(firstNormal, secondNormal)));
        const foldDirection = dot(cross(firstNormal, secondNormal), subtractVectors(edgeEndPosition, edgeStartPosition));
        const restDegrees = Math.abs(toDegrees(restAngle));
        if (restDegrees < TRIANGLE_BENDING_MAX_ANGLE) {
          pairs.push(vertices);
          rest.push(restAngle);
          sign.push(foldDirection < 0 ? -1 : 1);
        }

        if (restDegrees < VOLUME_MIN_ANGLE || restDegrees > 179) continue;
        const volumeKey = [...vertices].sort((left, right) => left - right).join(',');
        if (volumes.has(volumeKey)) continue;
        // The signed tetrahedron volume, one sixth of the triple product of its edges from the first vertex.
        const worldPositions = vertices.map((vertex) => transformPoint(mesh.restLocalToWorld, positions[vertex]));
        const volume = multiply(
          multiply(
            fround(1 / 6),
            dot(
              cross(subtractVectors(worldPositions[1], worldPositions[0]), subtractVectors(worldPositions[2], worldPositions[0])),
              subtractVectors(worldPositions[3], worldPositions[0]),
            ),
          ),
          VOLUME_SCALE,
        );
        pairs.push(vertices);
        rest.push(volume);
        sign.push(VOLUME_SIGN);
        volumes.add(volumeKey);
      }
    }
  }
  return pairs.length ? { pairs, rest: Float32Array.from(rest), sign: Int8Array.from(sign) } : null;
}
