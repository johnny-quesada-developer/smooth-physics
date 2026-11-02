import classNames from 'classnames';
import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type FC, type ReactNode } from 'react';

import Button from '@/components/Button';
import twMerge from '@/tailwind/twMerge';
import { exitFullscreen, fullscreenElement, FULLSCREEN_EVENTS, requestFullscreen } from '../../interaction/fullscreen';
import {
  closeImmersiveStage,
  coverPage,
  followVisibleHeight,
  openImmersiveStage,
  PORTRAIT_PHONE,
  registerImmersiveStage,
} from '../../interaction/immersiveStages';
import useIdleControls from '../../interaction/useIdleControls';
import useMediaQuery from '../../interaction/useMediaQuery';
import useStageHint from '../../interaction/useStageHint';
import type { RemotePhysics } from '../../runtime/remotePhysics';
import StageRuntime from '../../runtime/StageRuntime';
import type { ControlTiming, ControlValues, SceneDefinition, StageStatistics } from '../../runtime/types';
import ClothCanvasTestIds from './ClothCanvas.testIds';

export type StageRequest = { readonly id: number; readonly action: string };
// Where a full-screen stage keeps its controls: a bar under the stage on a screen held upright, a rail down the right
// edge on a wide one.
export type StageDock = 'bar' | 'rail';

// The children are overlays drawn over the stage, such as a live readout; they stay in view when the stage fills the
// screen.
type ClothCanvasProps = ComponentProps<'div'> & {
  // Called once when the stage starts; the scene it returns belongs to this stage.
  readonly createDefinition: () => SceneDefinition;
  readonly label: string;
  readonly values?: ControlValues;
  readonly timings?: Readonly<Record<string, ControlTiming>>;
  // Orbit, zoom and grabbing the scene's grabbable props.
  readonly interactive?: boolean;
  readonly cameraSway?: boolean;
  readonly wheelZoom?: boolean;
  readonly paused?: boolean;
  readonly collidersVisible?: boolean;
  // A new id runs the action once; 'reset' rebuilds the cloth.
  readonly request?: StageRequest | null;
  readonly onStatistics?: (statistics: StageStatistics) => void;
  readonly remotePhysics?: () => RemotePhysics;
  // The hint over an interactive stage until the reader first drags it; by default how to orbit, and null for none.
  readonly hint?: string | null;
  // Gives the full-screen view its own play and pause button.
  readonly onPausedChange?: (paused: boolean) => void;
  // Shown with the full-screen stage's own buttons while it is full screen, for a stage whose controls sit outside it.
  readonly controls?: (dock: StageDock) => ReactNode;
};

// The layer where the page cannot go full screen: the large viewport, so it also reaches under the browser's translucent
// bars where the browser lets it, while the screen inside fits what the bars leave in view. It resets what the browser
// styles on a popover, and takes the gestures that would otherwise scroll or zoom the page.
const LAYER = 'visible fixed top-0 left-0 z-50 m-0 h-lvh w-lvw touch-none overflow-hidden overscroll-none border-0 bg-paper p-0 text-ink';
// The part of a full-screen view in sight, which the stage fills in either orientation: the visual viewport's height
// where the layer follows it, else the dynamic viewport's. The controls lie over it and step aside when idle; the camera
// fits the scene's subject to the stage's shape (SubjectFraming).
const SCREEN = 'absolute inset-x-0 top-0 h-[min(100dvh,var(--stage-visible-height,100dvh))]';
const UPRIGHT = '(orientation: portrait)';

const NO_VALUES: ControlValues = {};
const NO_TIMINGS: Readonly<Record<string, ControlTiming>> = {};

