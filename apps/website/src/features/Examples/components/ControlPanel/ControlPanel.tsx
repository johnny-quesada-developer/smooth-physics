import classNames from 'classnames';
import type { ComponentProps, FC } from 'react';

import Button from '@/components/Button';
import ChoiceField from '@/components/ChoiceField';
import RangeField from '@/components/RangeField';
import SwitchField from '@/components/SwitchField';
import type { ControlValue, ControlValues } from '@/features/Stage/runtime/types';
import twMerge from '@/tailwind/twMerge';
import type { ControlDefinition } from '../../catalogue/types';
import ControlPanelTestIds from './ControlPanel.testIds';

type ControlPanelProps = ComponentProps<'div'> & {
  readonly controls: readonly ControlDefinition[];
  readonly values: ControlValues;
  readonly onValueChange: (change: { key: string; value: ControlValue }) => void;
  readonly onAction: (action: string) => void;
};

const ControlPanel: FC<ControlPanelProps> = ({ className, controls, values, onValueChange, onAction, ...props }) => {
  const actions = controls.filter((control) => control.kind === 'action');
  return (
    <div className={twMerge(classNames('ControlPanel', 'flex flex-col gap-4', className))} data-testid={ControlPanelTestIds.root} {...props}>
      {controls.map((control) => {
        const testId = ControlPanelTestIds.control(control.key);
        const value = values[control.key];
        switch (control.kind) {
          case 'range':
            return (
              <RangeField
                inputTestId={testId}
                key={control.key}
                label={control.label}
                maximum={control.maximum}
                minimum={control.minimum}
                onValueChange={(next) => onValueChange({ key: control.key, value: next })}
                step={control.step}
                value={typeof value === 'number' ? value : control.initial}
                {...(control.unit ? { unit: control.unit } : {})}
              />
            );
          case 'switch':
            return (
              <SwitchField
                checked={typeof value === 'boolean' ? value : control.initial}
                data-testid={testId}
                key={control.key}
                label={control.label}
                onCheckedChange={(checked) => onValueChange({ key: control.key, value: checked })}
              />
            );
          case 'choice':
            return (
              <ChoiceField
                data-testid={testId}
                key={control.key}
                label={control.label}
                onValueChange={(next) => onValueChange({ key: control.key, value: next })}
                optionTestId={(option) => ControlPanelTestIds.option({ key: control.key, value: option })}
                options={control.options}
                value={typeof value === 'string' ? value : control.initial}
              />
            );
          case 'action':
            return null;
        }
      })}
      {actions.length ? (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <Button data-testid={ControlPanelTestIds.control(action.key)} key={action.key} onClick={() => onAction(action.key)} tone="primary">
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default ControlPanel;
