import React, { createContext, useContext, useReducer, useCallback } from "react";

// ─── Domain Types (shared with F2/F3) ───────────────────────────

export type Channel = {
  name: string;
  description: string;
  created_by: string;
  schema: string | null;
  message_count: number;
  subscriber_count: number;
  is_public: number;
  created_at: string;
};

export type ChannelMessage = {
  id: string;
  channel: string;
  author: string;
  author_name?: string;
  payload: any;
  signature: string | null;
  parent_id: string | null;
  created_at: string;
};

export interface DirectChat {
  id: string;
  other_fp: string;
  other_name: string | null;
  last_message: string | null;
  last_message_at: string | null;
  created_by: string;
  status?: string;
}

export interface DirectMessage {
  id: string;
  chat_id: string;
  sender: string;
  sender_name: string | null;
  content: string;
  created_at: string;
}

// ─── Screen Types ────────────────────────────────────────────────

export type Screen =
  | { name: "home" }
  | { name: "search" }
  | { name: "channel-list" }
  | { name: "channel-view"; channelName: string }
  | { name: "channel-create" }
  | { name: "profile-setup" }
  | { name: "auth" }
  | { name: "settings" }
  | { name: "chat-list" }
  | { name: "chat-view"; chatId: string };

// ─── Screen State ───────────────────────────────────────────────

export interface HomeState {
  menuIndex: number;
}

export interface SearchState {
  query: string;
  results: Channel[];
  selectedIndex: number;
  loading: boolean;
}

export interface ChannelListState {
  channels: Channel[];
  selectedIndex: number;
  loading: boolean;
}

export interface ChannelViewState {
  messages: ChannelMessage[];
  input: string;
  loading: boolean;
  wsConnected: boolean;
  hasMoreOlder: boolean;
}

export interface ChannelCreateState {
  step: number;
  name: string;
  description: string;
  isPublic: boolean;
  error: string | null;
  submitting: boolean;
}

export interface ProfileSetupState {
  step: number;
  name: string;
  bio: string;
  isPublic: boolean;
}

export interface AuthScreenState {
  selectedIndex: number;
}

export interface SettingsState {
  selectedIndex: number;
}

export interface ChatListState {
  chats: DirectChat[];
  selectedIndex: number;
  loading: boolean;
}

export interface ChatViewState {
  messages: DirectMessage[];
  input: string;
  loading: boolean;
  wsConnected: boolean;
}

// ─── App State ──────────────────────────────────────────────────

export interface AppState {
  screen: Screen;
  history: Screen[];
  home: HomeState;
  search: SearchState;
  channelList: ChannelListState;
  channelView: ChannelViewState;
  channelCreate: ChannelCreateState;
  profileSetup: ProfileSetupState;
  authScreen: AuthScreenState;
  settings: SettingsState;
  chatList: ChatListState;
  chatView: ChatViewState;
}

const INITIAL_HOME: HomeState = { menuIndex: 0 };

const INITIAL_SEARCH: SearchState = {
  query: "",
  results: [],
  // -1 means the text input is focused (Search.tsx convention).
  selectedIndex: -1,
  loading: false,
};

const INITIAL_CHANNEL_LIST: ChannelListState = {
  channels: [],
  selectedIndex: 0,
  loading: false,
};

const INITIAL_CHANNEL_VIEW: ChannelViewState = {
  messages: [],
  input: "",
  loading: false,
  wsConnected: false,
  // Optimistic — we don't yet know if there's more, but we'll find out on the
  // first scroll-up attempt. Cleared to false once we get an empty page back.
  hasMoreOlder: true,
};

const INITIAL_CHANNEL_CREATE: ChannelCreateState = {
  step: 0,
  name: "",
  description: "",
  isPublic: true,
  error: null,
  submitting: false,
};

const INITIAL_PROFILE_SETUP: ProfileSetupState = {
  step: 0,
  name: "",
  bio: "",
  isPublic: false,
};

const INITIAL_AUTH_SCREEN: AuthScreenState = { selectedIndex: 0 };
const INITIAL_SETTINGS: SettingsState = { selectedIndex: 0 };

const INITIAL_CHAT_LIST: ChatListState = {
  chats: [],
  selectedIndex: 0,
  loading: false,
};

const INITIAL_CHAT_VIEW: ChatViewState = {
  messages: [],
  input: "",
  loading: false,
  wsConnected: false,
};

