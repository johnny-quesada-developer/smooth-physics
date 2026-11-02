import classNames from 'classnames';
import { useId, type ComponentProps, type ReactElement } from 'react';

import twMerge from '@/tailwind/twMerge';

type ChoiceFieldProps<Value extends string> = Omit<ComponentProps<'fieldset'>, 'onChange'> & {
  readonly label: string;
  readonly value: Value;
  readonly options: readonly { readonly value: Value; readonly label: string }[];
  readonly optionTestId?: (value: Value) => string;
  readonly onValueChange: (value: Value) => void;
};

function ChoiceField<Value extends string>({ className, label, value, options, optionTestId, onValueChange, ...props }: ChoiceFieldProps<Value>): ReactElement {
  const name = useId();
  return (
    <fieldset className={twMerge(classNames('ChoiceField', 'flex flex-col gap-1', className))} {...props}>
      <legend className="pb-1 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1 rounded-control bg-soft p-1">
        {options.map((option) => (
          <label
            className="flex min-h-touch flex-1 cursor-pointer items-center justify-center rounded-control px-3 text-sm font-medium text-muted has-checked:bg-surface has-checked:text-ink has-checked:shadow-raised has-focus-visible:outline-2 has-focus-visible:outline-lime"
            key={option.value}
          >
            <input
              checked={option.value === value}
              className="sr-only"
              data-testid={optionTestId?.(option.value)}
              name={name}
              onChange={() => onValueChange(option.value)}
              type="radio"
              value={option.value}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default ChoiceField;
