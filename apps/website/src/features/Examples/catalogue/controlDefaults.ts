import type { ControlTiming, ControlValues } from '@/features/Stage/runtime/types';
import type { ControlDefinition } from './types';

export function controlDefaults(controls: readonly ControlDefinition[]): ControlValues {
  const values: Record<string, number | boolean | string> = {};
  for (const control of controls) if (control.kind !== 'action') values[control.key] = control.initial;
  return values;
}

export function controlTimings(controls: readonly ControlDefinition[]): Readonly<Record<string, ControlTiming>> {
  const timings: Record<string, ControlTiming> = {};
  for (const control of controls) if (control.kind !== 'action') timings[control.key] = control.timing;
  return timings;
}
