import { useEffect, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { useStore } from "../state.js";
import type { Channel } from "../state.js";
import { listJoinedChannels, leaveChannel, deleteChannel } from "../lib/api.js";
import { getAuth, isLoggedIn } from "../lib/auth.js";
import { removeChannelKey } from "../lib/keys.js";
import { colors } from "../theme.js";
import { Cursor, HelpFooter } from "../components.js";
import { relativeTime, truncate } from "../lib/formatting.js";

// ─── Screen ─────────────────────────────────────────────────────

const PAGE_SIZE = 7;

export function ChannelList() {
  const { state, dispatch, navigate, goBack } = useStore();
  const { channels, selectedIndex, loading } = state.channelList;
  const [confirmLeave, setConfirmLeave] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const auth = getAuth();
  const selfFp = auth?.fingerprint ?? "";
  const loggedIn = isLoggedIn();
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;
  const innerWidth = Math.max(40, termWidth - 4);

  type Slice = typeof state.channelList;
  const update = (s: Partial<Slice> | ((cur: Slice) => Partial<Slice>)) =>
    dispatch({ type: "UPDATE_CHANNEL_LIST", state: s });

  const fetchChannels = (resetIndex = false, p = page) => {
    if (!loggedIn || !selfFp) {
      update({ channels: [], loading: false });
      return;
    }
    update({ loading: true });
    listJoinedChannels(selfFp, PAGE_SIZE + 1, p * PAGE_SIZE)
      .then((cs) => {
        const more = cs.length > PAGE_SIZE;
        const page_cs = more ? cs.slice(0, PAGE_SIZE) : cs;
        setHasMore(more);
        update((cur) => ({
          channels: page_cs,
          loading: false,
          selectedIndex: resetIndex ? 0 : Math.min(cur.selectedIndex, Math.max(0, page_cs.length - 1)),
        }));
      })
      .catch(() => {
        setHasMore(false);
        update({ channels: [], loading: false, selectedIndex: 0 });
      });
  };

  useEffect(() => {
    if (channels.length > 0 && loggedIn && selfFp) {
      // Stale-while-revalidate
      listJoinedChannels(selfFp, PAGE_SIZE + 1, page * PAGE_SIZE)
        .then((cs) => {
          const more = cs.length > PAGE_SIZE;
          const page_cs = more ? cs.slice(0, PAGE_SIZE) : cs;
          setHasMore(more);
          update((cur) => ({
            channels: page_cs,
            selectedIndex: Math.min(cur.selectedIndex, Math.max(0, page_cs.length - 1)),
          }));
        })
        .catch((err) => { /* eslint-disable-next-line no-console */ console.error("[ChannelList] refresh error:", err); });
    } else {
      fetchChannels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

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
        setTimeout(() => fetchChannels(), 300);
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
    if (input === "c") {
      navigate({ name: "channel-create" });
      return;
    }
    if (input === "r") {
      fetchChannels(false, page);
      return;
    }
    if ((input === "]" || input === ">" || key.rightArrow) && hasMore) {
      const next = page + 1;
      setPage(next);
      update({ selectedIndex: 0 });
      fetchChannels(true, next);
      return;
    }
    if ((input === "[" || input === "<" || key.leftArrow) && page > 0) {
      const prev = page - 1;
      setPage(prev);
      update({ selectedIndex: 0 });
      fetchChannels(true, prev);
      return;
    }
    if (input === "l" && loggedIn) {
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
    if (input === "d" && loggedIn) {
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
        <Box marginBottom={1} justifyContent="space-between">
          <Text bold color={colors.primary}>
            My Channels
          </Text>
          <Text color={colors.subtle}>
            {channels.length > 0
              ? `${page * PAGE_SIZE + 1}-${page * PAGE_SIZE + channels.length}${hasMore ? " of many" : ""}`
              : ""}
            {channels.length > 0 ? "  ·  " : ""}page {page + 1}
          </Text>
        </Box>

        {!loggedIn && (
          <Box flexDirection="column" alignItems="center" paddingY={1}>
            <Text color={colors.warning}>
              Set up your identity first — go to Profile from the home menu.
            </Text>
          </Box>
        )}

        {loggedIn && loading && (
          <Box>
            <Text color={colors.muted}>⠋ loading channels...</Text>
          </Box>
        )}

        {loggedIn && !loading && channels.length === 0 && (
          <Box flexDirection="column" alignItems="center" paddingY={1}>
            <Text color={colors.muted}>No channels joined yet.</Text>
            <Box marginTop={1}>
              <Text color={colors.muted}>
                Use{" "}
                <Text bold color={colors.primary}>
                  Search
                </Text>{" "}
                to find and join channels, or{" "}
                <Text bold color={colors.primary}>
                  c
                </Text>{" "}
                to create one.
              </Text>
            </Box>
          </Box>
        )}

        {loggedIn && !loading && channels.length > 0 && (
          <Box flexDirection="column">
            {channels.map((ch, i) => renderRow(ch, i))}
          </Box>
        )}
      </Box>

      <HelpFooter text="c create · r refresh · l leave · d delete (own) · ←→ page · ↑↓ nav · Enter open · Esc back" />
    </Box>
  );
}
