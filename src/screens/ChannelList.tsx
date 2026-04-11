import { useEffect, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { useStore } from "../state.js";
import type { Channel } from "../state.js";
import { listChannels, leaveChannel, deleteChannel } from "../lib/api.js";
import { getAuth, isLoggedIn } from "../lib/auth.js";
import { removeChannelKey } from "../lib/keys.js";
import { colors } from "../theme.js";
import { Cursor, HelpFooter } from "../components.js";
import { relativeTime, truncate } from "../lib/formatting.js";

// ─── Screen ─────────────────────────────────────────────────────

export function ChannelList() {
  const { state, dispatch, navigate, goBack } = useStore();
  const { channels, selectedIndex, loading, sort } = state.channelList;
  const [confirmLeave, setConfirmLeave] = useState<string | null>(null); // channel name or null
  const [flash, setFlash] = useState<string | null>(null);
  const auth = getAuth();
  const selfFp = auth?.fingerprint ?? "";
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;
  // Use the full terminal width (minus a small gutter for the outer paddingX).
  const innerWidth = Math.max(40, termWidth - 4);

  type Slice = typeof state.channelList;
  const update = (s: Partial<Slice> | ((cur: Slice) => Partial<Slice>)) =>
    dispatch({ type: "UPDATE_CHANNEL_LIST", state: s });

  const fetchChannels = (s: "messages" | "recent", resetIndex = false) => {
    update({ loading: true });
    listChannels({ sort: s })
      .then((cs) =>
        update((cur) => ({
          channels: cs,
          loading: false,
          selectedIndex: resetIndex ? 0 : Math.min(cur.selectedIndex, Math.max(0, cs.length - 1)),
        }))
      )
      .catch(() => update({ channels: [], loading: false, selectedIndex: 0 }));
  };

  useEffect(() => {
    if (channels.length > 0) {
      // Data already in the store from a previous visit — show it
      // immediately and silently refresh in the background
      // (stale-while-revalidate). No loading spinner, no D1 read
      // until the background fetch completes.
      listChannels({ sort })
        .then((cs) =>
          update((cur) => ({
            channels: cs,
            selectedIndex: Math.min(cur.selectedIndex, Math.max(0, cs.length - 1)),
          }))
        )
        .catch(() => {});
    } else {
      fetchChannels(sort);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useInput((input, key) => {
    // Leave/delete confirm intercept.
    if (confirmLeave) {
      if (input === "y" || input === "Y") {
        if (selfFp) {
          const isDelete = confirmLeave.startsWith("delete:");
          const chName = isDelete ? confirmLeave.slice(7) : confirmLeave;
          if (isDelete) {
            deleteChannel(selfFp, chName).catch(() => {});
          } else {
            leaveChannel(selfFp, chName).catch(() => {});
          }
          removeChannelKey(chName);
        }
        setConfirmLeave(null);
        // Delay refresh slightly so the backend has time to process.
        setTimeout(() => fetchChannels(sort), 300);
        return;
      }
      if (input === "n" || input === "N" || key.escape) {
        setConfirmLeave(null);
        return;
      }
      return;
    }

    if (key.escape) {
      goBack();
      return;
    }
    if (key.upArrow) {
      update((cur) =>
        cur.channels.length > 0
          ? { selectedIndex: (cur.selectedIndex - 1 + cur.channels.length) % cur.channels.length }
          : {}
      );
      return;
    }
    if (key.downArrow) {
      update((cur) =>
        cur.channels.length > 0
          ? { selectedIndex: (cur.selectedIndex + 1) % cur.channels.length }
          : {}
      );
      return;
    }
    if (key.return) {
      const ch = channels[selectedIndex];
      if (ch) navigate({ name: "channel-view", channelName: ch.name });
      return;
    }
    if (input === "s") {
      const next: "messages" | "recent" =
        sort === "messages" ? "recent" : "messages";
      update({ sort: next });
      fetchChannels(next, true);
      return;
    }
    if (input === "c") {
      navigate({ name: "channel-create" });
      return;
    }
    if (input === "r") {
      fetchChannels(sort);
      return;
    }
    if (input === "l" && isLoggedIn()) {
      const ch = channels[selectedIndex];
      if (ch) {
        if (ch.created_by === selfFp) {
          setFlash("Can't leave your own channel — use d to delete it.");
          setTimeout(() => setFlash(null), 3000);
        } else {
          setConfirmLeave(ch.name);
        }
      }
      return;
    }
    if (input === "d" && isLoggedIn()) {
      const ch = channels[selectedIndex];
      if (ch) {
        if (ch.created_by !== selfFp) {
          setFlash("Can't delete someone else's channel — use l to leave it.");
          setTimeout(() => setFlash(null), 3000);
        } else {
          setConfirmLeave(`delete:${ch.name}`);
        }
      }
      return;
    }
  });

  // ─── Header strip rendered inside round border ───────────────

  const renderRow = (ch: Channel, i: number) => {
    const active = i === selectedIndex;
    const rel = relativeTime(ch.created_at);
    const statsLeft = `${ch.message_count} msgs · ${ch.subscriber_count} subs`;
    const isOwner = ch.created_by === selfFp;
    const showLeave = confirmLeave === ch.name;
    const showDelete = confirmLeave === `delete:${ch.name}`;
    return (
      <Box key={ch.name} flexDirection="column" marginBottom={1}>
        <Box>
          <Cursor active={active} />
          <Text bold color={active ? colors.primary : undefined}>
            b/{ch.name}
          </Text>
          {isOwner && active && (
            <Text color={colors.subtle}>  (yours)</Text>
          )}
        </Box>
        <Box paddingLeft={3}>
          <Text color={colors.muted}>
            {truncate(ch.description || "", innerWidth - 6)}
          </Text>
        </Box>
        <Box paddingLeft={3}>
          <Text color={colors.subtle}>
            {statsLeft}
            {rel ? `   · ${rel}` : ""}
          </Text>
        </Box>
        {showLeave && (
          <Box paddingLeft={3}>
            <Text color={colors.warning}>
              Leave b/{ch.name}?{!ch.is_public ? "  Key will be deleted." : ""}  </Text>
            <Text bold color={colors.error}>y</Text>
            <Text color={colors.muted}> yes  </Text>
            <Text bold color={colors.success}>n</Text>
            <Text color={colors.muted}> no</Text>
          </Box>
        )}
        {showDelete && (
          <Box paddingLeft={3}>
            <Text color={colors.error}>
              Delete b/{ch.name}?  All messages will be permanently removed.  </Text>
            <Text bold color={colors.error}>y</Text>
            <Text color={colors.muted}> yes  </Text>
            <Text bold color={colors.success}>n</Text>
            <Text color={colors.muted}> no</Text>
          </Box>
        )}
        {active && flash && (
          <Box paddingLeft={3}>
            <Text color={colors.warning}>{flash}</Text>
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={colors.border}
        paddingX={2}
        paddingY={1}
        width={innerWidth}
      >
        {/* Title row inside border */}
        <Box marginBottom={1} justifyContent="space-between">
          <Text bold color={colors.primary}>
            Channels
          </Text>
          <Text color={colors.subtle}>sort: {sort}</Text>
        </Box>

        {loading && (
          <Box>
            <Text color={colors.muted}>⠋ loading channels...</Text>
          </Box>
        )}

        {!loading && channels.length === 0 && (
          <Box flexDirection="column" alignItems="center" paddingY={1}>
            <Text color={colors.muted}>No channels yet.</Text>
            <Box marginTop={1}>
              <Text color={colors.muted}>
                Press{" "}
                <Text bold color={colors.primary}>
                  c
                </Text>{" "}
                to create the first one.
              </Text>
            </Box>
          </Box>
        )}

        {!loading && channels.length > 0 && (
          <Box flexDirection="column">
            {channels.map((ch, i) => renderRow(ch, i))}
          </Box>
        )}
      </Box>

      <HelpFooter text="s sort · c create · r refresh · l leave · d delete (own) · ↑↓ nav · Enter open · Esc back" />
    </Box>
  );
}
