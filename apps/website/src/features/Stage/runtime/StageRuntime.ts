import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SmoothPhysicsError, tuneCloth } from 'smooth-physics';
import { createThreeCloth, type ThreeClothAdapter } from 'smooth-physics/three';
import ClothSurfaces from './ClothSurfaces';
import ColliderShapes from './ColliderShapes';
import { FIELD_OF_VIEW } from './fieldOfView';
import PointerGrab from './PointerGrab';
import PropGrabs from './propGrabs';
import { paintProps } from './props';
import type { RemotePhysics } from './remotePhysics';
import { sceneObjects, TRANSFORM_STRIDE, type RemoteFrame } from './scenePhysics';
import SubjectFraming from './SubjectFraming';
import { readStagePalette, shadowOpacity, watchTheme, type StagePalette } from './themeColors';
import type { ControlTiming, ControlValues, SceneDefinition, StageStatistics } from './types';

export type StageRuntimeOptions = {
  readonly canvas: HTMLCanvasElement;
  readonly host: HTMLElement;
  readonly definition: SceneDefinition;
  readonly timings: Readonly<Record<string, ControlTiming>>;
  readonly values: ControlValues;
  // Orbit controls, and pointer grabbing for the scene's grabbable props. Without it the camera sways on its own.
  readonly interactive: boolean;
  // An interactive camera that sways on its own until the reader orbits, zooms or grabs a prop.
  readonly cameraSway?: boolean;
  // False leaves the mouse wheel to the page, for a stage the reader scrolls past; pinch and Ctrl + wheel still zoom.
  readonly wheelZoom?: boolean;
  readonly paused: boolean;
  readonly onStatistics?: (statistics: StageStatistics) => void;
  readonly onProblem?: (message: string) => void;
  // Physics in a Web Worker: the page only applies each finished frame and keeps drawing. Live controls are not
  // forwarded to the worker, so it suits scenes without them, such as the hero.
  readonly remote?: RemotePhysics;
};

const STATISTICS_INTERVAL_MS = 250;
const MAXIMUM_DELTA_TIME = 1 / 20;

