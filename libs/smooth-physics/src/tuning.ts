// Changes a running cloth's settings without resetting its particles. Valid settings are always applied: data that
// only some settings need (bending, the rest gravity direction) is built when they change. Invalid ones throw.
import { patchSettings, settingsConfiguration, type ClothSettingsInput } from './authoring.ts';
import type { SimulatedCloth } from './simulated-cloth.ts';
import { clothParameters } from './parameters.ts';

// Patches the cloth's settings: what is left out keeps its current value.
export function tuneCloth({ simulation, settings }: { simulation: SimulatedCloth; settings: ClothSettingsInput }): void {
  const nextSettings = patchSettings({ current: simulation.settings, patch: settings, name: simulation.name, up: simulation.axes.coordinates.up });
  simulation.retune({ settings: nextSettings, parameters: clothParameters(settingsConfiguration({ settings: nextSettings, axes: simulation.axes })) });
}
