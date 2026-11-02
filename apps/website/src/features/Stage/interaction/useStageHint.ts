import { useCallback, useEffect, useState, type RefObject } from 'react';

// Once the reader has dragged one stage, they know the others move too: no stage shows its hint again this session.
const STORAGE_KEY = 'stage-hint-dismissed';
const SHOWN_MS = 5000;
const dismissals = new Set<() => void>();

export type StageHint = { readonly shown: boolean; readonly touch: boolean; readonly dismiss: () => void };

// Shows the hint after hydration, unless the reader already interacted, and hides it a few seconds after the stage
// came into view.
export default function useStageHint({ place, enabled }: { place: RefObject<HTMLElement | null>; enabled: boolean }): StageHint {
  const [shown, setShown] = useState(false);
  const [touch, setTouch] = useState(false);

  useEffect(() => {
    const element = place.current;
    if (!enabled || !element || readDismissed()) return undefined;
    setTouch(matchMedia('(pointer: coarse)').matches);
    setShown(true);
    const hide = (): void => setShown(false);
    dismissals.add(hide);
    let timer = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        timer = window.setTimeout(hide, SHOWN_MS);
      },
      { threshold: 0.5 },
    );
    observer.observe(element);
    return () => {
      dismissals.delete(hide);
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [enabled, place]);

  const dismiss = useCallback(() => {
    storeDismissed();
    for (const hide of dismissals) hide();
  }, []);

  return { shown, touch, dismiss };
}

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function storeDismissed(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // Storage may be refused, as in some private windows; the hint then only stays hidden on this page.
  }
}
