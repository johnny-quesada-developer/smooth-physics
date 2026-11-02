import { createGlobalState } from 'react-global-state-hooks';
import type { StageStatistics } from '../runtime/types';

// The rgsh way to type a store that starts empty: widen the initial value and let the state type be inferred.
// A sanctioned exception to the no-assertion rule (see vite.config.ts).
const useStageStatistics = createGlobalState(null as StageStatistics | null, { name: 'stageStatistics' });

export default useStageStatistics;
