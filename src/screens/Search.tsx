import { useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../state.js";
import { colors } from "../theme.js";
import { Cursor, HelpFooter } from "../components.js";
import { listChannels } from "../lib/api.js";

export function Search() {
  const { state, dispatch, navigate, goBack } = useStore();
  const { query, results, selectedIndex, loading } = state.search;

  type Slice = typeof state.search;
  const update = (s: Partial<Slice> | ((cur: Slice) => Partial<Slice>)) =>
    dispatch({ type: "UPDATE_SEARCH", state: s });

  // selectedIndex === -1 means focus is in the input field.
  const inputFocused = selectedIndex === -1;

  // Track the most recently searched term for "no results" messaging.
  const searchedRef = useRef<string>("");

  // Debounced search: whenever `query` changes, kick off a 300ms timer.
  useEffect(() => {
    const term = query.trim();
    if (!term) {
      searchedRef.current = "";
      update({ results: [], loading: false });
      return;
    }
    update({ loading: true });
    const handle = setTimeout(() => {
      listChannels({ q: term })
        .then((channels) => {
          searchedRef.current = term;
          update({ results: channels, loading: false });
        })
        .catch(() => {
          searchedRef.current = term;
          update({ results: [], loading: false });
        });
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useInput((_input, key) => {
    if (key.escape) {
      goBack();
      return;
    }

    // Tab always returns focus to the input, no matter where the cursor is.
    if (key.tab) {
      update({ selectedIndex: -1 });
      return;
    }

    if (inputFocused) {
      // Moving down from the input into the list.
      if (key.downArrow && results.length > 0) {
        update({ selectedIndex: 0 });
      }
      return;
    }

    // Focus is in the results list.
    if (key.upArrow) {
      update((cur) =>
        cur.selectedIndex <= 0
          ? { selectedIndex: -1 }
          : { selectedIndex: cur.selectedIndex - 1 }
      );
      return;
    }
    if (key.downArrow) {
      update((cur) =>
        cur.selectedIndex < cur.results.length - 1
          ? { selectedIndex: cur.selectedIndex + 1 }
          : {}
      );
      return;
    }
    if (key.return) {
      const picked = results[selectedIndex];
      if (picked) {
        navigate({ name: "channel-view", channelName: picked.name });
      }
    }
  });

  const showEmptyHint = !query.trim();
  const showNoResults =
    !loading &&
    !!query.trim() &&
    results.length === 0 &&
    searchedRef.current === query.trim();

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box
        borderStyle="round"
        borderColor={inputFocused ? colors.primary : colors.border}
        paddingX={2}
      >
        <Text color={inputFocused ? colors.primary : undefined} bold>{"❯ "}</Text>
        <TextInput
          value={query}
          onChange={(v) => update({ query: v, selectedIndex: -1 })}
          placeholder="Search channels..."
          focus={inputFocused}
        />
      </Box>

      {loading && (
        <Box paddingLeft={2} marginTop={1}>
          <Text color={colors.muted}>{"\u280B"} searching...</Text>
        </Box>
      )}

      {showEmptyHint && (
        <Box paddingLeft={2} marginTop={1}>
          <Text color={colors.muted}>Type to search channels by name or description</Text>
        </Box>
      )}

      {showNoResults && (
        <Box paddingLeft={2} marginTop={1}>
          <Text color={colors.muted}>No channels match '{query.trim()}'</Text>
        </Box>
      )}

      {results.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {results.map((channel, i) => {
            const isActive = !inputFocused && i === selectedIndex;
            return (
              <Box
                key={channel.name}
                flexDirection="column"
                marginBottom={1}
                paddingLeft={1}
              >
                <Box>
                  <Cursor active={isActive} />
                  <Text
                    bold
                    color={isActive ? colors.primary : colors.secondary}
                  >
                    #{channel.name}
                  </Text>
                </Box>
                <Box paddingLeft={3}>
                  <Text color={colors.muted}>
                    {channel.description} {"\u00B7"} {channel.message_count} msgs{" "}
                    {"\u00B7"} {channel.subscriber_count} subs
                  </Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      <HelpFooter
        text={
          inputFocused
            ? "Type to search \u00B7 \u2193 results \u00B7 Esc back"
            : "\u2191\u2193 nav \u00B7 Tab focus search \u00B7 Enter open \u00B7 Esc back"
        }
      />
    </Box>
  );
}
