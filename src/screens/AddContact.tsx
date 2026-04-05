import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { Breadcrumb, HelpFooter } from "../cli_app_components.js";
import { isLoggedIn, getAuth } from "../lib/auth.js";
import { addContact } from "../lib/api.js";
import { useState } from "react";

export function AddContact() {
  const { state, dispatch, goBack } = useStore();
  const { step, fingerprint: contactFp, alias } = state.addContact;
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loggedIn = isLoggedIn();
  const auth = getAuth();
  const myFingerprint = auth?.fingerprint ?? "";

  const update = (s: Partial<typeof state.addContact>) =>
    dispatch({ type: "UPDATE_ADD_CONTACT", state: s });

  useInput((_input, key) => {
    if (!loggedIn) {
      if (key.escape) goBack();
      return;
    }

    if (key.escape) {
      if (step === 0) {
        goBack();
      } else {
        update({ step: 0 });
      }
      return;
    }

    if (key.return) {
      if (step === 0) {
        if (!contactFp.trim()) return;
        update({ step: 1 });
        return;
      }
      if (step === 1) {
        if (!alias.trim() || submitting) return;
        setSubmitting(true);
        setError(null);
        addContact(myFingerprint, contactFp.trim(), alias.trim())
          .then(() => {
            goBack();
          })
          .catch((err: Error) => {
            setError(err.message);
            setSubmitting(false);
          });
        return;
      }
    }
  }, { isActive: true });

  if (!loggedIn) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Breadcrumb path={["Home", "Chat", "Add Contact"]} />
        <Box paddingLeft={2}>
          <Text color={colors.error}>
            You must be logged in to add contacts. Go to Auth to generate or import a key.
          </Text>
        </Box>
        <HelpFooter text="Esc back" />
      </Box>
    );
  }

  const stepLabel = step === 0 ? "Fingerprint" : "Alias";

  return (
    <Box flexDirection="column" paddingX={1}>
      <Breadcrumb path={["Home", "Chat", "Add Contact"]} />

      <Box paddingLeft={2} marginBottom={1}>
        <Text bold color={colors.primary}>Add Contact</Text>
      </Box>

      {error && (
        <Box paddingLeft={2}>
          <Text color={colors.error}>Error: {error}</Text>
        </Box>
      )}

      <Box paddingLeft={2}>
        <Text dimColor>{stepLabel}:</Text>
      </Box>

      <Box paddingLeft={2} marginBottom={1}>
        <Box borderStyle="round" borderColor={colors.primary} paddingX={1} width={50}>
          {step === 0 ? (
            <TextInput
              value={contactFp}
              onChange={(v) => update({ fingerprint: v })}
              placeholder="bot-abc123..."
              focus={true}
            />
          ) : (
            <TextInput
              value={alias}
              onChange={(v) => update({ alias: v })}
              placeholder="Friendly name"
              focus={true}
            />
          )}
        </Box>
      </Box>

      {submitting && (
        <Box paddingLeft={2}>
          <Text dimColor>Adding contact...</Text>
        </Box>
      )}

      <HelpFooter text={step === 0 ? "Esc cancel \u00b7 Enter next" : "Esc back \u00b7 Enter add"} />
    </Box>
  );
}
