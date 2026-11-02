import { add, arcTangent2, clamp, fround, inverseInterpolate, multiply, PI } from '../float32/scalar.ts';
import {
  addVectors,
  dot,
  maximumVector,
  minimumVector,
  normalize,
  scaleVector,
  subtractVectors,
  vector,
  FORWARD,
  UP,
  type Vector2,
  type Vector3,
} from '../float32/vector.ts';
import { invertQuaternion, rotateVector, type Quaternion } from '../float32/quaternion.ts';
import { composeMatrix, invertMatrix, multiplyMatrices, toFloat32Matrix, transformDirection, transformPoint } from '../float32/matrix.ts';
import type { ClothScene, ClothRecord, QuaternionRecord, Vector3Record } from '../scene-format/types.ts';
import { Connection } from './attributes.ts';
import { connectChains } from './connections.ts';
import { MultiMap, sortedPair, type Pair } from './multi-map.ts';
import { applySelection, removeDuplicateTriangles, vertexSpacing } from './optimize.ts';
import { completeClothMesh } from './convert.ts';
import type { ClothMesh } from './types.ts';

const toVector = (value: Vector3Record): Vector3 => vector(value.x, value.y, value.z);
const toQuaternion = (value: QuaternionRecord): Quaternion => [fround(value.x), fround(value.y), fround(value.z), fround(value.w)];

export function buildClothMesh({ scene, cloth }: { scene: ClothScene; cloth: ClothRecord }): ClothMesh {
  const bind = cloth.bind;
  const transformPositions = bind.transformPositions.map(toVector);
  const transformRotations = bind.transformRotations.map(toQuaternion);
  const transformScales = bind.transformScales.map(toVector);
  const ids = bind.transformIds;
  const parentIds = ids.map((id) => scene.transforms.get(id)?.parent || 0);
  const childIds = ids.map((id) => scene.transforms.get(id)?.children ?? []);
  const localToWorld = toFloat32Matrix(bind.anchorLocalToWorld);
  const worldToLocal = toFloat32Matrix(bind.anchorWorldToLocal);
  const restRotation = toQuaternion(bind.anchorRotation);
  // The last transform is the anchor; every other one is a vertex.
  const vertexCount = bind.transformIds.length - 1;

  const mesh = emptyMesh({ cloth, ids, parentIds, vertexCount, localToWorld, worldToLocal, restRotation, anchorScale: toVector(bind.anchorScale) });
  mesh.transformRotations.push(...transformRotations.slice(0, vertexCount));
  mesh.transformPositions.push(...transformPositions.slice(0, vertexCount));
  mesh.transformScales.push(...transformScales.slice(0, vertexCount));
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    mesh.localPositions.push(transformPoint(worldToLocal, transformPositions[vertex]));
    mesh.localNormals.push(transformDirection(worldToLocal, rotateVector(transformRotations[vertex], UP)));
    mesh.localTangents.push(transformDirection(worldToLocal, rotateVector(transformRotations[vertex], FORWARD)));
    mesh.bindPoses.push(
      multiplyMatrices(invertMatrix(composeMatrix(transformPositions[vertex], transformRotations[vertex], transformScales[vertex])), localToWorld),
    );
  }

  // A transform listed twice maps to its first vertex.
  const idToIndex = new Map<number, number>();
  for (let vertex = 0; vertex < vertexCount; vertex++) if (!idToIndex.has(ids[vertex])) idToIndex.set(ids[vertex], vertex);
  const mode = cloth.configuration.connectionKind;
  const rootIds = cloth.configuration.rootBones.map((reference) => reference.referenceId);
  if (mode === Connection.Line) {
    mesh.lines = parentLines({ ids, parentIds, vertexCount, renderIndex: vertexCount });
  } else {
    const connected = connectChains({ positions: mesh.localPositions, idToIndex, parentIds, childIds, rootIds, mode });
    mesh.lines = connected.lines;
    mesh.triangles = connected.triangles;
  }

  mesh.uvs = sphereUvs({ positions: mesh.localPositions, hasTriangles: mesh.triangles.length > 0 });
  const spacing = vertexSpacing({ positions: mesh.localPositions, triangles: mesh.triangles, lines: mesh.lines });
  const selection = { positions: cloth.selection.positions.map(toVector), attributes: cloth.selection.attributes };
  mesh.triangles = removeDuplicateTriangles({ positions: mesh.localPositions, triangles: mesh.triangles });
  applySelection({ mesh, selection, averageDistance: spacing.average });
  completeClothMesh({ mesh, outwardNormals: cloth.outwardNormals });
  return mesh;
}

