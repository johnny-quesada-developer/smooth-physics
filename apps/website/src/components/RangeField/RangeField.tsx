import classNames from 'classnames';
import { useId, type ComponentProps, type FC } from 'react';

import twMerge from '@/tailwind/twMerge';

type RangeFieldProps = Omit<ComponentProps<'div'>, 'onChange'> & {
  readonly label: string;
  readonly value: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly unit?: string;
  readonly inputTestId?: string;
  readonly onValueChange: (value: number) => void;
};

const RangeField: FC<RangeFieldProps> = ({ className, label, value, minimum, maximum, step, unit, inputTestId, onValueChange, ...props }) => {
  const id = useId();
  const decimals = decimalsOf(step);
  return (
    <div className={twMerge(classNames('RangeField', 'flex flex-col gap-1', className))} {...props}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <label className="font-medium" htmlFor={id}>
          {label}
        </label>
        <output className="font-mono text-muted tabular-nums" htmlFor={id}>
          {value.toFixed(decimals)}
          {unit ? ` ${unit}` : ''}
        </output>
      </div>
      <input
        className="h-touch w-full cursor-pointer accent-lime"
        data-testid={inputTestId}
        id={id}
        max={maximum}
        min={minimum}
        onChange={(event) => onValueChange(event.currentTarget.valueAsNumber)}
        step={step}
        type="range"
        value={value}
      />
    </div>
  );
};

export default RangeField;

function decimalsOf(step: number): number {
  const [, fraction = ''] = String(step).split('.');
  return fraction.length;
}
