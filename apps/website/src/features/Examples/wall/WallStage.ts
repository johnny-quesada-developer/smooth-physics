import * as THREE from 'three';
import { FIELD_OF_VIEW, fieldOfView } from '@/features/Stage/runtime/fieldOfView';
import { createProp, paintProps } from '@/features/Stage/runtime/props';
import { readStagePalette, shadowOpacity, watchTheme } from '@/features/Stage/runtime/themeColors';
import type { WallSpec } from './wallSimulation';

// WebGL lines are one device pixel wide on every GPU, so the chains are drawn as flat ribbons facing the camera.
const RIBBON_WIDTH = 0.016;

export default class WallStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 0.05, 60);
  private readonly ribbons: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly ball: THREE.Mesh;
  private readonly floor: THREE.Mesh<THREE.CircleGeometry, THREE.ShadowMaterial>;
  private readonly host: HTMLElement;
  private readonly spec: WallSpec;
  private readonly cleanups: (() => void)[] = [];

  constructor({ canvas, host, spec }: { canvas: HTMLCanvasElement; host: HTMLElement; spec: WallSpec }) {
    this.host = host;
    this.spec = spec;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const vertices = spec.chains * spec.links * 2;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices * 3), 3));
    geometry.setAttribute(
      'normal',
      new THREE.BufferAttribute(
        new Float32Array(vertices * 3).map((_, index) => (index % 3 === 2 ? 1 : 0)),
        3,
      ),
    );
    geometry.setIndex(ribbonIndices(spec));
    this.ribbons = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0, side: THREE.DoubleSide }));
    this.ribbons.frustumCulled = false;
    this.ball = createProp({ geometry: new THREE.SphereGeometry(0.16, 32, 20), color: 'stone', roughness: 0.3 });
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.ShadowMaterial({ opacity: shadowOpacity() }));
    this.floor.rotation.x = -Math.PI / 2;
    const light = new THREE.DirectionalLight('#ffffff', 2.2);
    light.position.set(2, 4, 3);
    this.scene.add(new THREE.HemisphereLight('#fffdf6', '#6b6b68', 1.7), light, this.floor, this.ribbons, this.ball);
    this.camera.position.set(0.6, 1.4, 3.6);
    this.camera.lookAt(0, 1.3, 0);
    this.applyPalette();
    const resize = new ResizeObserver(() => this.resize());
    resize.observe(host);
    this.cleanups.push(
      () => resize.disconnect(),
      watchTheme(() => this.applyPalette()),
    );
    this.resize();
  }

  draw(positions: Float32Array): void {
    const attribute = this.ribbons.geometry.getAttribute('position');
    const count = this.spec.chains * this.spec.links;
    if (attribute instanceof THREE.BufferAttribute && positions.length >= count * 3 + 3) {
      writeRibbons({ positions, count, target: attribute.array });
      attribute.needsUpdate = true;
      this.ball.position.set(positions[count * 3] ?? 0, positions[count * 3 + 1] ?? 0, positions[count * 3 + 2] ?? 0);
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
    });
    this.renderer.dispose();
  }

  private applyPalette(): void {
    const palette = readStagePalette(this.host);
    this.ribbons.material.color.set(palette.sage);
    this.ribbons.material.emissive.set(palette.sage).multiplyScalar(0.18);
    this.floor.material.opacity = shadowOpacity();
    paintProps({ root: this.scene, palette });
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const { width, height } = this.host.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = fieldOfView({ aspect: this.camera.aspect });
    this.camera.updateProjectionMatrix();
  }
}

function ribbonIndices({ chains, links }: WallSpec): number[] {
  const indices: number[] = [];
  for (let chain = 0; chain < chains; chain++) {
    for (let link = 0; link < links - 1; link++) {
      const left = (chain * links + link) * 2;
      indices.push(left, left + 1, left + 2, left + 1, left + 3, left + 2);
    }
  }
  return indices;
}

// Each particle becomes two vertices, half a ribbon width either side along X: the chains hang in a plane facing the camera.
function writeRibbons({ positions, count, target }: { positions: Float32Array; count: number; target: THREE.TypedArray }): void {
  const half = RIBBON_WIDTH / 2;
  for (let particle = 0; particle < count; particle++) {
    const source = particle * 3,
      left = particle * 6;
    const x = positions[source] ?? 0,
      y = positions[source + 1] ?? 0,
      z = positions[source + 2] ?? 0;
    target[left] = x - half;
    target[left + 1] = y;
    target[left + 2] = z;
    target[left + 3] = x + half;
    target[left + 4] = y;
    target[left + 5] = z;
  }
}
