// On a phone turned to landscape, the stage the reader is watching fills the screen, and turning back restores the
// page. The Fullscreen API cannot do it: it needs a user gesture, and iPhone Safari offers it for video only. The
// stage becomes a fixed layer over the page instead, and every stage on the page shares one coordinator, so only the
// one most in view takes the screen. The same layer stands in for a stage's full-screen button where the page cannot
// go full screen.
const LANDSCAPE_PHONE = '(orientation: landscape) and (pointer: coarse) and (max-height: 500px)';
// Only in landscape does iPhone Safari hide its bars, so a layer open in portrait asks the reader to turn the phone.
export const PORTRAIT_PHONE = '(orientation: portrait) and (pointer: coarse) and (max-width: 500px)';
const MINIMUM_SHARE = 0.5;
const THRESHOLDS = [0, 0.25, 0.5, 0.75, 1];

type Stage = { readonly place: HTMLElement; readonly onChange: (immersive: boolean) => void; share: number };
type Exit = 'rotation' | 'close';

class ImmersiveStages {
  private readonly stages = new Map<Element, Stage>();
  private readonly query = matchMedia(LANDSCAPE_PHONE);
  private readonly observer = new IntersectionObserver((entries) => this.measure(entries), { threshold: THRESHOLDS });
  private active: Stage | null = null;
  // Where the page was before the phone turned, so turning back lands where the reader was.
  private portraitScroll = scrollY;
  // Where the page was when the full-screen button opened the layer, and in which orientation. Such a layer stays open
  // in either orientation until the reader closes it, as a video does.
  private opened: { readonly scroll: number; readonly landscape: boolean } | null = null;

  constructor() {
    this.query.addEventListener('change', this.onOrientation);
    addEventListener('scroll', this.onScroll, { passive: true });
    document.addEventListener('keydown', this.onKeyDown);
  }

  get empty(): boolean {
    return this.stages.size === 0;
  }

  add(stage: Stage): void {
    this.stages.set(stage.place, stage);
    this.observer.observe(stage.place);
  }

  remove(place: HTMLElement): void {
    if (this.active?.place === place) this.exit('close');
    this.observer.unobserve(place);
    this.stages.delete(place);
  }

  dispose(): void {
    this.query.removeEventListener('change', this.onOrientation);
    removeEventListener('scroll', this.onScroll);
    document.removeEventListener('keydown', this.onKeyDown);
    this.observer.disconnect();
  }

  exit(reason: Exit): void {
    const stage = this.active;
    if (!stage) return;
    this.active = null;
    stage.onChange(false);
    // The page lays out again without the fixed layer, and after a rotation at the new width, before it can scroll.
    // Closed in another orientation than the one the reader scrolled in, the page has a different layout, so the stage
    // comes into view instead.
    const top = this.portraitScroll,
      opened = this.opened,
      sameLayout = opened !== null && opened.landscape === this.query.matches;
    this.opened = null;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (reason === 'rotation') scrollTo(0, top);
        else if (sameLayout) scrollTo(0, opened.scroll);
        else stage.place.scrollIntoView({ block: 'center' });
      }),
    );
  }

  // The full-screen button's fallback where the page cannot go full screen.
  open(place: HTMLElement): void {
    const stage = this.stages.get(place);
    if (!stage || this.active) return;
    this.opened = { scroll: scrollY, landscape: this.query.matches };
    this.activate(stage);
  }

  private enter(): void {
    if (this.active) return;
    const stage = this.mostInView();
    if (stage) this.activate(stage);
  }

  private activate(stage: Stage): void {
    this.active = stage;
    stage.onChange(true);
  }

  // A stage taller than the screen can never be half visible, so a stage that fills half the screen counts too.
  private measure(entries: readonly IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const stage = this.stages.get(entry.target);
      if (!stage) continue;
      const screen = entry.rootBounds?.height ?? innerHeight;
      stage.share = Math.max(entry.intersectionRatio, screen > 0 ? entry.intersectionRect.height / screen : 0);
    }
  }

  private mostInView(): Stage | null {
    let best: Stage | null = null;
    for (const stage of this.stages.values()) if (stage.share >= MINIMUM_SHARE && (!best || stage.share > best.share)) best = stage;
    return best;
  }

  private readonly onOrientation = (event: MediaQueryListEvent): void => {
    if (event.matches) this.enter();
    else if (!this.opened) this.exit('rotation');
  };

  private readonly onScroll = (): void => {
    if (!this.active && !this.query.matches) this.portraitScroll = scrollY;
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.active) this.exit('close');
  };
}

let stages: ImmersiveStages | null = null;

// The place is the stage's spot in the page, which keeps its size while the stage covers the screen. Returns the
// function that unregisters it.
export function registerImmersiveStage({ place, onChange }: { place: HTMLElement; onChange: (immersive: boolean) => void }): () => void {
  const coordinator = stages ?? new ImmersiveStages();
  stages = coordinator;
  coordinator.add({ place, onChange, share: 0 });
  return () => {
    coordinator.remove(place);
    if (!coordinator.empty) return;
    coordinator.dispose();
    if (stages === coordinator) stages = null;
  };
}

export function openImmersiveStage(place: HTMLElement): void {
  stages?.open(place);
}

export function closeImmersiveStage(): void {
  stages?.exit('close');
}

// The height of the screen the browser leaves in view, as the layer's --stage-visible-height. A toolbar that floats
// over the page can leave less than the dynamic viewport, and only the visual viewport reports it. Pinch zoom shrinks
// the visual viewport too, so its height counts at the page's scale. Returns the function that stops following it.
export function followVisibleHeight(layer: HTMLElement): () => void {
  const viewport = window.visualViewport;
  if (!viewport) return () => undefined;
  const update = (): void => layer.style.setProperty('--stage-visible-height', `${viewport.height * viewport.scale}px`);
  update();
  viewport.addEventListener('resize', update);
  return () => {
    viewport.removeEventListener('resize', update);
    layer.style.removeProperty('--stage-visible-height');
  };
}

// Puts a stage's layer in the browser's top layer, above every stacking context of the page and clear of any ancestor
// that would hold a fixed element inside the page, such as one with a transform or a backdrop filter. The page behind
// holds still and is hidden (styles/global.css), so none of it shows where the browser's bars cut the layer short, and
// browsers that tint their bars from the theme colour take the stage's. Returns the function that restores the page.
export function coverPage(layer: HTMLElement): () => void {
  const root = document.documentElement;
  root.dataset['stageLayer'] = 'open';
  const theme = document.createElement('meta');
  theme.name = 'theme-color';
  theme.content = getComputedStyle(layer).backgroundColor;
  document.head.prepend(theme);
  // Without popovers, as before Safari 17, the layer stays a fixed element above the page.
  const popover = typeof layer.showPopover === 'function';
  if (popover) {
    layer.popover = 'manual';
    layer.showPopover();
  }
  return () => {
    if (popover) {
      if (layer.matches(':popover-open')) layer.hidePopover();
      layer.removeAttribute('popover');
    }
    theme.remove();
    delete root.dataset['stageLayer'];
  };
}
