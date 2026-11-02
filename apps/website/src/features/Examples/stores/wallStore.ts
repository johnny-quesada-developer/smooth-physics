import { createGlobalState } from 'react-global-state-hooks';
import type { WallStatistics, WallThread } from '../wall/WallSession';

export type WallState = { readonly chains: number; readonly thread: WallThread; readonly statistics: WallStatistics | null; readonly problem: string | null };

const INITIAL_STATE: WallState = { chains: 64, thread: 'worker', statistics: null, problem: null };

const useWall = createGlobalState(INITIAL_STATE, {
  name: 'wall',
  actions: {
    setChains(chains: number) {
      return ({ setState }) => {
        setState((state) => ({ ...state, chains, statistics: null, problem: null }));
      };
    },
    setThread(thread: WallThread) {
      return ({ setState }) => {
        setState((state) => ({ ...state, thread, statistics: null, problem: null }));
      };
    },
    report(statistics: WallStatistics) {
      return ({ setState }) => {
        setState((state) => ({ ...state, statistics }));
      };
    },
    fail(problem: string) {
      return ({ setState }) => {
        setState((state) => ({ ...state, problem }));
      };
    },
  },
});

export default useWall;
