// Picks up a grabbable prop under the pointer and turns pointer movement into a target in world space. The pointer
// that holds a prop never reaches the orbit controls, and the orbit controls ignore every pointer while one is held.
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { isShown, type GrabInput, type GrabPoint } from './propGrabs';
import type { GrabPlane } from './types';

// A fingertip is wider than a mouse pointer: a touch this close to a prop's edge, in CSS pixels, still picks it up.
const TOUCH_REACH = 18;
const PEN_REACH = 6;
const REACH_SAMPLES = 8;
// A scene's grab plane seen more edge-on than this (the cosine of 60°) would turn small pointer moves into long jumps,
// so the plane faces the camera instead.
const FACING_LIMIT = 0.5;

type Drag = { readonly pointerId: number; readonly floor: number; readonly input: GrabInput };

export type Bounds = { readonly center: THREE.Vector3; readonly radius: number };

export default class PointerGrab {
  private readonly host: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: THREE.Camera;
  private readonly objects: readonly THREE.Object3D[];
  private readonly orbit: OrbitControls;
  private readonly bounds: Bounds;
  private readonly canGrab: () => boolean;
  private readonly facing: { readonly normal: THREE.Vector3; readonly minimum: number } | null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly plane = new THREE.Plane();
  private readonly center = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly point = new THREE.Vector3();
  private readonly box = new THREE.Box3();
  private readonly sphere = new THREE.Sphere();
  private readonly hits: THREE.Intersection[] = [];
  private readonly target: GrabPoint = [0, 0, 0];
  private drag: Drag | null = null;

  constructor({
    host,
    canvas,
    camera,
    objects,
    orbit,
    bounds,
    canGrab,
    plane,
  }: {
    host: HTMLElement;
    canvas: HTMLCanvasElement;
    camera: THREE.Camera;
    objects: readonly THREE.Object3D[];
    orbit: OrbitControls;
    bounds: Bounds;
    canGrab: () => boolean;
    plane?: GrabPlane;
  }) {
    this.host = host;
    this.canvas = canvas;
    this.camera = camera;
    this.objects = objects;
    this.orbit = orbit;
    this.bounds = bounds;
    this.canGrab = canGrab;
    this.facing = plane ? { normal: new THREE.Vector3(...plane.normal).normalize(), minimum: plane.minimum } : null;
    // Capture on the host runs before the orbit controls' own listener on the canvas.
    host.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    host.addEventListener('pointermove', this.onPointerMove);
    host.addEventListener('pointerup', this.onPointerEnd);
    host.addEventListener('pointercancel', this.onPointerEnd);
    host.addEventListener('lostpointercapture', this.onPointerEnd);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
  }

  get dragging(): boolean {
    return this.drag !== null;
  }

  get input(): GrabInput | null {
    return this.drag?.input ?? null;
  }

  dispose(): void {
    this.host.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    this.host.removeEventListener('pointermove', this.onPointerMove);
    this.host.removeEventListener('pointerup', this.onPointerEnd);
    this.host.removeEventListener('pointercancel', this.onPointerEnd);
    this.host.removeEventListener('lostpointercapture', this.onPointerEnd);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.drag) {
      event.stopPropagation();
      return;
    }
    // A second finger, a right click or a paused stage goes to the orbit controls, and a press on a button over the
    // stage to the button.
    if (!event.isPrimary || event.button !== 0 || event.target !== this.canvas || !this.canGrab()) return;
    const index = this.pick(event);
    const object = this.objects[index];
    if (!object) return;
    // The prop moves in the scene's grab plane or in the plane through its center that faces the camera, and keeps its
    // offset from the pointer within that plane.
    object.getWorldPosition(this.center);
    this.placePlane(this.camera.getWorldDirection(this.offset));
    const start = this.onPlane(event);
    if (!start) return;
    event.stopPropagation();
    event.preventDefault();
    this.offset.subVectors(this.center, start).projectOnPlane(this.plane.normal);
    start.add(this.offset).toArray(this.target);
    // The prop rests on the floor at the lowest, which is at y = 0 on every stage.
    this.box.setFromObject(object).getBoundingSphere(this.sphere);
    this.drag = { pointerId: event.pointerId, floor: this.sphere.radius, input: { index, target: this.target } };
    this.orbit.enabled = false;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.style.cursor = 'grabbing';
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag) {
      if (event.pointerType === 'mouse' && event.buttons === 0) this.canvas.style.cursor = this.canGrab() && this.pick(event) >= 0 ? 'grab' : '';
      return;
    }
    if (event.pointerId !== drag.pointerId) return;
    const point = this.onPlane(event);
    if (!point) return;
    point.add(this.offset);
    // The prop stays on the stage, above the floor and within reach of the camera's target.
    point.y = Math.max(point.y, drag.floor);
    const { center, radius } = this.bounds;
    const away = point.distanceTo(center);
    if (away > radius)
      point
        .sub(center)
        .multiplyScalar(radius / away)
        .add(center);
    point.toArray(this.target);
  };

  private readonly onPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.drag?.pointerId) return;
    this.drag = null;
    this.orbit.enabled = true;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    this.canvas.style.cursor = event.pointerType === 'mouse' && this.pick(event) >= 0 ? 'grab' : '';
  };

  private readonly onPointerLeave = (): void => {
    if (!this.drag) this.canvas.style.cursor = '';
  };

  // The index of the shown grabbable prop under the pointer, or -1. Touch and pen also try a ring around the point.
  private pick(event: PointerEvent): number {
    const reach = event.pointerType === 'touch' ? TOUCH_REACH : event.pointerType === 'pen' ? PEN_REACH : 0;
    for (let sample = 0; sample <= (reach ? REACH_SAMPLES : 0); sample++) {
      const angle = (sample / REACH_SAMPLES) * Math.PI * 2,
        distance = sample === 0 ? 0 : reach;
      this.aim({ event, x: Math.cos(angle) * distance, y: Math.sin(angle) * distance });
      let nearest = -1,
        nearestDistance = Infinity;
      this.objects.forEach((object, index) => {
        if (!isShown(object)) return;
        this.hits.length = 0;
        this.raycaster.intersectObject(object, true, this.hits);
        const hit = this.hits.find((candidate) => isShown(candidate.object));
        if (hit && hit.distance < nearestDistance) {
          nearest = index;
          nearestDistance = hit.distance;
        }
      });
      if (nearest >= 0) return nearest;
    }
    return -1;
  }

  // A grab plane in front of the prop moves it forward onto the plane as it is picked up.
  private placePlane(view: THREE.Vector3): void {
    const facing = this.facing;
    if (facing && Math.abs(view.dot(facing.normal)) >= FACING_LIMIT) this.plane.set(facing.normal, -Math.max(facing.normal.dot(this.center), facing.minimum));
    else this.plane.setFromNormalAndCoplanarPoint(view, this.center);
  }

  // Where the pointer's ray meets the drag plane, in this.point, or null when the ray runs parallel to it.
  private onPlane(event: PointerEvent): THREE.Vector3 | null {
    this.aim({ event, x: 0, y: 0 });
    return this.raycaster.ray.intersectPlane(this.plane, this.point);
  }

  private aim({ event, x, y }: { event: PointerEvent; x: number; y: number }): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((event.clientX + x - rect.left) / rect.width) * 2 - 1, -((event.clientY + y - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }
}
