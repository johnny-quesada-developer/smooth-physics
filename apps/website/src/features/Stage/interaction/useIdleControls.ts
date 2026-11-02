import { useEffect, useState, type RefObject } from 'react';

const HIDE_AFTER_MS = 2500;
const WAKE_EVENTS = ['pointerdown', 'pointermove', 'focusin'] as const;

// While a stage fills the screen, its controls step aside after a while without use and come back on a tap, a pointer
// movement or a key, as a video player's do. Keyboard focus inside them keeps them in view, and a tap that brings them
// back presses none of them. area takes the pointer and focus events, and keys count wherever focus is; controls holds
// what hides.
export default function useIdleControls({
  enabled,
  area,
  controls,
}: {
  enabled: boolean;
  area: RefObject<HTMLElement | null>;
  controls: RefObject<HTMLElement | null>;
}): boolean {
  const [shown, setShown] = useState(true);
  const [wasEnabled, setWasEnabled] = useState(enabled);
  // Each full-screen view starts with its controls in view.
  if (enabled !== wasEnabled) {
    setWasEnabled(enabled);
    setShown(true);
  }

  useEffect(() => {
    const element = area.current;
    if (!enabled || !element) return undefined;
    let timer = 0,
      hidden = false,
      waking = false;
    const schedule = (): void => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (controls.current?.querySelector(':focus-visible')) {
          schedule();
          return;
        }
        hidden = true;
        setShown(false);
      }, HIDE_AFTER_MS);
    };
    const wake = (event: Event): void => {
      // The click after a tap is aimed where the tap landed once the controls are back, so it could reach one of them.
      if (event.type === 'pointerdown') waking = hidden;
      else if (event.type === 'keydown') waking = false;
      hidden = false;
      setShown(true);
      schedule();
    };
    const onClick = (event: MouseEvent): void => {
      if (!waking) return;
      waking = false;
      if (event.target instanceof Node && controls.current?.contains(event.target)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    schedule();
    for (const type of WAKE_EVENTS) element.addEventListener(type, wake);
    element.addEventListener('click', onClick, { capture: true });
    document.addEventListener('keydown', wake);
    return () => {
      clearTimeout(timer);
      for (const type of WAKE_EVENTS) element.removeEventListener(type, wake);
      element.removeEventListener('click', onClick, { capture: true });
      document.removeEventListener('keydown', wake);
    };
  }, [enabled, area, controls]);

  return !enabled || shown;
}