const INITIAL_STATE: AppState = {
  screen: { name: "home" },
  history: [],
  home: INITIAL_HOME,
  search: INITIAL_SEARCH,
  channelList: INITIAL_CHANNEL_LIST,
  channelView: INITIAL_CHANNEL_VIEW,
  channelCreate: INITIAL_CHANNEL_CREATE,
  profileSetup: INITIAL_PROFILE_SETUP,
  authScreen: INITIAL_AUTH_SCREEN,
  settings: INITIAL_SETTINGS,
  chatList: INITIAL_CHAT_LIST,
  chatView: INITIAL_CHAT_VIEW,
};

// ─── Actions ────────────────────────────────────────────────────

// Updaters accept either a partial slice or a function that takes the
// latest slice and returns a partial. The functional form is required
// for handlers that fire multiple times between renders (e.g. arrow-key
// navigation), where a closed-over slice value would be stale.
type Updater<S> = Partial<S> | ((s: S) => Partial<S>);

export type Action =
  | { type: "NAVIGATE"; screen: Screen }
  | { type: "NAVIGATE_REPLACE"; screen: Screen }
  | { type: "GO_BACK" }
  | { type: "GO_HOME" }
  | { type: "UPDATE_HOME"; state: Updater<HomeState> }
  | { type: "UPDATE_SEARCH"; state: Updater<SearchState> }
  | { type: "UPDATE_CHANNEL_LIST"; state: Updater<ChannelListState> }
  | { type: "UPDATE_CHANNEL_VIEW"; state: Updater<ChannelViewState> }
  | { type: "APPEND_CHANNEL_MESSAGE"; message: ChannelMessage }
  | { type: "PREPEND_CHANNEL_MESSAGES"; messages: ChannelMessage[] }
  | { type: "UPDATE_CHANNEL_CREATE"; state: Updater<ChannelCreateState> }
  | { type: "UPDATE_PROFILE_SETUP"; state: Updater<ProfileSetupState> }
  | { type: "UPDATE_AUTH_SCREEN"; state: Updater<AuthScreenState> }
  | { type: "UPDATE_SETTINGS"; state: Updater<SettingsState> }
  | { type: "UPDATE_CHAT_LIST"; state: Updater<ChatListState> }
  | { type: "UPDATE_CHAT_VIEW"; state: Updater<ChatViewState> }
  | { type: "APPEND_DIRECT_MESSAGE"; message: DirectMessage };

function applyUpdater<S>(current: S, u: Updater<S>): S {
  const patch = typeof u === "function" ? (u as (s: S) => Partial<S>)(current) : u;
  return { ...current, ...patch };
}

