import classNames from 'classnames';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type FC } from 'react';

import Button from '@/components/Button';
import SwitchField from '@/components/SwitchField';
import ClothCanvas from '@/features/Stage/components/ClothCanvas';
import type { StageStatistics } from '@/features/Stage/runtime/types';
import twMerge from '@/tailwind/twMerge';
import { CLIPS } from '../../clips';
import ShowreelDirector, { PHYSICS } from '../../scene/ShowreelDirector';
import ShowreelPlayerTestIds from './ShowreelPlayer.testIds';

type ShowreelPlayerProps = ComponentProps<'section'>;

const MILLISECONDS = new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const INTEGER = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
const SECONDS = new Intl.NumberFormat('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
// The fighters' cloth, by the thread colours the scene gives it: lime for the lead's tails, stone for the partner's,
// honey for the partner's belt. On a light page both bandanas take the lime text tone, the deeper green of the family.
// On a dark page the fighters are white and grey, and so is their cloth: a mid-grey bandana on the lead, a darker one
// and a grey belt on the partner.
const FIGHTER_COLORS =
  '[--color-lime-fill:var(--color-lime)] [--color-stone-fill:var(--color-lime)] dark:[--color-lime-fill:#8e918d] dark:[--color-stone-fill:#525552] dark:[--color-honey-fill:#6d706d]';

const ShowreelPlayer: FC<ShowreelPlayerProps> = ({ className, ...props }) => {
  const [director] = useState(() => new ShowreelDirector());
  const { clip, percent } = useSyncExternalStore(director.subscribe, director.getState, director.getState);
  const createDefinition = useCallback(() => director.createDefinition(), [director]);
  const [paused, setPaused] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // Both stay as they are when the clip changes, so a reader can compare one clip with and without the physics.
  const [collidersVisible, setCollidersVisible] = useState(false);
  const [simulated, setSimulated] = useState(true);
  const values = useMemo(() => ({ [PHYSICS]: simulated }), [simulated]);
  const [statistics, setStatistics] = useState<Pick<StageStatistics, 'framesPerSecond' | 'physicsMilliseconds'> | null>(null);
  // The first report after a pause spans the pause itself, so it is dropped.
  const resumed = useRef(false);

  // On hydration: the controls start to work, and readers who asked for less motion start with the stage still.
  useEffect(() => {
    setHydrated(true);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) setPaused(true);
  }, []);

  const current = CLIPS[clip] ?? CLIPS[0];
  const play = (): void => {
    resumed.current = paused;
    setPaused(false);
  };
  const choose = (index: number): void => {
    director.jumpTo(index);
    play();
  };
  const shown = paused ? null : statistics;

  return (
    <section className={twMerge(classNames('ShowreelPlayer', 'flex flex-col gap-4', className))} data-testid={ShowreelPlayerTestIds.root} {...props}>
      <ClothCanvas
        cameraSway
        className={classNames('aspect-4/3 rounded-stage border border-line bg-surface shadow-floating sm:aspect-16/9 lg:aspect-2/1', FIGHTER_COLORS)}
        collidersVisible={collidersVisible}
        controls={(dock) => (
          <div
            className={classNames('flex', dock === 'bar' ? 'flex-wrap items-center justify-center gap-x-2' : 'flex-col gap-1')}
            data-testid={ShowreelPlayerTestIds.stageControls}
          >
            <div aria-label="Scenes" className={dock === 'bar' ? 'flex gap-1' : 'grid grid-cols-2 gap-1'} role="group">
              {CLIPS.map((item, index) => (
                <button
                  aria-current={index === clip ? 'true' : undefined}
                  aria-label={item.title}
                  className={classNames(
                    'min-h-touch w-touch rounded-control border text-sm font-semibold tabular-nums transition-colors',
                    index === clip ? 'border-lime' : 'border-transparent text-muted hover:text-ink',
                  )}
                  data-testid={ShowreelPlayerTestIds.stageClip(item.id)}
                  key={item.id}
                  onClick={() => choose(index)}
                  title={item.title}
                  type="button"
                >
                  {index + 1}
                </button>
              ))}
            </div>
            {/* Short labels keep the scenes and both switches on one row across a phone held upright, and the rail
                slim; the names they are read by stay whole. */}
            <SwitchField
              aria-label="Show colliders"
              checked={collidersVisible}
              className={dock === 'rail' ? 'w-full' : undefined}
              data-testid={ShowreelPlayerTestIds.stageColliders}
              label="Colliders"
              onCheckedChange={setCollidersVisible}
              size="compact"
            />
            <SwitchField
              aria-label="Bandana physics"
              checked={simulated}
              className={dock === 'rail' ? 'w-full' : undefined}
              data-testid={ShowreelPlayerTestIds.stageBandanaPhysics}
              label="Bandana"
              onCheckedChange={setSimulated}
              size="compact"
            />
          </div>
        )}
        createDefinition={createDefinition}
        interactive
        label={`Showreel, ${current?.title ?? ''}: ${current?.summary ?? ''} Drag to orbit, pinch to zoom.`}
        onPausedChange={(next) => (next ? setPaused(true) : play())}
        onStatistics={(next) => {
          if (resumed.current) resumed.current = false;
          else setStatistics({ framesPerSecond: next.framesPerSecond, physicsMilliseconds: next.physicsMilliseconds });
        }}
        paused={paused}
        values={values}
        wheelZoom={false}
      >
        <dl
          aria-label="Live performance"
          data-testid={ShowreelPlayerTestIds.readout}
          className="pointer-events-none absolute top-3 left-3 flex gap-3 rounded-control border border-line bg-surface/90 px-2.5 py-1.5 font-mono text-xs text-ink tabular-nums shadow-raised"
        >
          <div>
            <dt className="sr-only">Frames per second</dt>
            <dd>
              <span data-testid={ShowreelPlayerTestIds.framesPerSecond}>{shown ? INTEGER.format(shown.framesPerSecond) : '–'}</span>{' '}
              <span className="text-muted">fps</span>
            </dd>
          </div>
          <div>
            <dt className="sr-only">Physics time per frame</dt>
            <dd>
              <span data-testid={ShowreelPlayerTestIds.physics}>{shown ? `${MILLISECONDS.format(shown.physicsMilliseconds)} ms` : '–'}</span>{' '}
              <span className="text-muted">physics</span>
            </dd>
          </div>
        </dl>
      </ClothCanvas>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Button
            aria-pressed={paused}
            className="w-24 shrink-0"
            data-testid={ShowreelPlayerTestIds.toggle}
            disabled={!hydrated}
            onClick={() => (paused ? play() : setPaused(true))}
          >
            {paused ? 'Play' : 'Pause'}
          </Button>
          <p className="min-w-0 text-sm text-pretty text-muted" data-testid={ShowreelPlayerTestIds.current}>
            <span className="font-semibold text-ink">{current?.title}</span> · {current?.summary}
          </p>
          {/* The bars in the scene buttons are drawn for the eye; a button's content is not read as separate controls. */}
          <span
            aria-label="Scene progress"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={percent}
            aria-valuetext={`${current?.title ?? ''}, ${percent}%`}
            className="sr-only"
            data-testid={ShowreelPlayerTestIds.progress}
            role="progressbar"
          />
        </div>
        <div
          aria-label="What the library adds"
          className="grid gap-x-6 sm:grid-cols-2 lg:flex lg:shrink-0"
          data-testid={ShowreelPlayerTestIds.options}
          role="group"
        >
          <SwitchField
            checked={collidersVisible}
            className="lg:w-auto"
            data-testid={ShowreelPlayerTestIds.colliders}
            disabled={!hydrated}
            label="Show colliders"
            onCheckedChange={setCollidersVisible}
          />
          <SwitchField
            checked={simulated}
            className="lg:w-auto"
            data-testid={ShowreelPlayerTestIds.bandanaPhysics}
            disabled={!hydrated}
            label="Bandana physics"
            onCheckedChange={setSimulated}
          />
        </div>
      </div>

      <ol aria-label="Scenes" className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid={ShowreelPlayerTestIds.scenes}>
        {CLIPS.map((item, index) => {
          const active = index === clip;
          return (
            <li key={item.id}>
              <button
                aria-current={active ? 'true' : undefined}
                className={classNames(
                  'flex min-h-touch w-full flex-col gap-2 rounded-panel border bg-surface p-3 text-left transition-colors disabled:cursor-not-allowed',
                  active ? 'border-lime' : 'border-line hover:border-ink',
                )}
                data-testid={ShowreelPlayerTestIds.clip(item.id)}
                disabled={!hydrated}
                onClick={() => choose(index)}
                type="button"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">
                    <span className="text-muted tabular-nums">{index + 1}</span> {item.title}
                  </span>
                  <span className="shrink-0 font-mono text-xs whitespace-nowrap text-muted tabular-nums">{SECONDS.format(item.duration)} s</span>
                </span>
                <span aria-hidden="true" className="block h-1 overflow-hidden rounded-full bg-soft">
                  <span className="block h-full rounded-full bg-lime" style={{ width: `${active ? percent : 0}%` }} />
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
};

export default ShowreelPlayer;
