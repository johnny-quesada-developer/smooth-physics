import { add, divide, fround, maximum, saturate, toDegrees } from '../float32/scalar.ts';
import {
  addVectors,
  cross,
  distance,
  dot,
  length,
  lengthSquared,
  maximumVector,
  minimumVector,
  negateVector,
  normalize,
  scaleVector,
  subtractVectors,
  type Vector3,
} from '../float32/vector.ts';
import { invertQuaternion, multiplyQuaternions, rotateVector } from '../float32/quaternion.ts';
import { angleBetween, isZeroDistance, toRotation, triangleNormal, triangleTangent } from '../float32/geometry.ts';
import { Attribute, isNotSimulated, isSimulated } from './attributes.ts';
import { MultiMap, pairKey, sortedPair, type Pair, type Triangle } from './multi-map.ts';
import { oppositeVertex, trianglePairs } from './optimize.ts';
import type { ClothMesh } from './types.ts';

const LARGEST = fround(3.4028235e38);
const SAME_SURFACE_ANGLE = 80;
const MAXIMUM_TRIANGLES_PER_VERTEX = 7;

export function completeClothMesh({ mesh, outwardNormals }: { mesh: ClothMesh; outwardNormals: boolean }): void {
  linkNeighbours(mesh);
  if (mesh.triangles.length) buildVertexFrames(mesh);
  const center = collectFixedVerticesAndBounds(mesh);
  createChains(mesh);
  if (outwardNormals) pointNormalsAwayFromCenter({ mesh, center });
  createBindPoses(mesh);
  createChainPose(mesh);
  assignChainRootsAndDepths(mesh);
}

function linkNeighbours(mesh: ClothMesh): void {
  const neighbours = new MultiMap<number, number>();
  const edges = new Map<string, Pair>();
  for (const [firstVertex, secondVertex, thirdVertex] of mesh.triangles) {
    neighbours.addUnique(firstVertex, secondVertex);
    neighbours.addUnique(firstVertex, thirdVertex);
    neighbours.addUnique(secondVertex, firstVertex);
    neighbours.addUnique(secondVertex, thirdVertex);
    neighbours.addUnique(thirdVertex, firstVertex);
    neighbours.addUnique(thirdVertex, secondVertex);
    for (const [first, second] of [
      [firstVertex, secondVertex],
      [secondVertex, thirdVertex],
      [thirdVertex, firstVertex],
    ])
      edges.set(pairKey(first, second), sortedPair(first, second));
  }
  for (const [first, second] of mesh.lines) {
    neighbours.addUnique(first, second);
    neighbours.addUnique(second, first);
    edges.set(pairKey(first, second), sortedPair(first, second));
  }

  mesh.edges = [...edges.values()];
  mesh.vertexNeighbours = Array.from({ length: mesh.vertexCount }, (_, vertex) => neighbours.values(vertex));
  mesh.vertexTriangles = Array.from({ length: mesh.vertexCount }, () => []);
  mesh.edgeTriangles = new MultiMap<string, number>();
}

// Sets each vertex's normal and tangent from the triangles around it, after making the windings agree.
function buildVertexFrames(mesh: ClothMesh): void {
  const positions = mesh.localPositions;
  mesh.triangles.forEach((triangle, triangleIndex) => {
    for (const [first, second] of trianglePairs(triangle)) mesh.edgeTriangles.addUnique(pairKey(first, second), triangleIndex);
  });

  const normals = mesh.triangles.map(([first, second, third]) => triangleNormal(positions[first], positions[second], positions[third]));
  unifyTriangleWinding({ mesh, normals });

  const tangents = mesh.triangles.map(([first, second, third]) =>
    triangleTangent({ positions: [positions[first], positions[second], positions[third]], uvs: [mesh.uvs[first], mesh.uvs[second], mesh.uvs[third]] }),
  );
  mesh.triangles.forEach((triangle, triangleIndex) => {
    for (const vertex of triangle)
      if (mesh.vertexTriangles[vertex].length < MAXIMUM_TRIANGLES_PER_VERTEX) mesh.vertexTriangles[vertex].push({ triangle: triangleIndex, flip: 0 });
  });
  for (let vertex = 0; vertex < mesh.vertexCount; vertex++) orientVertexTriangles({ mesh, vertex, normals, tangents });

  // flip & 1 negates a triangle's normal and flip & 2 its tangent, so each sum adds directions that agree.
  for (let vertex = 0; vertex < mesh.vertexCount; vertex++) {
    const adjacentTriangles = mesh.vertexTriangles[vertex];
    if (!adjacentTriangles.length) continue;
    let normalSum: Vector3 = [0, 0, 0];
    let tangentSum: Vector3 = [0, 0, 0];
    for (const { triangle, flip } of adjacentTriangles) {
      normalSum = addVectors(normalSum, scaleVector(normals[triangle], flip & 1 ? -1 : 1));
      tangentSum = addVectors(tangentSum, scaleVector(tangents[triangle], flip & 2 ? -1 : 1));
    }
    const normal = normalize(normalSum);
    mesh.localNormals[vertex] = normal;
    mesh.localTangents[vertex] = normalize(cross(normal, tangentSum));
  }
}

