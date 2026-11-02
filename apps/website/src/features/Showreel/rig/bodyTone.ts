import * as THREE from 'three';

export type BodyTone = 'charcoal' | 'graphite';

type Shades = { readonly body: string; readonly detail: string };

// The stage palette has no colour for the fighters in both themes, so they carry their own: near black on a light
// page; on a dark one, a soft white lead and a light grey partner, which stand out from the dark stage and from each
// other while their shading stays readable.
const SHADES: Readonly<Record<BodyTone, Readonly<Record<'light' | 'dark', Shades>>>> = {
  charcoal: { light: { body: '#262b29', detail: '#3a403d' }, dark: { body: '#d6d9d4', detail: '#bec2bd' } },
  graphite: { light: { body: '#3a3d3f', detail: '#505457' }, dark: { body: '#999d9a', detail: '#848986' } },
};

export type ToneMaterials = {
  readonly body: THREE.MeshStandardMaterial;
  readonly detail: THREE.MeshStandardMaterial;
  // Called before each part is drawn: repaints the materials when the page theme has changed since the last draw,
  // so a theme switch shows on the next frame the stage draws, paused or not.
  readonly refresh: () => void;
};

export function bodyTone(tone: BodyTone): ToneMaterials {
  const body = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0 }),
    detail = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0 });
  let applied: string | undefined;
  const refresh = (): void => {
    const theme = document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light';
    if (theme === applied) return;
    applied = theme;
    body.color.set(SHADES[tone][theme].body);
    detail.color.set(SHADES[tone][theme].detail);
  };
  refresh();
  return { body, detail, refresh };
}
