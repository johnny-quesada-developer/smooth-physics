import { createGlobalState } from 'react-global-state-hooks';
import type { StageRequest } from '@/features/Stage/components/ClothCanvas';
import type { ControlValue, ControlValues } from '@/features/Stage/runtime/types';

export type PlaygroundState = {
  // Only values the reader changed, by example slug; the defaults come from the example's controls.
  readonly overrides: Readonly<Record<string, ControlValues>>;
  readonly paused: boolean;
  readonly collidersVisible: boolean;
  readonly request: StageRequest | null;
};

const INITIAL_STATE: PlaygroundState = { overrides: {}, paused: false, collidersVisible: false, request: null };

const usePlayground = createGlobalState(INITIAL_STATE, {
  name: 'playground',
  actions: {
    setValue({ slug, key, value }: { slug: string; key: string; value: ControlValue }) {
      return ({ setState }) => {
        setState((state) => ({ ...state, overrides: { ...state.overrides, [slug]: { ...state.overrides[slug], [key]: value } } }));
      };
    },
    resetValues(slug: string) {
      return ({ setState }) => {
        setState((state) => ({ ...state, overrides: { ...state.overrides, [slug]: {} }, request: nextRequest({ state, action: 'reset' }) }));
      };
    },
    setPaused(paused: boolean) {
      return ({ setState }) => {
        setState((state) => ({ ...state, paused }));
      };
    },
    setCollidersVisible(collidersVisible: boolean) {
      return ({ setState }) => {
        setState((state) => ({ ...state, collidersVisible }));
      };
    },
    requestAction(action: string) {
      return ({ setState }) => {
        setState((state) => ({ ...state, request: nextRequest({ state, action }) }));
      };
    },
  },
});

export default usePlayground;

function nextRequest({ state, action }: { state: PlaygroundState; action: string }): StageRequest {
  return { id: (state.request?.id ?? 0) + 1, action };
}
