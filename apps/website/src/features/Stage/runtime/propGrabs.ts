// Moves the props a reader holds. It runs wherever the scene animates, on the page or in the physics worker, so the
// cloth always collides with the prop where the reader sees it.
import { MathUtils, Vector3, type Object3D } from 'three';

export type GrabPoint = [number, number, number];
// The grabbable prop the pointer holds, by its index in SceneDefinition.grabbable, and where the reader wants it, in
// world space.
export type GrabInput = { readonly index: number; readonly target: Readonly<GrabPoint> };

// The held prop closes about 95% of the gap to the pointer in 0.1 s.
const FOLLOW_RATE = 30;
// A flick sweeps the prop through the cloth over several steps instead of jumping past it in one.
const MAXIMUM_SPEED = 8;
const RETURN_SECONDS = 0.8;

type Hold = { phase: 'free' | 'held' | 'returning'; readonly position: Vector3; readonly from: Vector3; elapsed: number };

export default class PropGrabs {
  private readonly objects: readonly Object3D[];
  private readonly holds: readonly Hold[];
  private readonly animated = new Vector3();
  private readonly target = new Vector3();

  constructor(objects: readonly Object3D[]) {
    this.objects = objects;
    this.holds = objects.map(() => ({ phase: 'free', position: new Vector3(), from: new Vector3(), elapsed: 0 }));
  }

  // After the scene animated and before the cloth updates. A held prop follows the pointer; a released one eases from
  // where it was dropped onto its animated path, which keeps moving meanwhile.
  apply({ grab, deltaTime }: { grab: GrabInput | null; deltaTime: number }): void {
    this.objects.forEach((object, index) => {
      const hold = this.holds[index];
      if (!hold) return;
      if (!isShown(object)) {
        hold.phase = 'free';
        return;
      }
      object.getWorldPosition(this.animated);
      if (grab?.index === index) {
        if (hold.phase === 'free') hold.position.copy(this.animated);
        hold.phase = 'held';
        follow({ position: hold.position, target: this.target.set(grab.target[0], grab.target[1], grab.target[2]), deltaTime });
        place({ object, world: hold.position });
        return;
      }
      if (hold.phase === 'held') {
        hold.phase = 'returning';
        hold.from.copy(hold.position);
        hold.elapsed = 0;
      }
      if (hold.phase !== 'returning') return;
      hold.elapsed += deltaTime;
      const progress = Math.min(hold.elapsed / RETURN_SECONDS, 1);
      hold.position.lerpVectors(hold.from, this.animated, MathUtils.smootherstep(progress, 0, 1));
      place({ object, world: hold.position });
      if (progress === 1) hold.phase = 'free';
    });
  }
}

function follow({ position, target, deltaTime }: { position: Vector3; target: Vector3; deltaTime: number }): void {
  const gap = position.distanceTo(target);
  if (gap === 0) return;
  const step = Math.min(gap * (1 - Math.exp(-FOLLOW_RATE * deltaTime)), MAXIMUM_SPEED * deltaTime);
  position.lerp(target, step / gap);
}

// getWorldPosition has just refreshed the parent's world matrix.
function place({ object, world }: { object: Object3D; world: Vector3 }): void {
  object.position.copy(world);
  object.parent?.worldToLocal(object.position);
}

export function isShown(object: Object3D): boolean {
  for (let current: Object3D | null = object; current; current = current.parent) if (!current.visible) return false;
  return true;
}
