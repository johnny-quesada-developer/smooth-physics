import classNames from 'classnames';
import { useCallback, type ComponentProps, type FC } from 'react';

import Badge from '@/components/Badge';
import Button from '@/components/Button';
import RangeField from '@/components/RangeField';
import ClothCanvas from '@/features/Stage/components/ClothCanvas';
import type { ControlTiming } from '@/features/Stage/runtime/types';
import twMerge from '@/tailwind/twMerge';
import { createFabricSwatchScene } from '../../scenes/fabricSwatch';
import FabricSwatchContext, { type FabricValues } from '../../stores/fabricSwatchContext';
import FabricSwatchPanelTestIds from './FabricSwatchPanel.testIds';

type FabricSwatchPanelProps = ComponentProps<'section'> & { readonly panelId: number; readonly canRemove: boolean; readonly onRemove: () => void };

const TIMINGS: Readonly<Record<keyof FabricValues, ControlTiming>> = { gravity: 'tuning', damping: 'tuning', stiffness: 'tuning', bending: 'tuning' };
const CONTROLS: readonly {
  readonly key: keyof FabricValues;
  readonly label: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
}[] = [
  { key: 'gravity', label: 'Gravity', minimum: 0, maximum: 15, step: 0.5 },
  { key: 'damping', label: 'Damping', minimum: 0, maximum: 0.4, step: 0.01 },
  { key: 'stiffness', label: 'Tip stiffness', minimum: 0.1, maximum: 1, step: 0.05 },
  { key: 'bending', label: 'Bending stiffness', minimum: 0.05, maximum: 1, step: 0.05 },
];

const FabricSwatchPanel: FC<FabricSwatchPanelProps> = ({ className, panelId, canRemove, onRemove, ...props }) => {
  const [preset] = FabricSwatchContext.use((state) => state.preset);
  const [values, { setValue, reset, setPaused, report }] = FabricSwatchContext.use((state) => state.values);
  const [paused] = FabricSwatchContext.use((state) => state.paused);
  const color = preset.color;
  const createDefinition = useCallback(() => createFabricSwatchScene({ color }), [color]);

  return (
    <section
      aria-label={`${preset.name} swatch ${panelId}`}
      className={twMerge(classNames('FabricSwatchPanel', 'flex flex-col gap-4 rounded-panel border border-line bg-surface p-4 shadow-raised', className))}
      data-testid={FabricSwatchPanelTestIds.root(panelId)}
      {...props}
    >
      <header className="flex items-center gap-2">
        <Badge data-testid={FabricSwatchPanelTestIds.name} tone={preset.color === 'stone' ? 'neutral' : preset.color}>
          {preset.name}
        </Badge>
        <span className="font-mono text-xs text-muted">store #{panelId}</span>
        {canRemove ? (
          <Button className="ml-auto" data-testid={FabricSwatchPanelTestIds.remove} onClick={onRemove} tone="quiet">
            Remove
          </Button>
        ) : null}
      </header>
      <ClothCanvas
        cameraSway
        className="aspect-4/3 rounded-code border border-line bg-paper"
        createDefinition={createDefinition}
        hint="Drag the ball through the swatch"
        interactive
        label={`${preset.name} fabric swatch on a swaying rail, brushed by a grey ball. Drag the ball through the swatch, or drag anywhere else to orbit.`}
        onPausedChange={setPaused}
        onStatistics={(statistics) => report({ physicsMilliseconds: statistics.physicsMilliseconds, framesPerSecond: statistics.framesPerSecond })}
        paused={paused}
        timings={TIMINGS}
        values={values}
      />
      <div className="flex flex-col gap-3">
        {CONTROLS.map((control) => (
          <RangeField
            inputTestId={FabricSwatchPanelTestIds.control(control.key)}
            key={control.key}
            label={control.label}
            maximum={control.maximum}
            minimum={control.minimum}
            onValueChange={(value) => setValue({ key: control.key, value })}
            step={control.step}
            value={values[control.key]}
          />
        ))}
      </div>
      <footer className="flex flex-wrap items-center gap-2">
        <Button aria-pressed={paused} data-testid={FabricSwatchPanelTestIds.pause} onClick={() => setPaused(!paused)}>
          {paused ? 'Play' : 'Pause'}
        </Button>
        <Button data-testid={FabricSwatchPanelTestIds.reset} onClick={() => reset()} tone="quiet">
          Reset to {preset.name.toLowerCase()}
        </Button>
        <PhysicsTime className="ml-auto" />
      </footer>
    </section>
  );
};

export default FabricSwatchPanel;

const NUMBER = new Intl.NumberFormat('en', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const INTEGER = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

const PhysicsTime: FC<ComponentProps<'p'>> = ({ className, ...props }) => {
  const [milliseconds] = FabricSwatchContext.use((state) => state.physicsMilliseconds);
  const [framesPerSecond] = FabricSwatchContext.use((state) => state.framesPerSecond);
  return (
    <p className={twMerge(classNames('PhysicsTime', 'flex gap-2 font-mono text-xs text-muted tabular-nums', className))} {...props}>
      <span data-testid={FabricSwatchPanelTestIds.physics}>{milliseconds === null ? '–' : `${NUMBER.format(milliseconds)} ms`}</span>
      <span data-testid={FabricSwatchPanelTestIds.fps}>{framesPerSecond === null ? '– fps' : `${INTEGER.format(framesPerSecond)} fps`}</span>
    </p>
  );
};
