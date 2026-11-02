import { add, divide, fround, maximum, squareRoot, toDegrees } from '../float32/scalar.ts';
import { distance, distanceSquared, type Vector3 } from '../float32/vector.ts';
import { closestPointsBetweenSegments, triangleAngle } from '../float32/geometry.ts';
import { pairKey, sortedPair, triangleKey, type Pair, type Triangle } from './multi-map.ts';
import type { ClothMesh } from './types.ts';

const LARGEST = fround(3.4028235e38);
const TRIANGLE_PAIR_ANGLE = 20;

export type VertexSpacing = { readonly average: number };

// The root mean square of the edge lengths of the triangles and lines, sampling each list with a stride of a hundredth
// of its length.
export function vertexSpacing({
  positions,
  triangles,
  lines,
}: {
  positions: readonly Vector3[];
  triangles: readonly Triangle[];
  lines: readonly Pair[];
}): VertexSpacing {
  let squaredLengthSum = 0;
  let edgeCount = 0;

  if (triangles.length) {
    const triangleStride = Math.max(Math.trunc(triangles.length / 100), 1);
    let triangleSum = 0;
    for (let index = 0; index < triangles.length; index += triangleStride) {
      const [first, second, third] = triangles[index];
      const firstEdgeSquared = distanceSquared(positions[first], positions[second]);
      const secondEdgeSquared = distanceSquared(positions[second], positions[third]);
      const thirdEdgeSquared = distanceSquared(positions[third], positions[first]);
      triangleSum = add(add(add(triangleSum, firstEdgeSquared), secondEdgeSquared), thirdEdgeSquared);
      edgeCount += 3;
    }
    squaredLengthSum = add(squaredLengthSum, triangleSum);
  }

  if (lines.length) {
    const lineStride = Math.max(Math.trunc(lines.length / 100), 1);
    let lineSum = 0;
    for (let index = 0; index < lines.length; index += lineStride) {
      const lineSquared = distanceSquared(positions[lines[index][0]], positions[lines[index][1]]);
      lineSum = add(lineSum, lineSquared);
      edgeCount++;
    }
    squaredLengthSum = add(squaredLengthSum, lineSum);
  }

  return edgeCount ? { average: squareRoot(divide(squaredLengthSum, edgeCount)) } : { average: 0 };
}

// Drop both triangles of a quad that was already covered by the other diagonal.
export function removeDuplicateTriangles({ positions, triangles }: { positions: readonly Vector3[]; triangles: Triangle[] }): Triangle[] {
  if (triangles.length < 2) return triangles;
  const edgeTriangles = new Map<string, { edge: Pair; list: number[] }>();
  triangles.forEach((triangle, triangleIndex) => {
    for (const [first, second] of trianglePairs(triangle)) {
      const edgeKey = pairKey(first, second);
      const entry = edgeTriangles.get(edgeKey) ?? { edge: sortedPair(first, second), list: [] };
      edgeTriangles.set(edgeKey, entry);
      if (entry.list.length < 31) entry.list.push(triangleIndex);
    }
  });

  const quads = new Set<string>();
  const removed = new Set<string>();
  for (const { edge, list } of edgeTriangles.values()) {
    const edgeStart = positions[edge[0]];
    const edgeEnd = positions[edge[1]];
    for (let firstListIndex = 0; firstListIndex < list.length - 1; firstListIndex++) {
      const firstTriangle = triangles[list[firstListIndex]];
      const firstApex = oppositeVertex(firstTriangle, edge);
      for (let secondListIndex = firstListIndex + 1; secondListIndex < list.length; secondListIndex++) {
        const secondTriangle = triangles[list[secondListIndex]];
        const secondApex = oppositeVertex(secondTriangle, edge);

        // Two triangles that bend less than TRIANGLE_PAIR_ANGLE across the edge, and whose apex segment passes the
        // edge strictly between its ends, split a quad along that edge.
        const angle = toDegrees(triangleAngle({ edgeStart, edgeEnd, firstApex: positions[firstApex], secondApex: positions[secondApex] }));
        if (Math.abs(angle) > TRIANGLE_PAIR_ANGLE) continue;
        const { firstRatio, secondRatio } = closestPointsBetweenSegments({
          firstStart: edgeStart,
          firstEnd: edgeEnd,
          secondStart: positions[firstApex],
          secondEnd: positions[secondApex],
        });
        if (firstRatio === 0 || firstRatio === 1 || secondRatio === 0 || secondRatio === 1) continue;
        const quad = [edge[0], edge[1], firstApex, secondApex].sort((left, right) => left - right).join(',');
        // Meeting the same four vertices again means the quad is split along both diagonals.
        if (quads.has(quad)) {
          removed.add(triangleKey(firstTriangle));
          removed.add(triangleKey(secondTriangle));
        } else quads.add(quad);
      }
    }
  }
  return triangles.filter((triangle) => !removed.has(triangleKey(triangle)));
}

export type SelectionPoints = { readonly positions: readonly Vector3[]; readonly attributes: readonly number[] };

// Adds to each vertex the attribute of the nearest selection point within the radius; of equally near points, the last
// one wins.
export function applySelection({ mesh, selection, averageDistance }: { mesh: ClothMesh; selection: SelectionPoints; averageDistance: number }): void {
  const radius = maximum(averageDistance, fround(0.00001));
  for (let vertex = 0; vertex < mesh.vertexCount; vertex++) {
    let nearestDistance = LARGEST;
    let attribute = 0;
    selection.positions.forEach((point, pointIndex) => {
      const pointDistance = distance(mesh.localPositions[vertex], point);
      if (pointDistance > radius || pointDistance > nearestDistance) return;
      nearestDistance = pointDistance;
      attribute = selection.attributes[pointIndex];
    });
    mesh.attributes[vertex] |= attribute;
  }
}

export const trianglePairs = (triangle: Triangle): readonly Pair[] => [
  [triangle[0], triangle[1]],
  [triangle[1], triangle[2]],
  [triangle[2], triangle[0]],
];

export function oppositeVertex(triangle: Triangle, edge: Pair): number {
  return triangle.find((vertex) => vertex !== edge[0] && vertex !== edge[1]) ?? -1;
}
