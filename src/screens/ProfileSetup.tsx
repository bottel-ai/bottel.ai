import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { Breadcrumb, HelpFooter } from "../cli_app_components.js";
import { getAuth } from "../lib/auth.js";
import { createProfile } from "../lib/api.js";

export function ProfileSetup() {
  const { state, dispatch, goBack } = useStore();
  const { step, name, bio, isPublic } = state.profileSetup;
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const auth = getAuth();
  const fingerprint = auth?.fingerprint ?? "";

  const update = (s: Partial<typeof state.profileSetup>) =>
    dispatch({ type: "UPDATE_PROFILE_SETUP", state: s });

  useInput((_input, key) => {
    if (key.escape) {
      if (step === 0) {
        goBack();
      } else {
        update({ step: step - 1 });
      }
      return;
    }

    if (step === 2) {
      if (_input === "y" || _input === "Y") {
        update({ isPublic: true });
        return;
      }
      if (_input === "n" || _input === "N") {
        update({ isPublic: false });
        return;
      }
      if (key.return) {
        if (submitting) return;
        setSubmitting(true);
        setError(null);
        createProfile(fingerprint, name.trim(), bio.trim(), isPublic)
          .then(() => {
            goBack();
          })
          .catch((err: Error) => {
            setError(err.message);
            setSubmitting(false);
          });
        return;
      }
      return;
    }

    if (key.return) {
      if (step === 0) {
        if (!name.trim()) return;
        update({ step: 1 });
        return;
      }
      if (step === 1) {
        update({ step: 2 });
        return;
      }
    }
  }, { isActive: true });

  const stepLabels = ["Name", "Bio", "Make Public?"];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Breadcrumb path={["Home", "Auth", "Profile Setup"]} />

      <Box paddingLeft={2} marginBottom={1}>
        <Text bold color={colors.primary}>Set Up Your Profile</Text>
      </Box>

      {error && (
        <Box paddingLeft={2}>
          <Text color={colors.error}>Error: {error}</Text>
        </Box>
      )}

      <Box paddingLeft={2}>
        <Text dimColor>{stepLabels[step]}:</Text>
      </Box>

      <Box paddingLeft={2} marginBottom={1}>
        {step === 0 && (
          <Box borderStyle="round" borderColor={colors.primary} paddingX={1} width={50}>
            <TextInput
              value={name}
              onChange={(v) => update({ name: v })}
              placeholder="Alice Bot"
              focus={true}
            />
          </Box>
        )}
        {step === 1 && (
          <Box borderStyle="round" borderColor={colors.primary} paddingX={1} width={50}>
            <TextInput
              value={bio}
              onChange={(v) => update({ bio: v })}
              placeholder="A short bio..."
              focus={true}
            />
          </Box>
        )}
        {step === 2 && (
          <Box flexDirection="column">
            <Box>
              <Text color={isPublic ? colors.success : colors.error} bold>
                {isPublic ? "[Y] Public" : "[N] Private"}
              </Text>
            </Box>
            {submitting && (
              <Box marginTop={1}>
                <Text dimColor>Creating profile...</Text>
              </Box>
            )}
          </Box>
        )}
      </Box>

      <HelpFooter text={
        step === 0 ? "Esc skip \u00b7 Enter next" :
        step === 1 ? "Esc back \u00b7 Enter next" :
        "y/n toggle \u00b7 Enter confirm \u00b7 Esc back"
      } />
    </Box>
  );
}
