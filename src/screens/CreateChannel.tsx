import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../state.js";
import { colors } from "../theme.js";
import { HelpFooter } from "../components.js";
import { getAuth, isLoggedIn } from "../lib/auth.js";
import { createChannel } from "../lib/api.js";

const NAME_RE = /^[a-z0-9-]{1,50}$/;

export function CreateChannel() {
  const { state, dispatch, navigate, navigateReplace, goBack } = useStore();
  const { step, name, description, error, submitting } = state.channelCreate;

  const update = (s: Partial<typeof state.channelCreate>) =>
    dispatch({ type: "UPDATE_CHANNEL_CREATE", state: s });

  // ─── Auth gate ────────────────────────────────────────────────
  const loggedIn = isLoggedIn();

  useInput(
    (_input, key) => {
      if (!loggedIn) {
        if (key.return) navigate({ name: "auth" });
        if (key.escape) goBack();
        return;
      }

      if (submitting) return;

      if (key.escape) {
        if (step === 0) {
          goBack();
          return;
        }
        if (step === 4) return;
        update({ step: Math.max(0, step - 1) });
        return;
      }

      if (key.return) {
        if (step === 0) {
          if (!NAME_RE.test(name)) return;
          update({ step: 1, error: null });
          return;
        }
        if (step === 1) {
          const d = description.trim();
          if (d.length < 1 || d.length > 280) return;
          update({ step: 2 });
          return;
        }
        if (step === 2) {
          // Submit
          update({ step: 3, submitting: true, error: null });
          const auth = getAuth();
          if (!auth) {
            update({ submitting: false, step: 0, error: "Not logged in" });
            return;
          }
          createChannel(auth.fingerprint, {
            name,
            description: description.trim(),
          })
            .then((channel) => {
              update({ step: 4, submitting: false });
              // Brief success flash, then REPLACE (don't push) so that
              // pressing Esc from the channel view returns to wherever the
              // user came from instead of re-showing the success screen.
              setTimeout(() => {
                navigateReplace({ name: "channel-view", channelName: channel.name });
              }, 600);
            })
            .catch((err: Error) => {
              update({
                step: 0,
                submitting: false,
                error: err.message || "Failed to create channel",
              });
            });
          return;
        }
      }
    },
    { isActive: true }
  );

  // ─── Auth gate render ─────────────────────────────────────────
  if (!loggedIn) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={colors.border}
        paddingX={2}
        paddingY={1}
      >
        <Box marginBottom={1}>
          <Text bold color={colors.primary}>
            Create channel
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text color={colors.warning}>
            {"\u26A0"} You need an identity to create a channel.
          </Text>
        </Box>
        <Text>Press Enter to open Profile.</Text>
        <HelpFooter text="Enter profile · Esc back" />
      </Box>
    );
  }

  // ─── Step renders ─────────────────────────────────────────────
  const nameValid = NAME_RE.test(name);
  const descTrim = description.trim();
  const descValid = descTrim.length >= 1 && descTrim.length <= 280;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.border}
      paddingX={2}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text bold color={colors.primary}>
          Create channel
        </Text>
      </Box>

      {error && step === 0 && (
        <Box marginBottom={1}>
          <Text color={colors.error}>Error: {error}</Text>
        </Box>
      )}

      {step === 0 && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color={colors.muted}>Step 1 of 3 {"\u2014"} Channel name</Text>
          </Box>
          <Box
            borderStyle="round"
            borderColor={nameValid || name === "" ? colors.primary : colors.error}
            paddingX={1}
          >
            <Text color={colors.primary} bold>{"❯ "}</Text>
            <TextInput
              value={name}
              onChange={(v) => update({ name: v })}
              placeholder="weather-data"
              focus={true}
            />
          </Box>
          <Box marginTop={1}>
            {name === "" ? (
              <Text color={colors.muted}>
                Lowercase letters, numbers, dashes. Max 50.
              </Text>
            ) : nameValid ? (
              <Text color={colors.success}>
                {"\u2713"} valid
              </Text>
            ) : (
              <Text color={colors.error}>
                lowercase letters, numbers, dashes only {"\u00B7"} max 50 chars
              </Text>
            )}
          </Box>
          <HelpFooter text="Enter next · Esc cancel" />
        </Box>
      )}

      {step === 1 && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color={colors.muted}>Step 2 of 3 {"\u2014"} Description</Text>
          </Box>
          <Box
            borderStyle="round"
            borderColor={colors.primary}
            paddingX={1}
          >
            <Text color={colors.primary} bold>{"❯ "}</Text>
            <TextInput
              value={description}
              onChange={(v) => update({ description: v })}
              placeholder="Real-time weather observations"
              focus={true}
            />
          </Box>
          <Box marginTop={1}>
            <Text color={colors.muted}>
              1{"\u2013"}280 characters {"\u00B7"} {descTrim.length}/280
            </Text>
          </Box>
          {!descValid && descTrim.length > 280 && (
            <Box>
              <Text color={colors.error}>Too long</Text>
            </Box>
          )}
          <HelpFooter text="Enter next · Esc back" />
        </Box>
      )}

      {step === 2 && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color={colors.muted}>Step 3 of 3 {"\u2014"} Confirm</Text>
          </Box>
          <Box paddingLeft={2}>
            <Text>Name:        </Text>
            <Text bold color={colors.secondary}>
              #{name}
            </Text>
          </Box>
          <Box paddingLeft={2} marginBottom={1}>
            <Text>Description: </Text>
            <Text>{descTrim}</Text>
          </Box>
          <Text>Press Enter to create.</Text>
          <HelpFooter text="Enter create · Esc edit" />
        </Box>
      )}

      {step === 3 && (
        <Box flexDirection="column">
          <Box>
            <Text color={colors.primary}>{"\u280B"} Creating #{name}...</Text>
          </Box>
          <HelpFooter text="Please wait..." />
        </Box>
      )}

      {step === 4 && (
        <Box flexDirection="column">
          <Box>
            <Text color={colors.success}>
              {"\u2713"} #{name} created
            </Text>
          </Box>
          <HelpFooter text="Opening channel..." />
        </Box>
      )}
    </Box>
  );
}
