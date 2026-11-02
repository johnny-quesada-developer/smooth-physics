import type { ThreadColor } from './types';

export type StagePalette = Readonly<Record<ThreadColor | 'ink' | 'line' | 'focus', string>>;

const VARIABLES: Readonly<Record<keyof StagePalette, string>> = {
  lime: '--color-lime-fill',
  honey: '--color-honey-fill',
  sage: '--color-sage-fill',
  stone: '--color-stone-fill',
  ink: '--color-ink',
  line: '--color-muted',
  focus: '--color-lime',
};

export function readStagePalette(host: HTMLElement): StagePalette {
  const probe = document.createElement('span');
  probe.hidden = true;
  host.append(probe);
  const read = (token: keyof StagePalette): string => {
    probe.style.color = `var(${VARIABLES[token]})`;
    return getComputedStyle(probe).color;
  };
  const palette: StagePalette = {
    lime: read('lime'),
    honey: read('honey'),
    sage: read('sage'),
    stone: read('stone'),
    ink: read('ink'),
    line: read('line'),
    focus: read('focus'),
  };
  probe.remove();
  return palette;
}

// The floor only receives shadows; they need more weight on a dark page.
export function shadowOpacity(): number {
  return document.documentElement.dataset['theme'] === 'dark' ? 0.45 : 0.14;
}

// Calls back when the page theme changes: the reader's switch or the system scheme.
export function watchTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  scheme.addEventListener('change', onChange);
  return () => {
    observer.disconnect();
    scheme.removeEventListener('change', onChange);
  };
}
