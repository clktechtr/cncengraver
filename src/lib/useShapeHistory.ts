import { useCallback, useReducer } from 'react';
import type { Shape } from '@/types';

const HISTORY_LIMIT = 100;

type Updater = (prev: Shape[]) => Shape[];

type HistoryState = {
  past: Shape[][];
  present: Shape[];
  future: Shape[][];
  pending: Shape[] | null;
};

type Action =
  | { type: 'commit'; updater: Updater }
  | { type: 'drag'; updater: Updater }
  | { type: 'begin' }
  | { type: 'end' }
  | { type: 'undo' }
  | { type: 'redo' };

function pushPast(past: Shape[][], snapshot: Shape[]): Shape[][] {
  return [...past, snapshot].slice(-HISTORY_LIMIT);
}

function reducer(state: HistoryState, action: Action): HistoryState {
  switch (action.type) {
    case 'commit': {
      const next = action.updater(state.present);
      return { past: pushPast(state.past, state.present), present: next, future: [], pending: null };
    }
    case 'drag': {
      const next = action.updater(state.present);
      if (state.pending) {
        return { past: pushPast(state.past, state.pending), present: next, future: [], pending: null };
      }
      return { ...state, present: next };
    }
    case 'begin':
      return { ...state, pending: state.present };
    case 'end':
      return { ...state, pending: null };
    case 'undo': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        pending: null,
      };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return {
        past: pushPast(state.past, state.present),
        present: next,
        future: rest,
        pending: null,
      };
    }
  }
}

export function useShapeHistory(initial: Shape[] = []) {
  const [state, dispatch] = useReducer(reducer, {
    past: [],
    present: initial,
    future: [],
    pending: null,
  });

  const setShapes = useCallback((value: Shape[] | Updater) => {
    const updater: Updater = typeof value === 'function' ? value : () => value;
    dispatch({ type: 'commit', updater });
  }, []);

  const setShapesLive = useCallback((updater: Updater) => {
    dispatch({ type: 'drag', updater });
  }, []);

  const beginEdit = useCallback(() => dispatch({ type: 'begin' }), []);
  const endEdit = useCallback(() => dispatch({ type: 'end' }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);

  return {
    shapes: state.present,
    setShapes,
    setShapesLive,
    beginEdit,
    endEdit,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
