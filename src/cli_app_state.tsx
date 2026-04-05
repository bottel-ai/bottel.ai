import React, { createContext, useContext, useReducer, useCallback } from "react";

// ─── Screen Types ────────────────────────────────────────────────

export type Screen =
  | { name: "home" }
  | { name: "browse" }
  | { name: "search" }
  | { name: "agent-detail"; agentId: string }
  | { name: "installed" }
  | { name: "settings" }
;

// ─── Screen State (persisted across navigation) ─────────────────

export interface SearchState {
  query: string;
  selectedIndex: number;
  page: number;
  inputFocused: boolean;
}

export interface BrowseState {
  categoryIndex: number;
  expandedCategory: number | null;
  agentIndex: number;
  agentPage: number;
  inAgents: boolean;
}

export interface HomeState {
  selectedIndex: number;
}

export interface InstalledState {
  selectedIndex: number;
}

export interface SettingsState {
  selectedIndex: number;
}

export interface AgentDetailState {
  buttonIndex: number;
}

// ─── App State ──────────────────────────────────────────────────

export interface AppState {
  screen: Screen;
  history: Screen[];
  installed: Set<string>;
  search: SearchState;
  browse: BrowseState;
  home: HomeState;
  installedScreen: InstalledState;
  settings: SettingsState;
  agentDetail: AgentDetailState;
}

const INITIAL_SEARCH: SearchState = {
  query: "",
  selectedIndex: 0,
  page: 0,
  inputFocused: true,
};

const INITIAL_BROWSE: BrowseState = {
  categoryIndex: 0,
  expandedCategory: null,
  agentIndex: 0,
  agentPage: 0,
  inAgents: false,
};

const INITIAL_HOME: HomeState = {
  selectedIndex: 0,
};

const INITIAL_INSTALLED: InstalledState = {
  selectedIndex: 0,
};

const INITIAL_SETTINGS: SettingsState = {
  selectedIndex: 0,
};

const INITIAL_AGENT_DETAIL: AgentDetailState = {
  buttonIndex: 0,
};

const INITIAL_STATE: AppState = {
  screen: { name: "home" },
  history: [],
  installed: new Set(["code-reviewer", "translator", "data-analyst"]),
  search: INITIAL_SEARCH,
  browse: INITIAL_BROWSE,
  home: INITIAL_HOME,
  installedScreen: INITIAL_INSTALLED,
  settings: INITIAL_SETTINGS,
  agentDetail: INITIAL_AGENT_DETAIL,
};

// ─── Actions ────────────────────────────────────────────────────

export type Action =
  | { type: "NAVIGATE"; screen: Screen }
  | { type: "GO_BACK" }
  | { type: "GO_HOME" }
  | { type: "INSTALL_AGENT"; agentId: string }
  | { type: "UNINSTALL_AGENT"; agentId: string }
  | { type: "UPDATE_SEARCH"; state: Partial<SearchState> }
  | { type: "UPDATE_BROWSE"; state: Partial<BrowseState> }
  | { type: "UPDATE_HOME"; state: Partial<HomeState> }
  | { type: "UPDATE_INSTALLED"; state: Partial<InstalledState> }
  | { type: "UPDATE_SETTINGS"; state: Partial<SettingsState> }
  | { type: "UPDATE_AGENT_DETAIL"; state: Partial<AgentDetailState> }
  | { type: "RESET_SEARCH" }
  | { type: "RESET_BROWSE" };

// ─── Reducer ────────────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "NAVIGATE": {
      // Reset the target screen's state when navigating forward
      // (going BACK will not reset — it preserves state)
      const resets: Partial<AppState> = {};
      switch (action.screen.name) {
        case "search": resets.search = INITIAL_SEARCH; break;
        case "browse": resets.browse = INITIAL_BROWSE; break;
        case "installed": resets.installedScreen = INITIAL_INSTALLED; break;
        case "settings": resets.settings = INITIAL_SETTINGS; break;
        case "agent-detail": resets.agentDetail = INITIAL_AGENT_DETAIL; break;
        case "home": resets.home = INITIAL_HOME; break;
      }
      return {
        ...state,
        ...resets,
        history: [...state.history, state.screen],
        screen: action.screen,
      };
    }

    case "GO_BACK": {
      if (state.history.length === 0) {
        return { ...state, screen: { name: "home" } };
      }
      const newHistory = [...state.history];
      const last = newHistory.pop()!;
      return { ...state, history: newHistory, screen: last };
    }

    case "GO_HOME":
      return {
        ...state,
        history: [],
        screen: { name: "home" },
      };

    case "INSTALL_AGENT": {
      const installed = new Set(state.installed);
      installed.add(action.agentId);
      return { ...state, installed };
    }

    case "UNINSTALL_AGENT": {
      const installed = new Set(state.installed);
      installed.delete(action.agentId);
      return { ...state, installed };
    }

    case "UPDATE_SEARCH":
      return {
        ...state,
        search: { ...state.search, ...action.state },
      };

    case "UPDATE_BROWSE":
      return {
        ...state,
        browse: { ...state.browse, ...action.state },
      };

    case "UPDATE_HOME":
      return {
        ...state,
        home: { ...state.home, ...action.state },
      };

    case "UPDATE_INSTALLED":
      return {
        ...state,
        installedScreen: { ...state.installedScreen, ...action.state },
      };

    case "UPDATE_SETTINGS":
      return {
        ...state,
        settings: { ...state.settings, ...action.state },
      };

    case "UPDATE_AGENT_DETAIL":
      return {
        ...state,
        agentDetail: { ...state.agentDetail, ...action.state },
      };

    case "RESET_SEARCH":
      return { ...state, search: INITIAL_SEARCH };

    case "RESET_BROWSE":
      return { ...state, browse: INITIAL_BROWSE };

    default:
      return state;
  }
}

// ─── Context ────────────────────────────────────────────────────

interface StoreContext {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  navigate: (screen: Screen) => void;
  goBack: () => void;
  goHome: () => void;
}

const Store = createContext<StoreContext>(null!);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const navigate = useCallback(
    (screen: Screen) => dispatch({ type: "NAVIGATE", screen }),
    []
  );

  const goBack = useCallback(
    () => dispatch({ type: "GO_BACK" }),
    []
  );

  const goHome = useCallback(
    () => dispatch({ type: "GO_HOME" }),
    []
  );

  return (
    <Store.Provider value={{ state, dispatch, navigate, goBack, goHome }}>
      {children}
    </Store.Provider>
  );
}

export function useStore() {
  return useContext(Store);
}
