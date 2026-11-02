import classNames from 'classnames';
import { useEffect, useState, type ComponentProps, type FC } from 'react';

import Button from '@/components/Button';
import ClothCanvas from '@/features/Stage/components/ClothCanvas';
import twMerge from '@/tailwind/twMerge';
import { createHeroScene } from '../../scenes/heroScene';
import { connectHeroPhysics } from '../../scenes/heroRemotePhysics';
import HeroStageTestIds from './HeroStage.testIds';

type HeroStageProps = ComponentProps<'div'>;

const FPS = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

const HeroStage: FC<HeroStageProps> = ({ className, ...props }) => {
  const [paused, setPaused] = useState(false);
  const [framesPerSecond, setFramesPerSecond] = useState<number | null>(null);
  const [thread, setThread] = useState<'main' | 'worker' | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // On hydration: the button starts to work, and readers who asked for less motion start with the banner still.
  useEffect(() => {
    setHydrated(true);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) setPaused(true);
  }, []);

  return (
    <div
      className={twMerge(classNames('HeroStage', 'w-full max-w-5xl rounded-stage border border-line bg-soft p-2 text-left shadow-floating', className))}
      data-testid={HeroStageTestIds.root}
      {...props}
    >
      <div className="overflow-hidden rounded-panel border border-line bg-paper">
        <div className="flex items-center gap-3 border-b border-line py-1 pr-1 pl-4">
          <span aria-hidden="true" className="flex gap-1.5">
            <span className="size-2 rounded-full bg-line" />
            <span className="size-2 rounded-full bg-line" />
            <span className="size-2 rounded-full bg-line" />
          </span>
          <span className="hidden font-mono text-xs whitespace-nowrap text-muted sm:inline">banner.ts · live</span>
          <span className="font-mono text-xs whitespace-nowrap text-muted tabular-nums" data-testid={HeroStageTestIds.fps}>
            {framesPerSecond === null ? '– fps' : `${FPS.format(framesPerSecond)} fps`}
          </span>
          {thread ? (
            <span className="font-mono text-xs whitespace-nowrap text-muted" data-testid={HeroStageTestIds.thread}>
              {thread === 'worker' ? 'in a worker' : 'on the page'}
            </span>
          ) : null}
          <Button
            aria-pressed={paused}
            className="ml-auto"
            data-testid={HeroStageTestIds.toggle}
            disabled={!hydrated}
            onClick={() => setPaused(!paused)}
            tone="quiet"
          >
            {paused ? 'Play' : 'Pause'}
          </Button>
        </div>
        {/* The reader scrolls past the banner, so the wheel stays with the page; pinch still zooms. */}
        <ClothCanvas
          cameraSway
          className="aspect-4/3 sm:aspect-16/9"
          createDefinition={createHeroScene}
          hint="Drag the ball through the banner"
          interactive
          label="A lemon-green banner and honey tassels on a rail, pushed by gusts of wind and by a grey ball moving through it. Drag the ball to move it through the banner, or drag anywhere else to orbit the camera."
          onStatistics={(statistics) => {
            setFramesPerSecond(statistics.framesPerSecond);
            setThread(statistics.thread);
          }}
          onPausedChange={setPaused}
          paused={paused}
          remotePhysics={connectHeroPhysics}
          wheelZoom={false}
        />
        <p className="border-t border-line px-4 py-2 font-mono text-xs text-pretty text-muted" data-testid={HeroStageTestIds.hint}>
          Drag the ball through the banner. Drag anywhere else to orbit.
        </p>
      </div>
    </div>
  );
};

export default HeroStage;