// Makes the windings of each connected surface agree, flipping triangles and their normals in place. A surface is a
// breadth-first walk across edges that bend at most SAME_SURFACE_ANGLE; each triangle reached is flipped to agree with
// the one it was reached from. The whole surface is then flipped when more of its neighbours bend toward its normals
// than away, so the normals of a curved surface point to its convex side.
function unifyTriangleWinding({ mesh, normals }: { mesh: ClothMesh; normals: Vector3[] }): void {
  const triangles = mesh.triangles;
  const positions = mesh.localPositions;
  const used = new Set<number>();
  // The bend across the shared edge: triangleAngle, in degrees.
  const pairAngle = (firstTriangle: Triangle, secondTriangle: Triangle, edge: Pair): number => {
    const firstApex = oppositeVertex(firstTriangle, edge);
    const secondApex = oppositeVertex(secondTriangle, edge);
    const edgeDirection = subtractVectors(positions[edge[1]], positions[edge[0]]);
    const toFirst = subtractVectors(positions[firstApex], positions[edge[0]]);
    const toSecond = subtractVectors(positions[secondApex], positions[edge[0]]);
    return toDegrees(angleBetween(cross(edgeDirection, toFirst), cross(toSecond, edgeDirection)));
  };
  // Whether the triangle's apex lies on or behind the plane through the edge with this normal.
  const opensAway = (triangle: Triangle, edge: Pair, normal: Vector3): boolean =>
    dot(normal, normalize(subtractVectors(positions[oppositeVertex(triangle, edge)], positions[edge[0]]))) <= 0;

  for (let start = 0; start < triangles.length; start++) {
    if (used.has(start)) continue;
    used.add(start);
    const queue = [start];
    const layer: number[] = [];
    let openCount = 0;
    let closeCount = 0;
    for (let current = queue.shift(); current !== undefined; current = queue.shift()) {
      const normal = normals[current];
      const triangle = triangles[current];
      layer.push(current);
      for (const edge of [sortedPair(triangle[0], triangle[1]), sortedPair(triangle[1], triangle[2]), sortedPair(triangle[2], triangle[0])]) {
        for (const neighbour of mesh.edgeTriangles.values(pairKey(edge[0], edge[1]))) {
          if (used.has(neighbour)) continue;
          if (pairAngle(triangle, triangles[neighbour], edge) > SAME_SURFACE_ANGLE) continue;
          if (dot(normal, normals[neighbour]) < 0) {
            const previous = triangles[neighbour];
            triangles[neighbour] = [previous[0], previous[2], previous[1]];
            normals[neighbour] = negateVector(normals[neighbour]);
          }
          if (opensAway(triangles[neighbour], edge, normal)) openCount++;
          else closeCount++;
          used.add(neighbour);
          queue.push(neighbour);
        }
      }
    }
    if (closeCount <= openCount) continue;

    for (const triangleIndex of layer) {
      const previous = triangles[triangleIndex];
      triangles[triangleIndex] = [previous[0], previous[2], previous[1]];
      normals[triangleIndex] = negateVector(normals[triangleIndex]);
    }
  }
}

function orientVertexTriangles({
  mesh,
  vertex,
  normals,
  tangents,
}: {
  mesh: ClothMesh;
  vertex: number;
  normals: readonly Vector3[];
  tangents: readonly Vector3[];
}): void {
  const adjacentTriangles = mesh.vertexTriangles[vertex];
  if (!adjacentTriangles.length) return;
  mesh.attributes[vertex] |= Attribute.InTriangle;

  // The normalized sum of the directions. When they mostly cancel out (a sum shorter than 0.5), the direction of the
  // candidate triangle whose others, each turned to its side, add up to the longest vector.
  const dominantDirection = (directions: readonly Vector3[]): Vector3 => {
    let sum: Vector3 = [0, 0, 0];
    for (const { triangle } of adjacentTriangles) sum = addVectors(sum, directions[triangle]);
    if (length(sum) >= 0.5) return normalize(sum);

    let largestAgreement = -1;
    let bestDirection: Vector3 = [0, 0, 0];
    for (const { triangle: candidate } of adjacentTriangles) {
      let agreement: Vector3 = [0, 0, 0];
      for (const { triangle: other } of adjacentTriangles) {
        if (other !== candidate)
          agreement = addVectors(agreement, dot(directions[candidate], directions[other]) >= 0 ? directions[other] : negateVector(directions[other]));
      }
      const agreementSquared = lengthSquared(agreement);
      if (agreementSquared > largestAgreement) {
        largestAgreement = agreementSquared;
        bestDirection = directions[candidate];
      }
    }
    return bestDirection;
  };

  // Marks each triangle whose normal (flip & 1) or tangent (flip & 2) points against the vertex's.
  const finalNormal = dominantDirection(normals);
  const finalTangent = dominantDirection(tangents);
  for (const entry of adjacentTriangles)
    entry.flip = (dot(finalNormal, normals[entry.triangle]) < 0 ? 1 : 0) | (dot(finalTangent, tangents[entry.triangle]) < 0 ? 2 : 0);
}

