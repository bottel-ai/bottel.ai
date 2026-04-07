import React, { createContext, useContext, useReducer, useCallback } from "react";

// ─── Generic Types ─────────────────────────────────────────────

/** Constraint: every screen must have a `name` string field. */
export type ScreenBase = { name: string };

/**
 * Maps each screen name to the shape of its per-screen state.
 * e.g. `{ home: { selectedIndex: number }; detail: { tab: number } }`
 */
export type ScreenStatesBase = Record<string, Record<string, unknown>>;

// ─── Actions ───────────────────────────────────────────────────

export type Action<TScreen extends ScreenBase, TScreenStates extends ScreenStatesBase> =
  | { type: "NAVIGATE"; screen: TScreen }
  | { type: "GO_BACK" }
  | { type: "GO_HOME" }
  | {
      type: "UPDATE_SCREEN_STATE";
      name: keyof TScreenStates & string;
      state: Partial<TScreenStates[keyof TScreenStates]>;
    };

// ─── Internal State ────────────────────────────────────────────

interface InternalState<TScreen extends ScreenBase, TScreenStates extends ScreenStatesBase> {
  screen: TScreen;
  history: TScreen[];
  screenStates: TScreenStates;
}

// ─── Context shape exposed to consumers ────────────────────────

export interface StoreContext<TScreen extends ScreenBase, TScreenStates extends ScreenStatesBase> {
  screen: TScreen;
  screenStates: TScreenStates;
  dispatch: React.Dispatch<Action<TScreen, TScreenStates>>;
  navigate: (screen: TScreen) => void;
  goBack: () => void;
  goHome: () => void;
  updateScreenState: <K extends keyof TScreenStates & string>(
    name: K,
    partial: Partial<TScreenStates[K]>,
  ) => void;
}

// ─── Factory ───────────────────────────────────────────────────

export function createStore<
  TScreen extends ScreenBase,
  TScreenStates extends ScreenStatesBase,
>(
  initialScreen: TScreen,
  initialScreenStates: TScreenStates,
) {
  // Build the reducer closed over initialScreenStates so NAVIGATE can reset.
  function reducer(
    state: InternalState<TScreen, TScreenStates>,
    action: Action<TScreen, TScreenStates>,
  ): InternalState<TScreen, TScreenStates> {
    switch (action.type) {
      case "NAVIGATE": {
        const targetName = action.screen.name as keyof TScreenStates & string;
        // Reset the target screen's state to its initial value.
        const resetScreenStates = {
          ...state.screenStates,
          ...(targetName in initialScreenStates
            ? { [targetName]: { ...initialScreenStates[targetName] } }
            : {}),
        } as TScreenStates;

        return {
          ...state,
          history: [...state.history, state.screen],
          screen: action.screen,
          screenStates: resetScreenStates,
        };
      }

      case "GO_BACK": {
        if (state.history.length === 0) {
          // Already at root — go to initial screen, preserve state.
          return { ...state, screen: initialScreen };
        }
        const newHistory = [...state.history];
        const last = newHistory.pop()!;
        return { ...state, history: newHistory, screen: last };
      }

      case "GO_HOME":
        return {
          ...state,
          history: [],
          screen: initialScreen,
        };

      case "UPDATE_SCREEN_STATE": {
        const key = action.name as keyof TScreenStates & string;
        return {
          ...state,
          screenStates: {
            ...state.screenStates,
            [key]: {
              ...state.screenStates[key],
              ...action.state,
            },
          } as TScreenStates,
        };
      }

      default:
        return state;
    }
  }

  // ── React Context + Provider + Hook ──────────────────────────

  const Ctx = createContext<StoreContext<TScreen, TScreenStates>>(null!);

  function StoreProvider({ children }: { children: React.ReactNode }) {
    const [state, dispatch] = useReducer(reducer, {
      screen: initialScreen,
      history: [],
      screenStates: { ...initialScreenStates },
    });

    const navigate = useCallback(
      (screen: TScreen) => dispatch({ type: "NAVIGATE", screen }),
      [],
    );

    const goBack = useCallback(() => dispatch({ type: "GO_BACK" }), []);

    const goHome = useCallback(() => dispatch({ type: "GO_HOME" }), []);

    const updateScreenState = useCallback(
      <K extends keyof TScreenStates & string>(
        name: K,
        partial: Partial<TScreenStates[K]>,
      ) =>
        dispatch({
          type: "UPDATE_SCREEN_STATE",
          name,
          state: partial as Partial<TScreenStates[keyof TScreenStates]>,
        }),
      [],
    );

    return (
      <Ctx.Provider
        value={{
          screen: state.screen,
          screenStates: state.screenStates,
          dispatch,
          navigate,
          goBack,
          goHome,
          updateScreenState,
        }}
      >
        {children}
      </Ctx.Provider>
    );
  }

  function useStore(): StoreContext<TScreen, TScreenStates> {
    const ctx = useContext(Ctx);
    if (ctx === null) {
      throw new Error("useStore must be used within a <StoreProvider>");
    }
    return ctx;
  }

  return { StoreProvider, useStore };
}
