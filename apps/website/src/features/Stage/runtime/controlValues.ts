import type { ControlValues } from './types';

export function readNumber({ values, key, fallback }: { values: ControlValues; key: string; fallback: number }): number {
  const value = values[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function readFlag({ values, key, fallback }: { values: ControlValues; key: string; fallback: boolean }): boolean {
  const value = values[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function readChoice<Choice extends string>({
  values,
  key,
  choices,
  fallback,
}: {
  values: ControlValues;
  key: string;
  choices: readonly Choice[];
  fallback: Choice;
}): Choice {
  const value = values[key];
  return choices.find((choice) => choice === value) ?? fallback;
}