// Lists the fixed vertices that have a moving neighbour or no neighbours in fixedVerticesForCenter, and returns the
// centre of the bounds of every vertex except fixed ones surrounded by fixed neighbours.
function collectFixedVerticesAndBounds(mesh: ClothMesh): Vector3 {
  const attributes = mesh.attributes;
  const positions = mesh.localPositions;
  let boundedCount = 0;
  let lower: Vector3 = [LARGEST, LARGEST, LARGEST];
  let upper: Vector3 = [-LARGEST, -LARGEST, -LARGEST];
  mesh.fixedVerticesForCenter = [];
  for (let vertex = 0; vertex < mesh.vertexCount; vertex++) {
    const neighbours = mesh.vertexNeighbours[vertex];
    const isInteriorFixed = !isSimulated(attributes[vertex]) && neighbours.length > 0 && neighbours.every((neighbour) => !isSimulated(attributes[neighbour]));
    if (!isSimulated(attributes[vertex]) && !isInteriorFixed) mesh.fixedVerticesForCenter.push(vertex);
    if (isInteriorFixed) continue;
    lower = minimumVector(lower, positions[vertex]);
    upper = maximumVector(upper, positions[vertex]);
    boundedCount++;
  }
  return boundedCount ? scaleVector(addVectors(upper, lower), 0.5) : [0, 0, 0];
}

// Builds the chains. From each root the walk goes down through vertices that do not move; one whose children include a
// moving vertex starts a chain of itself and the moving vertices connected below it, depth first, and the walk does not
// go on below it. The chains are stored flat in chainData, each at chainStart with chainCount entries.
function createChains(mesh: ClothMesh): void {
  const attributes = mesh.attributes;
  const vertexOfId = new Map(mesh.transformIds.map((id, vertex) => [id, vertex]));
  mesh.parentIndices = new Int32Array(mesh.vertexCount);
  const children = new MultiMap<number, number>();
  for (let vertex = 0; vertex < mesh.vertexCount; vertex++) mesh.parentIndices[vertex] = vertexOfId.get(mesh.parentIds[vertex]) ?? -1;
  for (let vertex = 0; vertex < mesh.vertexCount; vertex++) if (mesh.parentIndices[vertex] >= 0) children.add(mesh.parentIndices[vertex], vertex);

  const includesLine: boolean[] = [];
  const starts: number[] = [];
  const counts: number[] = [];
  const data: number[] = [];
  for (const rootId of mesh.rootIds) {
    const rootStack = [vertexOfId.get(rootId) ?? -1];
    for (let startVertex = rootStack.pop(); startVertex !== undefined; startVertex = rootStack.pop()) {
      if (!isNotSimulated(attributes[startVertex])) continue;
      const startChildren = children.values(startVertex);
      if (!startChildren.some((child) => isSimulated(attributes[child]))) {
        for (const child of startChildren) if (isNotSimulated(attributes[child])) rootStack.push(child);
        continue;
      }

      // A chain includes a line when one of its vertices belongs to no triangle.
      const stack = [startVertex];
      const firstEntry = data.length;
      let includeLine = false;
      for (let vertex = stack.pop(); vertex !== undefined; vertex = stack.pop()) {
        data.push(vertex);
        if (!(attributes[vertex] & Attribute.InTriangle)) includeLine = true;
        for (const child of children.values(vertex)) if (!isNotSimulated(attributes[child])) stack.push(child);
      }
      includesLine.push(includeLine);
      starts.push(firstEntry);
      counts.push(data.length - firstEntry);
    }
  }

  mesh.chainIncludesLine = includesLine;
  mesh.chainStart = starts;
  mesh.chainCount = counts;
  mesh.chainData = data;
  mesh.childIndices = Array.from({ length: mesh.vertexCount }, (_, vertex) => children.values(vertex));
}

