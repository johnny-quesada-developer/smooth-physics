import { add, fround, multiply } from '../float32/scalar.ts';
import { distance, length, subtractVectors, type Vector3 } from '../float32/vector.ts';
import { angleBetween, triangleArea } from '../float32/geometry.ts';
import { toDegrees } from '../float32/scalar.ts';
import { Connection } from './attributes.ts';
import { pairKey, sortedPair, sortedTriangle, triangleKey, type Pair, type Triangle } from './multi-map.ts';

const LARGEST = fround(3.4028235e38);
// A triangle's angle at the linking vertex must lie strictly between these, in degrees.
const TRIANGLE_VALID_ANGLE = 120;
const TRIANGLE_INVALID_ANGLE = 10;

type ConnectionInput = {
  readonly positions: readonly Vector3[];
  readonly idToIndex: ReadonlyMap<number, number>;
  readonly parentIds: readonly number[];
  readonly childIds: readonly (readonly number[])[];
  readonly rootIds: readonly number[];
  readonly mode: number;
};

// Links the bone chains into a mesh: each vertex links to its parent and children, then to nearby vertices of the same
// depth level. Pairs of a vertex's links become triangles, and the links no triangle was built from stay lines.
export function connectChains(input: ConnectionInput): { lines: Pair[]; triangles: Triangle[] } {
  const { positions, idToIndex, mode } = input;
  const sequential = mode === Connection.LoopMesh || mode === Connection.SequenceMesh;
  const { roots, loop } =
    mode === Connection.AutomaticMesh
      ? orderRootsByDistance({ positions, idToIndex, rootIds: input.rootIds })
      : { roots: [...input.rootIds], loop: mode === Connection.LoopMesh };
  const tree = linkTrees({ ...input, roots });
  linkNeighbours({ positions, tree, roots, loop, sequential });
  return buildTriangles({ positions, links: tree.links, mainEdges: tree.mainEdges, rootOf: tree.rootOf });
}

// Orders the roots as a nearest-neighbour walk. The walk extends from its last root while the next gap stays under 1.5
// times the smoothed gap, and on a longer gap reverses to extend from its other end. The roots form a loop when there
// are at least three and the ends are within 1.5 times the smoothed gap.
function orderRootsByDistance({
  positions,
  idToIndex,
  rootIds,
}: {
  positions: readonly Vector3[];
  idToIndex: ReadonlyMap<number, number>;
  rootIds: readonly number[];
}): { roots: number[]; loop: boolean } {
  const positionOf = (id: number): Vector3 => positions[idToIndex.get(id) ?? -1];
  const remaining = [...rootIds];
  const roots = [remaining[0]];
  let lastDistance = 0;
  while (remaining.length > 0) {
    const rootId = roots[roots.length - 1];
    // When the root is no longer listed, splice(-1, 1) drops the last entry; the chain order depends on it.
    remaining.splice(remaining.indexOf(rootId), 1);
    const rootPosition = positionOf(rootId);
    let nearestDistance = LARGEST;
    let nearestId = 0;
    for (const candidateId of remaining) {
      const candidateDistance = distance(rootPosition, positionOf(candidateId));
      if (candidateDistance < nearestDistance) {
        nearestDistance = candidateDistance;
        nearestId = candidateId;
      }
    }
    if (!nearestId) continue;

    // lastDistance is the smoothed gap: each accepted gap is averaged with it, and 0 restarts it.
    if (lastDistance === 0 || nearestDistance < multiply(lastDistance, 1.5)) {
      roots.push(nearestId);
      lastDistance = lastDistance === 0 ? nearestDistance : multiply(add(lastDistance, nearestDistance), 0.5);
    } else {
      roots.reverse();
      lastDistance = 0;
    }
  }

  const closes = roots.length >= 3 && distance(positionOf(roots[0]), positionOf(roots[roots.length - 1])) < multiply(lastDistance, 1.5);
  return { roots, loop: closes };
}

type LinkTree = {
  readonly links: number[][];
  readonly level: Int32Array;
  readonly rootOf: Int32Array;
  readonly levelLists: number[][];
  readonly mainEdges: Set<string>;
};

// Walks each root's tree depth first. links gets each vertex's parent and children, levelLists the vertices of each
// depth across all trees, and mainEdges every parent-child edge.
function linkTrees({ positions, idToIndex, parentIds, childIds, roots }: ConnectionInput & { roots: readonly number[] }): LinkTree {
  const vertexCount = positions.length;
  const links: number[][] = Array.from({ length: vertexCount }, () => []);
  const level = new Int32Array(vertexCount);
  const rootOf = new Int32Array(vertexCount);
  const levelLists: number[][] = [];
  const mainEdges = new Set<string>();
  roots.forEach((rootId, rootIndex) => {
    const stack = [rootId];
    const levelStack = [0];
    for (let id = stack.pop(), depth = levelStack.pop(); id !== undefined && depth !== undefined; id = stack.pop(), depth = levelStack.pop()) {
      const vertex = idToIndex.get(id) ?? -1;
      (levelLists[depth] ??= []).push(vertex);
      const link: number[] = [];
      const parent = idToIndex.get(parentIds[vertex]);
      if (parent !== undefined) {
        link.push(parent);
        mainEdges.add(pairKey(vertex, parent));
      }
      for (const childId of childIds[vertex]) {
        stack.push(childId);
        levelStack.push(depth + 1);
        const child = idToIndex.get(childId) ?? -1;
        link.push(child);
        mainEdges.add(pairKey(vertex, child));
      }
      links[vertex] = link;
      level[vertex] = depth;
      rootOf[vertex] = rootIndex;
    }
  });
  return { links, level, rootOf, levelLists, mainEdges };
}