function emptyMesh({
  cloth,
  ids,
  parentIds,
  vertexCount,
  localToWorld,
  worldToLocal,
  restRotation,
  anchorScale,
}: {
  cloth: ClothRecord;
  ids: readonly number[];
  parentIds: readonly number[];
  vertexCount: number;
  localToWorld: number[];
  worldToLocal: number[];
  restRotation: Quaternion;
  anchorScale: Vector3;
}): ClothMesh {
  return {
    name: cloth.name,
    vertexCount,
    transformIds: ids.slice(0, vertexCount),
    parentIds: parentIds.slice(0, vertexCount),
    anchorTransformId: ids[vertexCount],
    rootIds: cloth.configuration.rootBones.map((reference) => reference.referenceId),
    restLocalToWorld: localToWorld,
    restWorldToLocal: worldToLocal,
    restRotation,
    restInverseRotation: invertQuaternion(restRotation),
    restScale: anchorScale,
    transformRotations: [],
    transformPositions: [],
    transformScales: [],
    localPositions: [],
    localNormals: [],
    localTangents: [],
    bindPoses: [],
    attributes: new Uint8Array(vertexCount),
    uvs: [],
    lines: [],
    triangles: [],
    edges: [],
    vertexNeighbours: [],
    vertexTriangles: [],
    edgeTriangles: new MultiMap<string, number>(),
    fixedVerticesForCenter: [],
    parentIndices: new Int32Array(vertexCount),
    childIndices: [],
    chainIncludesLine: [],
    chainStart: [],
    chainCount: [],
    chainData: [],
    normalCorrectionRotations: [],
    particleToBoneRotations: [],
    vertexInverseRestPositions: [],
    vertexInverseRestRotations: [],
    vertexLocalPositions: [],
    vertexLocalRotations: [],
    depths: [],
    rootIndices: new Int32Array(vertexCount),
  };
}

function parentLines({
  ids,
  parentIds,
  vertexCount,
  renderIndex,
}: {
  ids: readonly number[];
  parentIds: readonly number[];
  vertexCount: number;
  renderIndex: number;
}): Pair[] {
  // The transform at renderIndex is the anchor, not a particle, so a parent link to it makes no line.
  const lines: Pair[] = [];
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const parent = ids.indexOf(parentIds[vertex]);
    if (parent >= 0 && parent !== renderIndex) lines.push(sortedPair(parent, vertex));
  }
  return lines;
}

// Spherical UVs around the centre of the bounds, both in [0, 1]: longitude around the up axis, and latitude from the
// top (0) to the bottom (1), linear in height. The UV is (10 · latitude, 10 · longitude) plus a small per-vertex shift,
// so vertices in the same direction get different UVs.
function sphereUvs({ positions, hasTriangles }: { positions: readonly Vector3[]; hasTriangles: boolean }): Vector2[] {
  if (!hasTriangles) return positions.map(() => [0, 0]);
  let lower: Vector3 = [Infinity, Infinity, Infinity];
  let upper: Vector3 = [-Infinity, -Infinity, -Infinity];
  for (const position of positions) {
    lower = minimumVector(lower, position);
    upper = maximumVector(upper, position);
  }

  const center = scaleVector(addVectors(upper, lower), 0.5);
  return positions.map((position, vertex) => {
    const direction = normalize(subtractVectors(position, center));
    const longitude = clamp(inverseInterpolate(-PI, PI, arcTangent2(direction[0], direction[2])), 0, 1);
    const latitude = clamp(inverseInterpolate(1, -1, dot(UP, direction)), 0, 1);
    const shift = multiply(vertex, fround(0.0001234));
    return [add(multiply(latitude, 10), shift), add(multiply(longitude, 10), shift)];
  });
}
