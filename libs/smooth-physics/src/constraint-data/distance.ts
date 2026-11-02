import { divide, fround, subtract } from '../float32/scalar.ts';
import { distance, dot, length, subtractVectors } from '../float32/vector.ts';
import { triangleNormal } from '../float32/geometry.ts';
import { isExcluded, isSimulated } from '../cloth-mesh/attributes.ts';
import { MultiMap, pairKey } from '../cloth-mesh/multi-map.ts';
import { oppositeVertex } from '../cloth-mesh/optimize.ts';
import type { ClothMesh } from '../cloth-mesh/types.ts';

export type DistanceData = { readonly start: Int32Array; readonly data: Int32Array; readonly rest: Float32Array };

// Each vertex's links, stored together: data[start[vertex]] to data[start[vertex + 1] - 1] are the linked vertices and
// rest holds each link's rest length. A positive rest length marks a vertical link (to the parent or a child), a
// negative one a horizontal link, and 0 two vertices that coincide at rest.
export function createDistanceData(mesh: ClothMesh): DistanceData {
  const attributes = mesh.attributes;
  const positions = mesh.localPositions;
  const vertical = new MultiMap<number, number>();
  const horizontal = new MultiMap<number, number>();
  const connected = new Set<string>();

  for (let vertex = 0; vertex < mesh.vertexCount; vertex++) {
    const neighbours = mesh.vertexNeighbours[vertex];
    if (!neighbours.length) continue;
    const parent = mesh.parentIndices[vertex];
    // The multi-map returns values newest first, so adding the neighbours in reverse returns them in array order.
    for (const neighbour of [...neighbours].reverse()) {
      if (!isSimulated(attributes[vertex]) && !isSimulated(attributes[neighbour])) continue;
      if (isExcluded(attributes[vertex]) || isExcluded(attributes[neighbour])) continue;
      if (neighbour === parent || vertex === mesh.parentIndices[neighbour]) vertical.add(vertex, neighbour);
      else horizontal.add(vertex, neighbour);
      connected.add(pairKey(vertex, neighbour));
    }
  }
  addShearLinks({ mesh, horizontal, connected });

  const start = new Int32Array(mesh.vertexCount + 1);
  const data: number[] = [];
  const rest: number[] = [];
  for (let vertex = 0; vertex < mesh.vertexCount; vertex++) {
    start[vertex] = data.length;
    const groups: readonly (readonly [readonly number[], number])[] = [
      [vertical.values(vertex), 1],
      [horizontal.values(vertex), -1],
    ];
    for (const [linkedVertices, sign] of groups) {
      for (const linkedVertex of linkedVertices) {
        const restLength = distance(positions[vertex], positions[linkedVertex]);
        data.push(linkedVertex);
        rest.push(restLength < fround(1e-8) ? 0 : sign * restLength);
      }
    }
  }
  start[mesh.vertexCount] = data.length;
  return { start, data: Int32Array.from(data), rest: Float32Array.from(rest) };
}

// Shear links: links the apexes of two triangles that share an edge, both ways, when the triangles are within 20
// degrees of coplanar (0.9396926 is cos 20 degrees) and the apexes are as far apart as the edge is long, within 30%.
function addShearLinks({ mesh, horizontal, connected }: { mesh: ClothMesh; horizontal: MultiMap<number, number>; connected: Set<string> }): void {
  const attributes = mesh.attributes;
  const positions = mesh.localPositions;
  for (const edge of mesh.edges) {
    const [edgeStart, edgeEnd] = edge;
    const sharingTriangles = mesh.edgeTriangles.values(pairKey(edgeStart, edgeEnd));
    if (sharingTriangles.length < 2) continue;
    const edgeLength = length(subtractVectors(positions[edgeStart], positions[edgeEnd]));
    if (edgeLength < fround(1e-8)) continue;

    for (let firstIndex = 0; firstIndex < sharingTriangles.length - 1; firstIndex++) {
      const firstApex = oppositeVertex(mesh.triangles[sharingTriangles[firstIndex]], edge);
      const firstNormal = triangleNormal(positions[edgeStart], positions[edgeEnd], positions[firstApex]);
      for (let secondIndex = firstIndex + 1; secondIndex < sharingTriangles.length; secondIndex++) {
        const secondApex = oppositeVertex(mesh.triangles[sharingTriangles[secondIndex]], edge);
        const secondNormal = triangleNormal(positions[edgeStart], positions[edgeEnd], positions[secondApex]);
        if (!isSimulated(attributes[firstApex]) && !isSimulated(attributes[secondApex])) continue;
        if (Math.abs(dot(firstNormal, secondNormal)) < fround(0.9396926)) continue;
        const lengthMismatch = Math.abs(subtract(divide(length(subtractVectors(positions[firstApex], positions[secondApex])), edgeLength), 1));
        if (lengthMismatch > fround(0.3)) continue;
        const key = pairKey(firstApex, secondApex);
        if (connected.has(key)) continue;
        connected.add(key);
        horizontal.add(firstApex, secondApex);
        horizontal.add(secondApex, firstApex);
      }
    }
  }
}