function pointNormalsAwayFromCenter({ mesh, center }: { mesh: ClothMesh; center: Vector3 }): void {
  const positions = mesh.localPositions;
  mesh.normalCorrectionRotations = Array.from({ length: mesh.vertexCount }, () => [0, 0, 0, 1]);
  for (let vertex = 0; vertex < mesh.vertexCount; vertex++) {
    const offset = subtractVectors(positions[vertex], center);
    if (length(offset) < fround(1e-8)) continue;
    const normal = normalize(offset);
    const localNormal = mesh.localNormals[vertex];
    const localTangent = mesh.localTangents[vertex];
    const localRotation = toRotation(localNormal, localTangent);
    // The old tangent made perpendicular to the new normal; when the two nearly point the same way, a tangent derived
    // from the old bitangent (localNormal × localTangent) instead.
    const tangent =
      dot(normal, localTangent) < fround(0.99)
        ? normalize(cross(normalize(cross(normal, localTangent)), normal))
        : normalize(cross(normalize(cross(localNormal, localTangent)), normal));
    mesh.localNormals[vertex] = normal;
    mesh.localTangents[vertex] = tangent;
    mesh.normalCorrectionRotations[vertex] = multiplyQuaternions(invertQuaternion(localRotation), toRotation(normal, tangent));
  }
}

function createBindPoses(mesh: ClothMesh): void {
  mesh.particleToBoneRotations = [];
  mesh.vertexInverseRestPositions = [];
  mesh.vertexInverseRestRotations = [];
  for (let vertex = 0; vertex < mesh.vertexCount; vertex++) {
    const vertexRotation = toRotation(mesh.localNormals[vertex], mesh.localTangents[vertex]);
    const transformRotation = multiplyQuaternions(mesh.restInverseRotation, mesh.transformRotations[vertex]);
    mesh.particleToBoneRotations.push(multiplyQuaternions(invertQuaternion(vertexRotation), transformRotation));
    mesh.vertexInverseRestPositions.push(negateVector(mesh.localPositions[vertex]));
    mesh.vertexInverseRestRotations.push(invertQuaternion(vertexRotation));
  }
}

function createChainPose(mesh: ClothMesh): void {
  const positions = mesh.localPositions;
  mesh.vertexLocalPositions = Array.from({ length: mesh.vertexCount }, () => [0, 0, 0]);
  mesh.vertexLocalRotations = Array.from({ length: mesh.vertexCount }, () => [0, 0, 0, 1]);
  for (const vertex of mesh.chainData) {
    const parent = mesh.parentIndices[vertex];
    if (parent < 0) continue;
    const inverseParentRotation = invertQuaternion(toRotation(mesh.localNormals[parent], mesh.localTangents[parent]));
    const vertexRotation = toRotation(mesh.localNormals[vertex], mesh.localTangents[vertex]);
    const localPosition = rotateVector(inverseParentRotation, subtractVectors(positions[vertex], positions[parent]));
    mesh.vertexLocalPositions[vertex] = localPosition;
    mesh.vertexLocalRotations[vertex] = multiplyQuaternions(inverseParentRotation, vertexRotation);
    if (isZeroDistance(localPosition)) mesh.attributes[vertex] |= Attribute.CoincidentWithParent;
  }
}

// A moving vertex's root is its first ancestor that does not move (its topmost ancestor when all move), and its depth
// is the distance along the chain to that root divided by the longest such distance. Vertices that do not move, or
// have no parent, get root -1 and depth 0; all depths stay 0 when no chain is longer than 1e-8.
function assignChainRootsAndDepths(mesh: ClothMesh): void {
  const attributes = mesh.attributes;
  const positions = mesh.localPositions;
  mesh.depths = Array.from({ length: mesh.vertexCount }, () => 0);
  mesh.rootIndices = new Int32Array(mesh.vertexCount);
  const chainLengths = Array.from({ length: mesh.vertexCount }, () => 0);
  let longestChain = 0;
  for (let vertex = 0; vertex < mesh.vertexCount; vertex++) {
    let root = -1;
    let chainLength = 0;
    if (isSimulated(attributes[vertex])) {
      let current = vertex;
      let parent = mesh.parentIndices[current];
      while (parent >= 0) {
        chainLength = add(chainLength, distance(positions[current], positions[parent]));
        root = parent;
        if (!isSimulated(attributes[parent])) break;
        current = parent;
        parent = mesh.parentIndices[current];
      }
    }
    mesh.rootIndices[vertex] = root;
    chainLengths[vertex] = chainLength;
    longestChain = maximum(longestChain, chainLength);
  }

  if (longestChain <= fround(1e-8)) return;
  for (let vertex = 0; vertex < mesh.vertexCount; vertex++) mesh.depths[vertex] = saturate(divide(chainLengths[vertex], longestChain));
}
