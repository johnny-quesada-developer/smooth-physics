import classNames from 'classnames';
import { useEffect, useMemo, type ComponentProps, type FC } from 'react';

import Button from '@/components/Button';
import SwitchField from '@/components/SwitchField';
import ClothCanvas from '@/features/Stage/components/ClothCanvas';
import useStageStatistics from '@/features/Stage/stores/stageStatisticsStore';
import twMerge from '@/tailwind/twMerge';
import { controlDefaults, controlTimings } from '../../catalogue/controlDefaults';
import { findExample } from '../../catalogue/examples';
import { SCENES, type StageExampleSlug } from '../../scenes';
import usePlayground from '../../stores/playgroundStore';
import ControlPanel from '../ControlPanel';
import StageReadout from '../StageReadout';
import ExamplePlaygroundTestIds from './ExamplePlayground.testIds';

type ExamplePlaygroundProps = ComponentProps<'div'> & { readonly slug: StageExampleSlug };

const ExamplePlayground: FC<ExamplePlaygroundProps> = ({ className, slug, ...props }) => {
  const example = findExample(slug);
  const controls = useMemo(() => example?.controls ?? [], [example]);
  const defaults = useMemo(() => controlDefaults(controls), [controls]);
  const timings = useMemo(() => controlTimings(controls), [controls]);
  const [{ overrides, paused, collidersVisible, request }, { setValue, resetValues, setPaused, setCollidersVisible, requestAction }] = usePlayground();
  const changed = overrides[slug];
  const values = useMemo(() => ({ ...defaults, ...changed }), [defaults, changed]);
  const hint = example?.grabbable ? `Drag the ${example.grabbable} through the cloth. Drag anywhere else to orbit.` : 'Drag to orbit the camera.';

  // Readers who asked for less motion start with the stage still.
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) setPaused(true);
  }, [setPaused]);

  return (
    <div className={twMerge(classNames('ExamplePlayground', 'grid gap-4 lg:grid-cols-3', className))} data-testid={ExamplePlaygroundTestIds.root} {...props}>
      <div className="flex min-w-0 flex-col gap-3 lg:col-span-2">
        <ClothCanvas
          cameraSway
          className="aspect-4/3 rounded-stage border border-line bg-surface shadow-floating sm:aspect-16/10"
          collidersVisible={collidersVisible}
          createDefinition={SCENES[slug]}
          {...(example?.grabbable ? { hint: `Drag the ${example.grabbable} through the cloth` } : {})}
          interactive
          label={`${example?.title ?? 'Example'}: live cloth simulation. ${hint} Scroll or pinch to zoom.`}
          onPausedChange={setPaused}
          onStatistics={(statistics) => useStageStatistics.setState(statistics)}
          paused={paused}
          request={request}
          timings={timings}
          values={values}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button aria-pressed={paused} data-testid={ExamplePlaygroundTestIds.pause} onClick={() => setPaused(!paused)}>
            {paused ? 'Play' : 'Pause'}
          </Button>
          <Button data-testid={ExamplePlaygroundTestIds.reset} onClick={() => resetValues(slug)} tone="quiet">
            Reset
          </Button>
          {example?.hasColliders ? (
            <SwitchField
              checked={collidersVisible}
              className="ml-auto w-auto"
              data-testid={ExamplePlaygroundTestIds.colliders}
              label="Show colliders"
              onCheckedChange={setCollidersVisible}
            />
          ) : null}
        </div>
        <p className="text-sm text-pretty text-muted" data-testid={ExamplePlaygroundTestIds.hint}>
          {hint}
        </p>
        <StageReadout className="rounded-panel border border-line bg-surface p-4" />
      </div>
      <ControlPanel
        className="rounded-panel border border-line bg-surface p-5 shadow-raised"
        controls={controls}
        onAction={requestAction}
        onValueChange={({ key, value }) => setValue({ slug, key, value })}
        values={values}
      />
    </div>
  );
};

export default ExamplePlayground;
