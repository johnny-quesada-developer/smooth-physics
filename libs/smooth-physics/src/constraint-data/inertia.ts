import { addVectors, normalize, type ReadonlyVector3, type Vector3 } from '../float32/vector.ts';
import { invertQuaternion, multiplyQuaternions, rotateVector } from '../float32/quaternion.ts';
import { toNormal, toRotation, toTangent } from '../float32/geometry.ts';
import type { ClothMesh } from '../cloth-mesh/types.ts';

export type InertiaData = { readonly restLocalGravityDirection: Vector3 };

// The gravity direction in the rest frame of the center: the mean orientation of the fixed vertices for the center,
// or straight down when there are none.
export function createInertiaData({ mesh, worldGravityDirection }: { mesh: ClothMesh; worldGravityDirection: ReadonlyVector3 }): InertiaData {
  if (!mesh.fixedVerticesForCenter.length) return { restLocalGravityDirection: [0, -1, 0] };
  let normalSum: Vector3 = [0, 0, 0];
  let tangentSum: Vector3 = [0, 0, 0];
  for (const vertex of mesh.fixedVerticesForCenter) {
    const rotation = multiplyQuaternions(toRotation(mesh.localNormals[vertex], mesh.localTangents[vertex]), mesh.vertexInverseRestRotations[vertex]);
    normalSum = addVectors(normalSum, toNormal(rotation));
    tangentSum = addVectors(tangentSum, toTangent(rotation));
  }
  const inverseRotation = invertQuaternion(toRotation(normalize(normalSum), normalize(tangentSum)));
  return { restLocalGravityDirection: rotateVector(inverseRotation, worldGravityDirection) };
}
