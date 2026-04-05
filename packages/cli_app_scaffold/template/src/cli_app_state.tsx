import React, { createContext, useContext, useReducer, useCallback } from "react";

export type Screen = { name: "home" } | { name: "example" };

export interface AppState {
  screen: Screen;
  history: Screen[];
}

const INITIAL: AppState = { screen: { name: "home" }, history: [] };

type Action = { type: "NAVIGATE"; screen: Screen } | { type: "GO_BACK" };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "NAVIGATE": return { ...state, history: [...state.history, state.screen], screen: action.screen };
    case "GO_BACK": {
      if (state.history.length === 0) return { ...state, screen: { name: "home" } };
      const h = [...state.history]; const last = h.pop()!;
      return { ...state, history: h, screen: last };
    }
    default: return state;
  }
}

interface Ctx { state: AppState; dispatch: React.Dispatch<Action>; navigate: (s: Screen) => void; goBack: () => void; }
const Store = createContext<Ctx>(null!);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const navigate = useCallback((s: Screen) => dispatch({ type: "NAVIGATE", screen: s }), []);
  const goBack = useCallback(() => dispatch({ type: "GO_BACK" }), []);
  return <Store.Provider value={{ state, dispatch, navigate, goBack }}>{children}</Store.Provider>;
}

export function useStore() { return useContext(Store); }