export default class StageRuntime {
  private readonly options: StageRuntimeOptions;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 0.05, 60);
  private readonly floor: THREE.Mesh<THREE.CircleGeometry, THREE.ShadowMaterial>;
  private readonly colliderShapes: ColliderShapes;
  private readonly orbit: OrbitControls | null;
  private readonly grabs: PropGrabs;
  private readonly pointerGrab: PointerGrab | null;
  private readonly cleanups: (() => void)[] = [];
  private readonly framing: SubjectFraming;
  // How far the framing has moved the camera and the orbit's target so far.
  private readonly appliedShift = new THREE.Vector3();
  private readonly shiftStep = new THREE.Vector3();
  private subjectFitted = false;
  private palette: StagePalette;
  private values: ControlValues;
  private cloth: ThreeClothAdapter | null = null;
  private surfaces: ClothSurfaces | null = null;
  private paused: boolean;
  private swaying: boolean;
  private onScreen = true;
  private frame = 0;
  private time = 0;
  private lastFrameAt = 0;
  private statistics = { since: 0, frames: 0, physicsFrames: 0, physicsMilliseconds: 0 };
  private remoteObjects: THREE.Object3D[] = [];
  private remoteReady = false;
  private remoteGeneration = 0;
  private remoteStatistics: RemoteFrame['statistics'] | null = null;
  private inFlight = false;
  private pendingDelta = 0;
  // Cleared when the worker cannot run the scene; the page then simulates it itself.
  private remote: RemotePhysics | null;

  private constructor(options: StageRuntimeOptions) {
    this.options = options;
    this.values = options.values;
    this.paused = options.paused;
    this.swaying = !options.interactive || options.cameraSway === true;
    this.remote = options.remote ?? null;
    this.palette = readStagePalette(options.host);
    this.framing = new SubjectFraming(options.definition.camera);
    this.renderer = new THREE.WebGLRenderer({ canvas: options.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    // The floor draws shadows only, so the stage has no tinted ground fading into the page.
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.ShadowMaterial({ opacity: shadowOpacity() }));
    this.colliderShapes = new ColliderShapes({ color: this.palette.focus });
    this.orbit = options.interactive ? createOrbit({ camera: this.camera, canvas: options.canvas, definition: options.definition }) : null;
    const grabbable = options.definition.grabbable ?? [];
    this.grabs = new PropGrabs(grabbable);
    this.pointerGrab = this.orbit && grabbable.length ? this.createPointerGrab({ orbit: this.orbit, objects: grabbable }) : null;
    this.buildStage();
    this.rebuild();
    this.observe();
    this.placeCamera({ time: 0, deltaTime: null });
    this.requestFrame();
  }

  static start(options: StageRuntimeOptions): StageRuntime {
    return new StageRuntime(options);
  }

  setValues(values: ControlValues): void {
    const previous = this.values;
    this.values = values;
    const changed = Object.keys(values).filter((key) => values[key] !== previous[key]);
    const timing = (key: string): ControlTiming => this.options.timings[key] ?? 'live';
    if (changed.some((key) => timing(key) === 'setup')) this.rebuild();
    else if (changed.some((key) => timing(key) === 'tuning')) this.retune();
    this.configure();
    // A paused stage shows the change at once, such as cloth back in its rest pose when its physics is turned off.
    if (!this.running) this.redraw();
  }

  act(action: string): void {
    if (this.cloth) this.options.definition.act?.({ action, cloth: this.cloth });
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.requestFrame();
  }

  // While the stage fills a phone's screen, the camera shows the scene's subject as large as the screen allows, centred,
  // in either orientation; elsewhere it keeps the scene's composed framing.
  fitSubject(fitted: boolean): void {
    if (fitted === this.subjectFitted) return;
    this.subjectFitted = fitted;
    this.placeCamera({ time: this.time, deltaTime: null });
    this.requestFrame();
  }

  setCollidersVisible(visible: boolean): void {
    this.colliderShapes.group.visible = visible;
    this.requestFrame();
  }

  reset(): void {
    this.time = 0;
    this.rebuild();
    this.requestFrame();
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    for (const cleanup of this.cleanups) cleanup();
    this.remoteGeneration++;
    this.remote?.dispose();
    this.cloth?.restore();
    this.surfaces?.dispose();
    this.colliderShapes.dispose();
    this.pointerGrab?.dispose();
    this.orbit?.dispose();
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
    });
    this.renderer.dispose();
  }

  private createPointerGrab({ orbit, objects }: { orbit: OrbitControls; objects: readonly THREE.Object3D[] }): PointerGrab {
    const { canvas, host, definition } = this.options;
    const { target, distance } = definition.camera;
    return new PointerGrab({
      host,
      canvas,
      camera: this.camera,
      objects,
      orbit,
      bounds: { center: new THREE.Vector3(target[0], target[1], target[2]), radius: distance * 0.7 },
      // A paused stage does not simulate, so a press there orbits instead.
      canGrab: () => this.running && this.cloth !== null,
      ...(definition.grabPlane ? { plane: definition.grabPlane } : {}),
    });
  }

  private buildStage(): void {
    const { definition } = this.options;
    // Warm, neutral light keeps the pastel fills close to their tokens; a tinted bounce or rim would shift their hue.
    this.scene.add(new THREE.HemisphereLight('#fffdf6', '#6b6b68', 1.7));
    const key = new THREE.DirectionalLight('#fffaf0', 2.1);
    key.position.set(2.5, 4.5, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -3;
    key.shadow.camera.bottom = -3;
    key.shadow.camera.right = 3;
    key.shadow.camera.top = 3;
    key.shadow.bias = -0.0005;
    const rim = new THREE.DirectionalLight('#f1f2ea', 0.8);
    rim.position.set(-3, 2, -3);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(key, rim, this.floor, definition.root, this.colliderShapes.group);
    paintProps({ root: definition.root, palette: this.palette });
  }

  private rebuild(): void {
    const { definition, onProblem } = this.options;
    this.cloth?.restore();
    this.surfaces?.dispose();
    this.surfaces = null;
    // The spec takes cloths and colliders only; system options are a separate argument.
    const { options = {}, ...spec } = definition.setup(this.values);
    definition.root.updateMatrixWorld(true);
    let cloth: ThreeClothAdapter;
    try {
      cloth = createThreeCloth({ three: THREE, root: definition.root, spec, options });
    } catch (error) {
      // The page shows why the example could not build; anything else is a bug and keeps propagating.
      if (!(error instanceof SmoothPhysicsError)) throw error;
      this.cloth = null;
      onProblem?.(error.message);
      return;
    }
    this.cloth = cloth;
    this.surfaces = new ClothSurfaces({ cloth, styles: definition.styles, palette: this.palette });
    this.scene.add(this.surfaces.group);
    this.colliderShapes.replace(spec.colliders);
    this.configure();
    this.pose(cloth);
    this.startRemote();
  }

  // Poses the scene at the current time and draws the cloth at rest, so a stage that starts paused is not empty.
  private pose(cloth: ThreeClothAdapter): void {
    const { definition } = this.options;
    definition.animate({ values: this.values, time: this.time, deltaTime: 0, cloth });
    definition.root.updateMatrixWorld(true);
    this.surfaces?.update();
  }

  private startRemote(): void {
    const { remote } = this;
    if (!remote) return;
    const generation = ++this.remoteGeneration;
    this.remoteReady = false;
    this.remoteObjects = sceneObjects(this.options.definition.root);
    remote
      .start()
      .then((started) => {
        if (generation !== this.remoteGeneration) return;
        if (started.objects === this.remoteObjects.length) this.remoteReady = true;
        else this.useLocalPhysics();
      })
      .catch(() => {
        if (generation === this.remoteGeneration) this.useLocalPhysics();
      });
  }

  private useLocalPhysics(): void {
    this.remote?.dispose();
    this.remote = null;
    this.remoteReady = false;
    this.pendingDelta = 0;
  }

  // Applies tuning settings to the running cloth; a change that needs new constraint data rebuilds it instead.
  private retune(): void {
    const settings = this.options.definition.tuning?.(this.values) ?? {};
    for (const simulation of this.cloth?.simulations ?? []) {
      const simulationSettings = settings[simulation.name];
      if (!simulationSettings) continue;
      tuneCloth({ simulation, settings: simulationSettings });
    }
  }

  private configure(): void {
    if (this.cloth) this.options.definition.configure?.({ values: this.values, cloth: this.cloth });
  }

  private observe(): void {
    const { host } = this.options;
    const resize = new ResizeObserver(() => this.resize());
    resize.observe(host);
    const visibility = new IntersectionObserver(([entry]) => {
      this.onScreen = entry?.isIntersecting ?? true;
      this.requestFrame();
    });
    visibility.observe(host);
    const onVisibilityChange = (): void => this.requestFrame();
    document.addEventListener('visibilitychange', onVisibilityChange);
    const stopWatchingTheme = watchTheme(() => this.applyPalette());
    // While paused, dragging the camera still has to redraw.
    const onOrbitChange = (): void => {
      if (!this.running) this.render();
    };
    this.orbit?.addEventListener('change', onOrbitChange);
    const onOrbitStart = (): void => {
      this.swaying = false;
    };
    this.orbit?.addEventListener('start', onOrbitStart);
    // A wheel turn reaches the orbit controls only with Ctrl, which a trackpad pinch sets; any other keeps scrolling the page.
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) event.stopPropagation();
    };
    if (this.orbit && this.options.wheelZoom === false) host.addEventListener('wheel', onWheel, { capture: true });
    this.cleanups.push(
      () => this.orbit?.removeEventListener('start', onOrbitStart),
      () => host.removeEventListener('wheel', onWheel, { capture: true }),
      () => resize.disconnect(),
      () => visibility.disconnect(),
      () => document.removeEventListener('visibilitychange', onVisibilityChange),
      stopWatchingTheme,
      () => this.orbit?.removeEventListener('change', onOrbitChange),
    );
    this.resize();
  }

  private resize(): void {
    const { width, height } = this.options.host.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.placeCamera({ time: this.time, deltaTime: null });
    this.camera.updateProjectionMatrix();
    this.render();
  }

  private applyPalette(): void {
    this.palette = readStagePalette(this.options.host);
    this.floor.material.opacity = shadowOpacity();
    this.colliderShapes.setColor(this.palette.focus);
    this.surfaces?.setPalette(this.palette);
    paintProps({ root: this.options.definition.root, palette: this.palette });
    this.render();
  }

  private get running(): boolean {
    return !this.paused && this.onScreen && document.visibilityState === 'visible';
  }

  private requestFrame(): void {
    cancelAnimationFrame(this.frame);
    this.lastFrameAt = 0;
    if (this.running) this.frame = requestAnimationFrame((now) => this.tick(now));
    else this.render();
  }

  private tick(now: number): void {
    const deltaTime = this.lastFrameAt ? Math.min((now - this.lastFrameAt) / 1000, MAXIMUM_DELTA_TIME) : 1 / 60;
    this.lastFrameAt = now;
    this.time += deltaTime;
    this.step(deltaTime);
    this.placeCamera({ time: this.time, deltaTime });
    this.render();
    this.report(now);
    if (this.running) this.frame = requestAnimationFrame((next) => this.tick(next));
  }

  private step(deltaTime: number): void {
    const { definition } = this.options;
    if (!this.cloth) return;
    if (this.remote) {
      this.stepRemote(this.remote, deltaTime);
      return;
    }
    this.cloth.restore();
    definition.animate({ values: this.values, time: this.time, deltaTime, cloth: this.cloth });
    this.grabs.apply({ grab: this.pointerGrab?.input ?? null, deltaTime });
    this.cloth.update({ deltaTime, root: definition.root });
    this.surfaces?.update();
    this.statistics.physicsFrames++;
    // A disabled cloth does not step, and its statistics still hold the last frame it did.
    if (this.cloth.enabled) this.statistics.physicsMilliseconds += this.cloth.system.stats.frameMs;
  }

  // One step in flight; frames the worker misses add their time to the next request, up to the usual cap.
  private stepRemote(remote: RemotePhysics, deltaTime: number): void {
    this.pendingDelta += deltaTime;
    if (!this.remoteReady || this.inFlight) return;
    const input = { deltaTime: Math.min(this.pendingDelta, MAXIMUM_DELTA_TIME), time: this.time, grab: this.pointerGrab?.input ?? null },
      generation = this.remoteGeneration;
    this.pendingDelta = 0;
    this.inFlight = true;
    remote
      .step(input)
      .then((frame) => {
        this.inFlight = false;
        if (generation === this.remoteGeneration) this.applyRemote(frame);
      })
      .catch(() => {
        this.inFlight = false;
        if (generation === this.remoteGeneration) this.useLocalPhysics();
      });
  }

  private applyRemote(frame: RemoteFrame): void {
    const transforms = frame.transforms;
    this.remoteObjects.forEach((object, index) => {
      const offset = index * TRANSFORM_STRIDE;
      object.position.set(transforms[offset] ?? 0, transforms[offset + 1] ?? 0, transforms[offset + 2] ?? 0);
      object.quaternion.set(transforms[offset + 3] ?? 0, transforms[offset + 4] ?? 0, transforms[offset + 5] ?? 0, transforms[offset + 6] ?? 1);
    });
    this.options.definition.root.updateMatrixWorld(true);
    this.surfaces?.update();
    this.remoteStatistics = frame.statistics;
    this.statistics.physicsFrames++;
    this.statistics.physicsMilliseconds += frame.statistics.physicsMilliseconds;
  }

  // Without a time step, as after a resize, the framing jumps to the stage's new shape instead of easing there.
  private placeCamera({ time, deltaTime }: { time: number; deltaTime: number | null }): void {
    // The camera holds still under a drag, so the prop moves in the plane the reader picked it up in.
    if (this.pointerGrab?.dragging) {
      this.swaying = false;
      return;
    }
    this.frameSubject(deltaTime);
    if (this.swaying) this.swayCamera(time);
    this.orbit?.update();
  }

  private frameSubject(deltaTime: number | null): void {
    const { framing, camera } = this;
    framing.update({ aspect: camera.aspect, subject: this.options.definition.subject?.() ?? null, fit: this.subjectFitted, deltaTime });
    this.shiftStep.subVectors(framing.shift, this.appliedShift);
    this.appliedShift.copy(framing.shift);
    this.orbit?.target.add(this.shiftStep);
    if (!this.swaying) camera.position.add(this.shiftStep);
    if (camera.fov === framing.fov) return;
    camera.fov = framing.fov;
    camera.updateProjectionMatrix();
  }

  private swayCamera(time: number): void {
    const { target, distance, height, azimuth = 0 } = this.options.definition.camera;
    const { shift } = this.framing;
    const angle = azimuth + Math.sin(time * 0.15) * 0.18;
    this.camera.position.set(target[0] + Math.sin(angle) * distance + shift.x, height + shift.y, target[2] + Math.cos(angle) * distance + shift.z);
    this.camera.lookAt(target[0] + shift.x, target[1] + shift.y, target[2] + shift.z);
  }

  private redraw(): void {
    this.options.definition.root.updateMatrixWorld(true);
    this.surfaces?.update();
    this.render();
  }

  private render(): void {
    if (this.colliderShapes.group.visible) this.colliderShapes.update();
    this.renderer.render(this.scene, this.camera);
  }

  private report(now: number): void {
    const statistics = this.statistics;
    statistics.frames++;
    if (!statistics.since) statistics.since = now;
    const elapsed = now - statistics.since;
    if (elapsed < STATISTICS_INTERVAL_MS || !this.cloth) return;
    const system = this.cloth.system,
      remote = this.remote ? this.remoteStatistics : null,
      physicsFrames = Math.max(statistics.physicsFrames, 1);
    // With a worker, the frames that count are the ones that brought new cloth, not the redraws in between.
    this.options.onStatistics?.({
      framesPerSecond: ((this.remote ? statistics.physicsFrames : statistics.frames) * 1000) / elapsed,
      physicsMilliseconds: statistics.physicsMilliseconds / physicsFrames,
      particles: remote?.particles ?? system.stats.particles,
      stepsPerFrame: remote?.stepsPerFrame ?? system.stats.steps,
      contacts: remote?.contacts ?? system.stats.contacts,
      frequency: remote?.frequency ?? system.frequency,
      precision: remote?.precision ?? system.precision,
      quality: remote?.quality ?? system.quality.level,
      thread: this.remote ? 'worker' : 'main',
    });
    this.statistics = { since: now, frames: 0, physicsFrames: 0, physicsMilliseconds: 0 };
  }
}

function createOrbit({
  camera,
  canvas,
  definition,
}: {
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  definition: SceneDefinition;
}): OrbitControls {
  const { target, distance, height, azimuth = 0 } = definition.camera;
  camera.position.set(target[0] + Math.sin(azimuth) * distance, height, target[2] + Math.cos(azimuth) * distance);
  const orbit = new OrbitControls(camera, canvas);
  orbit.target.set(target[0], target[1], target[2]);
  orbit.enableDamping = true;
  orbit.enablePan = false;
  orbit.minDistance = distance * 0.45;
  orbit.maxDistance = distance * 2.2;
  orbit.maxPolarAngle = Math.PI * 0.53;
  orbit.update();
  return orbit;
}
