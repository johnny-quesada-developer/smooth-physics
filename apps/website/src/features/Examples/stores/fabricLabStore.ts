import { createGlobalState } from 'react-global-state-hooks';
import { FABRIC_PRESETS, type FabricPreset } from './fabricSwatchContext';

export type FabricPanel = { readonly id: number; readonly preset: FabricPreset };
export type FabricLabState = { readonly panels: readonly FabricPanel[]; readonly nextId: number };

// Every panel is a WebGL canvas; browsers limit how many a page may keep.
export const MAXIMUM_PANELS = 4;

const INITIAL_STATE: FabricLabState = { panels: FABRIC_PRESETS.map((preset, index) => ({ id: index + 1, preset })), nextId: FABRIC_PRESETS.length + 1 };

const useFabricLab = createGlobalState(INITIAL_STATE, {
  name: 'fabricLab',
  actions: {
    // Adds the next preset in turn, so a lab can hold two independent swatches of the same fabric.
    addPanel() {
      return ({ setState }) => {
        setState((state) => {
          const preset = FABRIC_PRESETS[(state.nextId - 1) % FABRIC_PRESETS.length];
          if (!preset || state.panels.length >= MAXIMUM_PANELS) return state;
          return { panels: [...state.panels, { id: state.nextId, preset }], nextId: state.nextId + 1 };
        });
      };
    },
    removePanel(id: number) {
      return ({ setState }) => {
        setState((state) => (state.panels.length > 1 ? { ...state, panels: state.panels.filter((panel) => panel.id !== id) } : state));
      };
    },
  },
});

export default useFabricLab;
