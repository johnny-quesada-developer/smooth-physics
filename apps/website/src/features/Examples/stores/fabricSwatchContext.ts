// Actions use the ({ setState }) => … shape so the store keeps working if it moves between createContext and
// createGlobalState.
import { createContext } from 'react-global-state-hooks';
import type { ThreadColor } from '@/features/Stage/runtime/types';

export type FabricValues = { readonly gravity: number; readonly damping: number; readonly stiffness: number; readonly bending: number };
export type FabricPreset = { readonly id: 'silk' | 'linen' | 'felt'; readonly name: string; readonly color: ThreadColor; readonly values: FabricValues };
export type FabricSwatchState = {
  readonly preset: FabricPreset;
  readonly values: FabricValues;
  readonly paused: boolean;
  readonly physicsMilliseconds: number | null;
  readonly framesPerSecond: number | null;
};

const SILK: FabricPreset = { id: 'silk', name: 'Silk', color: 'lime', values: { gravity: 5, damping: 0.02, stiffness: 0.3, bending: 0.1 } };
const LINEN: FabricPreset = { id: 'linen', name: 'Linen', color: 'honey', values: { gravity: 5, damping: 0.06, stiffness: 0.6, bending: 0.5 } };
const FELT: FabricPreset = { id: 'felt', name: 'Felt', color: 'sage', values: { gravity: 5, damping: 0.15, stiffness: 0.95, bending: 1 } };

export const FABRIC_PRESETS: readonly FabricPreset[] = [SILK, LINEN, FELT];

export function swatchStateOf(preset: FabricPreset): FabricSwatchState {
  return { preset, values: preset.values, paused: false, physicsMilliseconds: null, framesPerSecond: null };
}

// The default state; each panel's provider starts from its own preset instead.
const FabricSwatchContext = createContext(swatchStateOf(SILK), {
  actions: {
    setValue({ key, value }: { key: keyof FabricValues; value: number }) {
      return ({ setState }) => {
        setState((state) => ({ ...state, values: { ...state.values, [key]: value } }));
      };
    },
    reset() {
      return ({ setState }) => {
        setState((state) => ({ ...state, values: state.preset.values }));
      };
    },
    setPaused(paused: boolean) {
      return ({ setState }) => {
        setState((state) => ({ ...state, paused }));
      };
    },
    report({ physicsMilliseconds, framesPerSecond }: { physicsMilliseconds: number; framesPerSecond: number }) {
      return ({ setState }) => {
        setState((state) => ({ ...state, physicsMilliseconds, framesPerSecond }));
      };
    },
  },
});

export default FabricSwatchContext;
