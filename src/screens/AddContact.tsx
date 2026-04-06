import { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { Breadcrumb, Autocomplete, HelpFooter, type AutocompleteItem } from "../cli_app_components.js";
import { isLoggedIn, getAuth } from "../lib/auth.js";
import { addContact, searchProfiles, type Profile } from "../lib/api.js";

export function AddContact() {
  const { state, dispatch, goBack } = useStore();
  const { fingerprint: contactFp } = state.addContact;
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [suggestions, setSuggestions] = useState<AutocompleteItem[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const loggedIn = isLoggedIn();
  const auth = getAuth();
  const myFingerprint = auth?.fingerprint ?? "";

  // Search profiles as user types
  useEffect(() => {
    if (!contactFp.trim()) {
      setSuggestions([]);
      setProfiles([]);
      return;
    }
    const timeout = setTimeout(() => {
      searchProfiles(contactFp.trim())
        .then((results) => {
          setProfiles(results);
          setSuggestions(
            results.map((p) => ({
              id: p.fingerprint,
              label: `${p.name} (${p.fingerprint.slice(0, 8)}...)`,
              detail: p.online ? "online" : undefined,
            })),
          );
        })
        .catch(() => {
          setSuggestions([]);
          setProfiles([]);
        });
    }, 300);
    return () => clearTimeout(timeout);
  }, [contactFp]);

  const handleSelect = (item: AutocompleteItem) => {
    if (submitting) return;
    const profile = profiles.find((p) => p.fingerprint === item.id);
    if (!profile) return;
    setSubmitting(true);
    setError(null);
    addContact(myFingerprint, profile.fingerprint, profile.name)
      .then(() => {
        goBack();
      })
      .catch((err: Error) => {
        setError(err.message);
        setSubmitting(false);
      });
  };

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
        <Autocomplete
          value={contactFp}
          onChange={(v) => dispatch({ type: "UPDATE_ADD_CONTACT", state: { fingerprint: v } })}
          onSubmit={() => {}}
          onSelect={handleSelect}
          onExit={() => goBack()}
          suggestions={suggestions}
          placeholder="Search people..."
          width={50}
          focused={true}
        />
      </Box>

      {submitting && (
        <Box paddingLeft={2}>
          <Text dimColor>Adding contact...</Text>
        </Box>
      )}

      <HelpFooter text="Esc back · ↑↓ nav · Enter add" />
    </Box>
  );
}
