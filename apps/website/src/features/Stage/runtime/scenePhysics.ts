// Runs a scene definition's physics without a renderer, for a Web Worker. The page builds the same scene, so both
// trees list their objects in the same traversal order and one frame is just their local transforms.
import { Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import { createThreeCloth, type ThreeClothAdapter } from 'smooth-physics/three';
import PropGrabs, { type GrabInput } from './propGrabs';
import type { SceneDefinition, StageStatistics } from './types';

export type RemoteStart = { readonly objects: number };
// grab is the prop the reader holds on the page, applied here because this is where the scene animates.
export type RemoteStep = { readonly deltaTime: number; readonly time: number; readonly grab: GrabInput | null };
export type RemoteFrame = {
  // Position xyz and quaternion xyzw for every object under the scene root, in traversal order.
  readonly transforms: Float32Array;
  readonly statistics: Omit<StageStatistics, 'framesPerSecond' | 'thread'>;
};
export const TRANSFORM_STRIDE = 7;

export function sceneObjects(root: Object3D): Object3D[] {
  const objects: Object3D[] = [];
  root.traverse((object) => objects.push(object));
  return objects;
}

export function createScenePhysics(createDefinition: () => SceneDefinition): { start: () => RemoteStart; step: (input: RemoteStep) => RemoteFrame } {
  let definition: SceneDefinition | null = null;
  let cloth: ThreeClothAdapter | null = null;
  let grabs = new PropGrabs([]);
  let objects: Object3D[] = [];
  let transforms = new Float32Array(0);
  return {
    start: () => {
      definition = createDefinition();
      const { options = {}, ...spec } = definition.setup({});
      definition.root.updateMatrixWorld(true);
      cloth = createThreeCloth({ three: { Matrix4, Quaternion, Vector3 }, root: definition.root, spec, options });
      definition.configure?.({ values: {}, cloth });
      grabs = new PropGrabs(definition.grabbable ?? []);
      objects = sceneObjects(definition.root);
      transforms = new Float32Array(objects.length * TRANSFORM_STRIDE);
      return { objects: objects.length };
    },
    step: ({ deltaTime, time, grab }) => {
      if (!definition || !cloth) throw new Error('The scene physics has not started.');
      cloth.restore();
      definition.animate({ values: {}, time, deltaTime, cloth });
      grabs.apply({ grab, deltaTime });
      cloth.update({ deltaTime, root: definition.root });
      objects.forEach((object, index) => {
        const offset = index * TRANSFORM_STRIDE;
        transforms[offset] = object.position.x;
        transforms[offset + 1] = object.position.y;
        transforms[offset + 2] = object.position.z;
        transforms[offset + 3] = object.quaternion.x;
        transforms[offset + 4] = object.quaternion.y;
        transforms[offset + 5] = object.quaternion.z;
        transforms[offset + 6] = object.quaternion.w;
      });
      const system = cloth.system;
      return {
        transforms,
        statistics: {
          physicsMilliseconds: system.stats.frameMs,
          particles: system.stats.particles,
          stepsPerFrame: system.stats.steps,
          contacts: system.stats.contacts,
          frequency: system.frequency,
          precision: system.precision,
          quality: system.quality.level,
        },
      };
    },
  };
}
