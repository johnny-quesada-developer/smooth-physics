import classNames from 'classnames';
import type { ComponentProps, FC } from 'react';

import twMerge from '@/tailwind/twMerge';

type SwitchFieldProps = Omit<ComponentProps<'button'>, 'onChange' | 'value'> & {
  readonly label: string;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  // Compact draws a smaller switch above its label and leaves out the On and Off text, for a row of controls on a
  // narrow screen.
  readonly size?: 'regular' | 'compact';
};

const SwitchField: FC<SwitchFieldProps> = ({ className, label, checked, onCheckedChange, size = 'regular', ...props }) => {
  const compact = size === 'compact';
  const track = (
    <span
      className={classNames(
        'flex items-center rounded-full border border-line bg-soft p-0.5 transition-colors [[aria-checked=true]_&]:border-lime [[aria-checked=true]_&]:bg-lime',
        compact ? 'h-4.5 w-8' : 'h-6 w-11',
      )}
    >
      <span
        className={classNames(
          'rounded-full bg-surface shadow-raised transition-transform',
          compact ? 'size-3.5 [[aria-checked=true]_&]:translate-x-3' : 'size-4.5 [[aria-checked=true]_&]:translate-x-5',
        )}
      />
    </span>
  );
  return (
    <button
      aria-checked={checked}
      className={twMerge(
        classNames(
          'SwitchField',
          compact
            ? 'flex min-h-touch min-w-touch flex-col items-center justify-center gap-1 rounded-control px-1 text-xs font-medium'
            : 'flex min-h-touch w-full items-center justify-between gap-3 rounded-control text-left text-sm font-medium',
          className,
        ),
      )}
      onClick={() => onCheckedChange(!checked)}
      role="switch"
      type="button"
      {...props}
    >
      {compact ? (
        <>
          {track}
          {label}
        </>
      ) : (
        <>
          {label}
          <span className="flex items-center gap-2 text-muted">
            <span className="font-mono text-xs">{checked ? 'On' : 'Off'}</span>
            {track}
          </span>
        </>
      )}
    </button>
  );
};

export default SwitchField;