// ─── Reducer ────────────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "NAVIGATE": {
      const resets: Partial<AppState> = {};
      switch (action.screen.name) {
        case "home": resets.home = INITIAL_HOME; break;
        // search: don't reset — Home may set query before navigating
        case "channel-list": resets.channelList = INITIAL_CHANNEL_LIST; break;
        case "channel-view": resets.channelView = INITIAL_CHANNEL_VIEW; break;
        case "channel-create": resets.channelCreate = INITIAL_CHANNEL_CREATE; break;
        case "profile-setup": resets.profileSetup = INITIAL_PROFILE_SETUP; break;
        case "auth": resets.authScreen = INITIAL_AUTH_SCREEN; break;
        case "settings": resets.settings = INITIAL_SETTINGS; break;
        case "chat-list": resets.chatList = INITIAL_CHAT_LIST; break;
        case "chat-view": resets.chatView = INITIAL_CHAT_VIEW; break;
      }
      return {
        ...state,
        ...resets,
        history: [...state.history, state.screen],
        screen: action.screen,
      };
    }

    case "NAVIGATE_REPLACE": {
      // Swap the current screen without pushing it onto history.
      // Used after one-shot transitional screens (e.g. CreateChannel)
      // so the user can't Esc back into the dismissed form.
      const resets: Partial<AppState> = {};
      switch (action.screen.name) {
        case "home": resets.home = INITIAL_HOME; break;
        case "channel-list": resets.channelList = INITIAL_CHANNEL_LIST; break;
        case "channel-view": resets.channelView = INITIAL_CHANNEL_VIEW; break;
        case "channel-create": resets.channelCreate = INITIAL_CHANNEL_CREATE; break;
        case "profile-setup": resets.profileSetup = INITIAL_PROFILE_SETUP; break;
        case "auth": resets.authScreen = INITIAL_AUTH_SCREEN; break;
        case "settings": resets.settings = INITIAL_SETTINGS; break;
        case "chat-list": resets.chatList = INITIAL_CHAT_LIST; break;
        case "chat-view": resets.chatView = INITIAL_CHAT_VIEW; break;
      }
      return { ...state, ...resets, screen: action.screen };
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
      return { ...state, history: [], screen: { name: "home" } };

    case "UPDATE_HOME":
      return { ...state, home: applyUpdater(state.home, action.state) };
    case "UPDATE_SEARCH":
      return { ...state, search: applyUpdater(state.search, action.state) };
    case "UPDATE_CHANNEL_LIST":
      return { ...state, channelList: applyUpdater(state.channelList, action.state) };
    case "UPDATE_CHANNEL_VIEW":
      return { ...state, channelView: applyUpdater(state.channelView, action.state) };
    case "APPEND_CHANNEL_MESSAGE": {
      // Atomic dedupe-and-append against the latest state, so WebSocket
      // handlers don't lose messages to a stale React closure.
      if (state.channelView.messages.some((m) => m.id === action.message.id)) {
        return state;
      }
      return {
        ...state,
        channelView: {
          ...state.channelView,
          messages: [...state.channelView.messages, action.message],
        },
      };
    }
    case "PREPEND_CHANNEL_MESSAGES": {
      // Add older messages to the front of the list, deduped by id, sorted
      // chronologically (oldest first). Used by scroll-up pagination.
      const existing = state.channelView.messages;
      const seen = new Set(existing.map((m) => m.id));
      const fresh = action.messages.filter((m) => !seen.has(m.id));
      const merged = [...fresh, ...existing].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      return {
        ...state,
        channelView: { ...state.channelView, messages: merged },
      };
    }
    case "UPDATE_CHANNEL_CREATE":
      return { ...state, channelCreate: applyUpdater(state.channelCreate, action.state) };
    case "UPDATE_PROFILE_SETUP":
      return { ...state, profileSetup: applyUpdater(state.profileSetup, action.state) };
    case "UPDATE_AUTH_SCREEN":
      return { ...state, authScreen: applyUpdater(state.authScreen, action.state) };
    case "UPDATE_SETTINGS":
      return { ...state, settings: applyUpdater(state.settings, action.state) };
    case "UPDATE_CHAT_LIST":
      return { ...state, chatList: applyUpdater(state.chatList, action.state) };
    case "UPDATE_CHAT_VIEW":
      return { ...state, chatView: applyUpdater(state.chatView, action.state) };
    case "APPEND_DIRECT_MESSAGE": {
      if (state.chatView.messages.some((m) => m.id === action.message.id)) {
        return state;
      }
      return {
        ...state,
        chatView: {
          ...state.chatView,
          messages: [...state.chatView.messages, action.message],
        },
      };
    }

    default:
      return state;
  }
}

// ─── Context ────────────────────────────────────────────────────

/**
 * Scroll controls exposed by App.tsx so screen components can read and
 * adjust the global ScrollView without owning the ref. Implementations
 * are wired up by App at mount time; the defaults are no-ops so unit
 * tests that render screens in isolation don't crash.
 */
export interface ScrollControls {
  getOffset: () => number;
  getBottom: () => number;
  scrollTo: (offset: number) => void;
}

interface StoreContext {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  navigate: (screen: Screen) => void;
  navigateReplace: (screen: Screen) => void;
  goBack: () => void;
  goHome: () => void;
  scroll: ScrollControls;
  setScrollControls: (c: ScrollControls) => void;
}

const Store = createContext<StoreContext>(null!);

const NOOP_SCROLL: ScrollControls = {
  getOffset: () => 0,
  getBottom: () => 0,
  scrollTo: () => {},
};

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const scrollRef = React.useRef<ScrollControls>(NOOP_SCROLL);

  const navigate = useCallback(
    (screen: Screen) => dispatch({ type: "NAVIGATE", screen }),
    []
  );
  const navigateReplace = useCallback(
    (screen: Screen) => dispatch({ type: "NAVIGATE_REPLACE", screen }),
    []
  );
  const goBack = useCallback(() => dispatch({ type: "GO_BACK" }), []);
  const goHome = useCallback(() => dispatch({ type: "GO_HOME" }), []);

  const scroll: ScrollControls = {
    getOffset: () => scrollRef.current.getOffset(),
    getBottom: () => scrollRef.current.getBottom(),
    scrollTo: (n) => scrollRef.current.scrollTo(n),
  };
  const setScrollControls = useCallback((c: ScrollControls) => {
    scrollRef.current = c;
  }, []);

  return (
    <Store.Provider
      value={{
        state,
        dispatch,
        navigate,
        navigateReplace,
        goBack,
        goHome,
        scroll,
        setScrollControls,
      }}
    >
      {children}
    </Store.Provider>
  );
}

export function useStore() {
  return useContext(Store);
}