const ClothCanvas: FC<ClothCanvasProps> = ({
  className,
  createDefinition,
  label,
  values = NO_VALUES,
  timings = NO_TIMINGS,
  interactive = false,
  cameraSway = false,
  wheelZoom = true,
  paused = false,
  collidersVisible = false,
  request = null,
  onStatistics,
  remotePhysics,
  hint,
  onPausedChange,
  controls,
  children,
  ...props
}) => {
  const placeRef = useRef<HTMLDivElement>(null);
  // The layer leaves the page when the stage fills the screen; the host inside it is what the stage draws into.
  const layerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fullscreenRef = useRef<HTMLButtonElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<StageRuntime | null>(null);
  const startRef = useRef({ values, timings, paused, onStatistics });
  const [problem, setProblem] = useState<string | null>(null);
  // Immersive is the fixed layer of a phone in landscape, or of the full-screen button where the Fullscreen API is
  // missing; full screen is the real one.
  const [immersive, setImmersive] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const full = immersive || fullscreen;
  const hinted = interactive && hint !== null;
  const stageHint = useStageHint({ place: placeRef, enabled: hinted });
  const hintText = hint ?? (stageHint.touch ? 'Drag to rotate · pinch to zoom' : 'Drag to orbit');
  const portraitPhone = useMediaQuery(PORTRAIT_PHONE);
  const dock: StageDock = useMediaQuery(UPRIGHT) ? 'bar' : 'rail';
  const controlsShown = useIdleControls({ enabled: full, area: layerRef, controls: chromeRef });

  // The latest props for the stage start and the statistics callback, without restarting the stage.
  useEffect(() => {
    startRef.current = { values, timings, paused, onStatistics };
  });

  useEffect(() => {
    const host = hostRef.current,
      canvas = canvasRef.current;
    if (!host || !canvas) return undefined;
    const start = startRef.current;
    try {
      runtimeRef.current = StageRuntime.start({
        canvas,
        host,
        definition: createDefinition(),
        timings: start.timings,
        values: start.values,
        interactive,
        // The sway invites a first drag; readers who asked for less motion get a still camera.
        cameraSway: cameraSway && !matchMedia('(prefers-reduced-motion: reduce)').matches,
        wheelZoom,
        paused: start.paused,
        onStatistics: (statistics) => startRef.current.onStatistics?.(statistics),
        onProblem: setProblem,
        ...(remotePhysics ? { remote: remotePhysics() } : {}),
      });
    } catch (error) {
      setProblem(error instanceof Error ? `The 3D view could not start: ${error.message}` : 'The 3D view could not start.');
    }
    return () => {
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, [createDefinition, interactive, cameraSway, wheelZoom, remotePhysics]);

  useEffect(() => {
    runtimeRef.current?.setValues(values);
  }, [values]);

  useEffect(() => {
    runtimeRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    runtimeRef.current?.setCollidersVisible(collidersVisible);
  }, [collidersVisible]);

  useEffect(() => {
    runtimeRef.current?.fitSubject(immersive);
  }, [immersive]);

  useEffect(() => {
    if (!request) return;
    if (request.action === 'reset') runtimeRef.current?.reset();
    else runtimeRef.current?.act(request.action);
  }, [request]);

  useEffect(() => {
    const place = placeRef.current;
    if (!interactive || !place) return undefined;
    return registerImmersiveStage({ place, onChange: setImmersive });
  }, [interactive]);

  // Before the paint, so the page never shows uncovered under the layer.
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!immersive || !layer) return undefined;
    const restorePage = coverPage(layer),
      stopFollowing = followVisibleHeight(layer);
    return () => {
      stopFollowing();
      restorePage();
    };
  }, [immersive]);

  useEffect(() => {
    if (immersive) fullscreenRef.current?.focus({ preventScroll: true });
  }, [immersive]);

  // Escape and the browser's own controls leave full screen too.
  useEffect(() => {
    const layer = layerRef.current;
    if (!interactive || !layer) return undefined;
    const onChange = (): void => setFullscreen(fullscreenElement() === layer);
    for (const type of FULLSCREEN_EVENTS) document.addEventListener(type, onChange);
    return () => {
      for (const type of FULLSCREEN_EVENTS) document.removeEventListener(type, onChange);
    };
  }, [interactive]);

  const toggleFullscreen = (): void => {
    const layer = layerRef.current,
      place = placeRef.current;
    if (!layer || !place) return;
    if (immersive) closeImmersiveStage();
    else if (fullscreen) void exitFullscreen();
    else
      requestFullscreen(layer).catch((error: unknown) => {
        // The reason stays on the stage, so a device that refuses can be diagnosed from the inspector.
        layer.dataset['fullscreenRefusal'] = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        openImmersiveStage(place);
      });
  };

  const fullscreenButton = (
    <Button
      aria-label={full ? 'Exit full screen' : 'Enter full screen'}
      className="pointer-events-auto w-touch bg-paper/90 px-0"
      data-testid={ClothCanvasTestIds.fullscreen}
      onClick={toggleFullscreen}
      ref={fullscreenRef}
    >
      <FullscreenIcon exit={full} />
    </Button>
  );
  const pauseButton =
    full && onPausedChange ? (
      <Button
        aria-label="Pause"
        aria-pressed={paused}
        className="pointer-events-auto w-touch bg-paper/90 px-0"
        data-testid={ClothCanvasTestIds.pause}
        onClick={() => onPausedChange(!paused)}
      >
        <PauseIcon paused={paused} />
      </Button>
    ) : null;

  return (
    <div
      className={twMerge(classNames('ClothCanvas', 'relative overflow-hidden', className))}
      data-colliders={collidersVisible ? 'shown' : 'hidden'}
      data-immersive={immersive ? 'true' : undefined}
      data-testid={ClothCanvasTestIds.root}
      ref={placeRef}
      {...props}
    >
      {/* Full screen, the stage leaves its place in the page, which keeps its size, and covers the screen above the
          header; the runtime follows the new size. */}
      <div
        aria-label={full ? 'Full-screen stage' : undefined}
        aria-modal={full ? 'true' : undefined}
        className={fullscreen ? 'fixed top-0 left-0 z-50 h-dvh w-dvw bg-paper' : immersive ? LAYER : 'absolute inset-0'}
        data-controls={full ? (controlsShown ? 'shown' : 'hidden') : undefined}
        data-fullscreen={fullscreen ? 'true' : undefined}
        data-testid={ClothCanvasTestIds.layer}
        onPointerDownCapture={hinted ? stageHint.dismiss : undefined}
        ref={layerRef}
        role={full ? 'dialog' : undefined}
      >
        <div className={full ? SCREEN : 'absolute inset-0'}>
          <div className="absolute inset-0" ref={hostRef}>
            <canvas
              aria-label={label}
              className={classNames('block size-full', interactive && 'cursor-grab active:cursor-grabbing')}
              data-testid={ClothCanvasTestIds.canvas}
              ref={canvasRef}
              role="img"
            />
          </div>
          <div
            className={classNames(
              'pointer-events-none absolute',
              full
                ? 'top-[env(safe-area-inset-top)] right-[env(safe-area-inset-right)] bottom-[env(safe-area-inset-bottom)] left-[env(safe-area-inset-left)]'
                : 'inset-0',
            )}
          >
            {/* Hidden controls stay focusable, so the keyboard reaches them, and let taps through to the stage, so the
                tap that brings them back presses none of them. */}
            <div
              className={classNames('absolute inset-0 transition-opacity duration-300', !controlsShown && 'opacity-0 **:pointer-events-none!')}
              data-testid={ClothCanvasTestIds.chrome}
              ref={chromeRef}
            >
              {children}
              {hinted && !(full && controls) ? (
                <p
                  aria-hidden="true"
                  className={classNames(
                    'absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-surface/90 px-3 py-1.5 font-mono text-xs whitespace-nowrap text-ink shadow-raised transition-[opacity,visibility] duration-500',
                    stageHint.shown ? 'visible opacity-100' : 'invisible opacity-0',
                  )}
                  data-shown={stageHint.shown ? 'true' : 'false'}
                  data-testid={ClothCanvasTestIds.hint}
                >
                  <OrbitIcon />
                  {hintText}
                </p>
              ) : null}
              {interactive && !full ? <div className="absolute top-3 right-3">{fullscreenButton}</div> : null}
              {interactive && full && dock === 'bar' ? (
                <>
                  <div className="absolute top-3 right-3 flex gap-2">
                    {pauseButton}
                    {fullscreenButton}
                  </div>
                  {controls ? (
                    <div className="absolute inset-x-3 bottom-3 flex justify-center" data-dock="bar" data-testid={ClothCanvasTestIds.controls}>
                      <div className="pointer-events-auto rounded-panel border border-line bg-paper/85 px-2 shadow-raised">{controls('bar')}</div>
                    </div>
                  ) : null}
                </>
              ) : null}
              {/* The rail leaves the stage its whole width; it scrolls on a screen too short for it. */}
              {interactive && full && dock === 'rail' ? (
                <div
                  className="pointer-events-auto absolute top-3 right-3 flex max-h-[calc(100%-1.5rem)] flex-col gap-1 overflow-y-auto overscroll-contain rounded-panel border border-line bg-paper/85 p-1 shadow-raised"
                  data-dock="rail"
                  data-testid={ClothCanvasTestIds.controls}
                >
                  <div className="flex gap-1">
                    {pauseButton}
                    {fullscreenButton}
                  </div>
                  {controls?.('rail')}
                </div>
              ) : null}
              {immersive && portraitPhone ? (
                <p
                  className="absolute inset-x-0 top-16 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-full border border-line bg-surface/90 px-3 py-1.5 text-center font-mono text-xs text-balance text-ink shadow-raised"
                  data-testid={ClothCanvasTestIds.turnHint}
                >
                  <TurnPhoneIcon />
                  Turn your phone sideways for full screen
                </p>
              ) : null}
            </div>
            {problem ? (
              <p
                className="absolute inset-x-4 bottom-4 rounded-control bg-surface p-3 text-sm text-ink shadow-raised"
                data-testid={ClothCanvasTestIds.problem}
                role="status"
              >
                {problem}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClothCanvas;

// Two bars while the stage runs; a triangle to play it again once paused.
const PauseIcon: FC<{ readonly paused: boolean }> = ({ paused }) => {
  return (
    <svg aria-hidden="true" className="size-4 shrink-0 fill-current" viewBox="0 0 16 16">
      {paused ? <path d="M4.5 2.8v10.4L13 8z" /> : <path d="M4 2.5h2.6v11H4zM9.4 2.5H12v11H9.4z" />}
    </svg>
  );
};

// Two arcs turning around a point: the camera orbits the scene.
const OrbitIcon: FC = () => {
  return (
    <svg
      aria-hidden="true"
      className="size-3.5 shrink-0 fill-none stroke-current"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 16 16"
    >
      <path d="M2.5 9a5.5 3 0 0 0 11 0" />
      <path d="M13.5 7a5.5 3 0 0 0-11 0" />
      <path d="M11.5 10.5 13.5 9l1 2.2" />
      <path d="M4.5 5.5 2.5 7l-1-2.2" />
      <circle className="fill-current stroke-none" cx="8" cy="8" r="1" />
    </svg>
  );
};

// A phone upright and an arrow turning it onto its side.
const TurnPhoneIcon: FC = () => {
  return (
    <svg
      aria-hidden="true"
      className="size-4 shrink-0 fill-none stroke-current"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 16 16"
    >
      <rect height="11" rx="1.5" width="6.5" x="1.5" y="3.5" />
      <path d="M10.5 2.5a4 4 0 0 1 4 4" />
      <path d="M13.2 5.1 14.5 6.5l1.2-1.4" />
    </svg>
  );
};

// Four corners pointing out to enter full screen, and in to leave it.
const FullscreenIcon: FC<{ readonly exit: boolean }> = ({ exit }) => {
  return (
    <svg
      aria-hidden="true"
      className="size-4 shrink-0 fill-none stroke-current"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 16 16"
    >
      {exit ? <path d="M6 2.5V6H2.5M10 2.5V6h3.5M6 13.5V10H2.5M10 13.5V10h3.5" /> : <path d="M2.5 6V2.5H6M13.5 6V2.5H10M2.5 10v3.5H6M13.5 10v3.5H10" />}
    </svg>
  );
};
