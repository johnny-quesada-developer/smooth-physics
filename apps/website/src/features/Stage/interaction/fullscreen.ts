// The Fullscreen API, with the prefixed variant that Safari on macOS and iPad shipped before the standard one.
type PrefixedDocument = Document & {
  readonly webkitFullscreenEnabled?: boolean;
  readonly webkitFullscreenElement?: Element | null;
  readonly webkitExitFullscreen?: () => Promise<void> | undefined;
};
type PrefixedElement = HTMLElement & { readonly webkitRequestFullscreen?: () => Promise<void> | undefined };

export const FULLSCREEN_EVENTS = ['fullscreenchange', 'webkitfullscreenchange'] as const;

export class FullscreenUnavailableError extends Error {
  constructor() {
    super('This browser cannot show the page full screen.');
    this.name = 'FullscreenUnavailableError';
  }
}

export function fullscreenElement(): Element | null {
  const prefixed: PrefixedDocument = document;
  return document.fullscreenElement ?? prefixed.webkitFullscreenElement ?? null;
}

// Tries the standard call, then the webkit-prefixed one, which some iPad Safari versions honour when they refuse the
// standard call. Throws the browser's own refusal, or FullscreenUnavailableError where neither exists, such as on iPhone
// Safari, which offers full screen for video only.
export async function requestFullscreen(element: HTMLElement): Promise<void> {
  const prefixed: PrefixedElement = element;
  let refusal: unknown = new FullscreenUnavailableError();
  if (typeof element.requestFullscreen === 'function') {
    try {
      await element.requestFullscreen();
      return;
    } catch (error) {
      refusal = error;
    }
  }
  if (prefixed.webkitRequestFullscreen) {
    try {
      await prefixed.webkitRequestFullscreen();
      return;
    } catch (error) {
      refusal = error;
    }
  }
  throw refusal;
}

export async function exitFullscreen(): Promise<void> {
  const prefixed: PrefixedDocument = document;
  if (document.fullscreenElement) await document.exitFullscreen();
  else await prefixed.webkitExitFullscreen?.();
}
