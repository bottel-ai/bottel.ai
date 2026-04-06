import React, { createContext, useContext, useReducer, useCallback } from "react";

// ─── Screen Types ────────────────────────────────────────────────

export type Screen =
  | { name: "home" }
  | { name: "search" }
  | { name: "agent-detail"; agentId: string }
  | { name: "installed" }
  | { name: "settings" }
  | { name: "auth" }
  | { name: "submit" }
  | { name: "my-apps" }
  | { name: "trending" }
  | { name: "chat-list" }
  | { name: "chat-view"; chatId: string }
  | { name: "profile-setup" }
;

// ─── Screen State (persisted across navigation) ─────────────────

export interface SearchState {
  query: string;
  selectedIndex: number;
  page: number;
  inputFocused: boolean;
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

export interface AuthScreenState {
  selectedIndex: number;
}

export interface MyAppsState {
  selectedIndex: number;
}

export interface SubmitState {
  step: number;  // 0=name, 1=slug, 2=description, 3=version, 4=confirm
  name: string;
  slug: string;
  description: string;
  version: string;
}

export interface ChatListState {
  selectedIndex: number;
}

export interface ChatViewState {
  inputText: string;
}

export interface ProfileSetupState {
  step: number;
  name: string;
  bio: string;
  isPublic: boolean;
}

// ─── App State ──────────────────────────────────────────────────

export interface AppState {
  screen: Screen;
  history: Screen[];
  installed: Set<string>;
  search: SearchState;
  home: HomeState;
  installedScreen: InstalledState;
  settings: SettingsState;
  agentDetail: AgentDetailState;
  authScreen: AuthScreenState;
  submit: SubmitState;
  myApps: MyAppsState;
  chatList: ChatListState;
  chatView: ChatViewState;
  profileSetup: ProfileSetupState;
}

const INITIAL_SEARCH: SearchState = {
  query: "",
  selectedIndex: 0,
  page: 0,
  inputFocused: true,
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

const INITIAL_AUTH_SCREEN: AuthScreenState = {
  selectedIndex: 0,
};

const INITIAL_MY_APPS: MyAppsState = {
  selectedIndex: 0,
};

const INITIAL_SUBMIT: SubmitState = {
  step: 0,
  name: "",
  slug: "",
  description: "",
  version: "0.1.0",
};

const INITIAL_CHAT_LIST: ChatListState = {
  selectedIndex: 0,
};

const INITIAL_CHAT_VIEW: ChatViewState = {
  inputText: "",
};

const INITIAL_PROFILE_SETUP: ProfileSetupState = {
  step: 0,
  name: "",
  bio: "",
  isPublic: false,
};

const INITIAL_STATE: AppState = {
  screen: { name: "home" },
  history: [],
  installed: new Set(["code-reviewer", "translator", "data-analyst"]),
  search: INITIAL_SEARCH,
  home: INITIAL_HOME,
  installedScreen: INITIAL_INSTALLED,
  settings: INITIAL_SETTINGS,
  agentDetail: INITIAL_AGENT_DETAIL,
  authScreen: INITIAL_AUTH_SCREEN,
  submit: INITIAL_SUBMIT,
  myApps: INITIAL_MY_APPS,
  chatList: INITIAL_CHAT_LIST,
  chatView: INITIAL_CHAT_VIEW,
  profileSetup: INITIAL_PROFILE_SETUP,
};

// ─── Actions ────────────────────────────────────────────────────

export type Action =
  | { type: "NAVIGATE"; screen: Screen }
  | { type: "GO_BACK" }
  | { type: "GO_HOME" }
  | { type: "INSTALL_AGENT"; agentId: string }
  | { type: "UNINSTALL_AGENT"; agentId: string }
  | { type: "UPDATE_SEARCH"; state: Partial<SearchState> }
  | { type: "UPDATE_HOME"; state: Partial<HomeState> }
  | { type: "UPDATE_INSTALLED"; state: Partial<InstalledState> }
  | { type: "UPDATE_SETTINGS"; state: Partial<SettingsState> }
  | { type: "UPDATE_AGENT_DETAIL"; state: Partial<AgentDetailState> }
  | { type: "UPDATE_AUTH_SCREEN"; state: Partial<AuthScreenState> }
  | { type: "UPDATE_SUBMIT"; state: Partial<SubmitState> }
  | { type: "UPDATE_MY_APPS"; state: Partial<MyAppsState> }
  | { type: "UPDATE_CHAT_LIST"; state: Partial<ChatListState> }
  | { type: "UPDATE_CHAT_VIEW"; state: Partial<ChatViewState> }
  | { type: "UPDATE_PROFILE_SETUP"; state: Partial<ProfileSetupState> }
  | { type: "RESET_SEARCH" };

// ─── Reducer ────────────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "NAVIGATE": {
      // Reset the target screen's state when navigating forward
      // (going BACK will not reset — it preserves state)
      const resets: Partial<AppState> = {};
      switch (action.screen.name) {
        // search: don't reset — Home may set query before navigating
        case "installed": resets.installedScreen = INITIAL_INSTALLED; break;
        case "settings": resets.settings = INITIAL_SETTINGS; break;
        case "agent-detail": resets.agentDetail = INITIAL_AGENT_DETAIL; break;
        case "home": resets.home = INITIAL_HOME; break;
        case "auth": resets.authScreen = INITIAL_AUTH_SCREEN; break;
        case "submit": resets.submit = INITIAL_SUBMIT; break;
        case "my-apps": resets.myApps = INITIAL_MY_APPS; break;
        case "chat-list": resets.chatList = INITIAL_CHAT_LIST; break;
        case "chat-view": resets.chatView = INITIAL_CHAT_VIEW; break;
        case "profile-setup": resets.profileSetup = INITIAL_PROFILE_SETUP; break;
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

    case "UPDATE_AUTH_SCREEN":
      return {
        ...state,
        authScreen: { ...state.authScreen, ...action.state },
      };

    case "UPDATE_SUBMIT":
      return {
        ...state,
        submit: { ...state.submit, ...action.state },
      };

    case "UPDATE_MY_APPS":
      return {
        ...state,
        myApps: { ...state.myApps, ...action.state },
      };

    case "UPDATE_CHAT_LIST":
      return {
        ...state,
        chatList: { ...state.chatList, ...action.state },
      };

    case "UPDATE_CHAT_VIEW":
      return {
        ...state,
        chatView: { ...state.chatView, ...action.state },
      };

    case "UPDATE_PROFILE_SETUP":
      return {
        ...state,
        profileSetup: { ...state.profileSetup, ...action.state },
      };

    case "RESET_SEARCH":
      return { ...state, search: INITIAL_SEARCH };

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