function linkNeighbours({
  positions,
  tree,
  roots,
  loop,
  sequential,
}: {
  positions: readonly Vector3[];
  tree: LinkTree;
  roots: readonly number[];
  loop: boolean;
  sequential: boolean;
}): void {
  // The chains of the first and last root link only in a loop; sequential modes also keep non-adjacent roots apart.
  const lastRoot = roots.length - 1;
  const firstLastKey = pairKey(0, lastRoot);
  const isSkippedPair = (firstRoot: number, secondRoot: number): boolean => {
    const isFirstAndLast = firstLastKey === pairKey(firstRoot, secondRoot) && lastRoot > 0;
    if (!loop && isFirstAndLast) return true;
    return sequential && !(loop && isFirstAndLast) && Math.abs(firstRoot - secondRoot) > 1;
  };

  // Each vertex links to its nearest allowed vertex of the same level, then to every other allowed one within 1.5 times
  // that distance (at any distance in sequential modes). Coincident vertices are left out.
  for (let vertex = 0; vertex < positions.length; vertex++) {
    const sameLevel = tree.levelLists[tree.level[vertex]];
    const position = positions[vertex];
    const link = tree.links[vertex];
    let nearestDistance = LARGEST;
    let nearest = -1;
    for (const other of sameLevel) {
      if (other === vertex || isSkippedPair(tree.rootOf[vertex], tree.rootOf[other])) continue;
      const otherDistance = distance(position, positions[other]);
      if (otherDistance < fround(1e-6)) continue;
      if (otherDistance < nearestDistance) {
        nearestDistance = otherDistance;
        nearest = other;
      }
    }
    if (nearest < 0) continue;

    link.push(nearest);
    const reach = sequential ? LARGEST : multiply(nearestDistance, 1.5);
    for (const other of sameLevel) {
      if (other === vertex || other === nearest || isSkippedPair(tree.rootOf[vertex], tree.rootOf[other])) continue;
      const otherDistance = distance(position, positions[other]);
      if (otherDistance < fround(1e-6)) continue;
      if (otherDistance <= reach) link.push(other);
    }
  }
}

function buildTriangles({
  positions,
  links,
  mainEdges,
  rootOf,
}: {
  positions: readonly Vector3[];
  links: readonly number[][];
  mainEdges: ReadonlySet<string>;
  rootOf: Int32Array;
}): { lines: Pair[]; triangles: Triangle[] } {
  const edges = new Map<string, Pair>();
  const triangleEdges = new Set<string>();
  const triangles = new Map<string, Triangle>();
  for (let vertex = 0; vertex < positions.length; vertex++) {
    const link = links[vertex];
    if (!link.length) continue;
    for (const other of link) edges.set(pairKey(vertex, other), sortedPair(vertex, other));
    if (link.length === 1) continue;

    for (let firstIndex = 0; firstIndex < link.length - 1; firstIndex++) {
      for (let secondIndex = firstIndex + 1; secondIndex < link.length; secondIndex++) {
        const triangle = candidateTriangle({ positions, vertex, firstLink: link[firstIndex], secondLink: link[secondIndex], mainEdges, rootOf });
        if (!triangle) continue;
        const key = triangleKey(triangle);
        if (triangles.has(key)) continue;
        triangles.set(key, triangle);
        triangleEdges.add(pairKey(vertex, link[firstIndex]));
        triangleEdges.add(pairKey(vertex, link[secondIndex]));
      }
    }
  }

  // Links a triangle was built from are no lines.
  for (const edgeKey of triangleEdges) edges.delete(edgeKey);
  return { lines: [...edges.values()], triangles: [...triangles.values()] };
}

function candidateTriangle({
  positions,
  vertex,
  firstLink,
  secondLink,
  mainEdges,
  rootOf,
}: {
  positions: readonly Vector3[];
  vertex: number;
  firstLink: number;
  secondLink: number;
  mainEdges: ReadonlySet<string>;
  rootOf: Int32Array;
}): Triangle | null {
  const position = positions[vertex];
  const toFirst = subtractVectors(positions[firstLink], position);
  const toSecond = subtractVectors(positions[secondLink], position);
  if (!(triangleArea(position, positions[firstLink], positions[secondLink]) > fround(1e-6))) return null;
  if (length(toFirst) < fround(1e-6) || length(toSecond) < fround(1e-6)) return null;
  const angle = toDegrees(angleBetween(toFirst, toSecond));
  if (angle >= TRIANGLE_VALID_ANGLE || angle <= TRIANGLE_INVALID_ANGLE) return null;

  // A triangle spans at most two chains and uses at least one parent-child edge.
  const root = rootOf[vertex];
  const firstRoot = rootOf[firstLink];
  const secondRoot = rootOf[secondLink];
  if (firstRoot !== root && secondRoot !== root && firstRoot !== secondRoot) return null;
  const touchesChain = mainEdges.has(pairKey(vertex, firstLink)) || mainEdges.has(pairKey(vertex, secondLink)) || mainEdges.has(pairKey(firstLink, secondLink));
  if (!touchesChain) return null;
  return sortedTriangle(vertex, firstLink, secondLink);
}
