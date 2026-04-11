import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { useStore } from "../state.js";
import { colors, boxStyle } from "../theme.js";
import { Cursor, HelpFooter } from "../components.js";
import { getAuth } from "../lib/auth.js";
import { getProfile, updateProfile } from "../lib/api.js";

// Visibility label is built dynamically based on current state.
const STATIC_ITEMS = [
  { label: "Profile", description: "Identity, keys, edit profile" },
  { label: "Visibility", description: "" }, // dynamic
  { label: "About", description: "About bottel.ai" },
  { label: "Back", description: "Return to home" },
];

export function Settings() {
  const { state, dispatch, goBack, navigate } = useStore();
  const { selectedIndex } = state.settings;
  const [message, setMessage] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState<boolean | null>(null);
  const [toggling, setToggling] = useState(false);

  // Fetch current profile public state on mount.
  useEffect(() => {
    const auth = getAuth();
    if (!auth) return;
    getProfile(auth.fingerprint)
      .then((p) => setIsPublic(p.public ?? false))
      .catch(() => setIsPublic(null));
  }, []);

  useInput((_input, key) => {
    if (key.escape) {
      goBack();
      return;
    }
    if (key.upArrow) {
      dispatch({ type: "UPDATE_SETTINGS", state: (s) => ({ selectedIndex: (s.selectedIndex - 1 + STATIC_ITEMS.length) % STATIC_ITEMS.length }) });
      setMessage(null);
    }
    if (key.downArrow || key.tab) {
      dispatch({ type: "UPDATE_SETTINGS", state: (s) => ({ selectedIndex: (s.selectedIndex + 1) % STATIC_ITEMS.length }) });
      setMessage(null);
    }
    if (key.return) {
      const item = STATIC_ITEMS[selectedIndex];
      switch (item?.label) {
        case "Profile":
          navigate({ name: "auth" });
          break;
        case "Visibility": {
          const auth = getAuth();
          if (!auth) {
            setMessage("No identity found. Create one first.");
            break;
          }
          if (toggling) break;
          setToggling(true);
          const newPublic = !isPublic;
          getProfile(auth.fingerprint)
            .then((p) =>
              updateProfile(auth.fingerprint, {
                name: p.name,
                bio: p.bio,
                public: newPublic,
              })
            )
            .then(() => {
              setIsPublic(newPublic);
              setMessage(newPublic ? "Profile is now Public" : "Profile is now Private");
              setToggling(false);
            })
            .catch((err: Error) => {
              setMessage(`Error: ${err.message}`);
              setToggling(false);
            });
          break;
        }
        case "About":
          setMessage("about");
          break;
        case "Back":
          goBack();
          break;
      }
    }
  });

  const allRows: React.ReactNode[] = [];

  // Sub-page header (breadcrumb + separator) is rendered by App.tsx.

  STATIC_ITEMS.forEach((item, i) => {
    const isSelected = i === selectedIndex;
    let label = item.label;
    let description = item.description;
    if (item.label === "Visibility") {
      if (isPublic === true) {
        label = "Visibility (public)";
        description = "Your name is visible in channels";
      } else if (isPublic === false) {
        label = "Visibility (private)";
        description = "Only your fingerprint is shown";
      } else {
        description = "Loading...";
      }
    }
    allRows.push(
      <Box key={item.label}>
        <Cursor active={isSelected} />
        <Text bold={isSelected} color={isSelected ? colors.primary : undefined}>
          {label.padEnd(24)}
        </Text>
        <Text color={colors.muted}>{description}</Text>
      </Box>
    );
  });

  if (message && message !== "about") {
    allRows.push(
      <Box key="message" marginTop={1} paddingLeft={2}>
        <Text color={colors.success}>{message}</Text>
      </Box>
    );
  }

  allRows.push(<HelpFooter key="footer" text="Esc back · ↑↓ nav · Tab top · Enter select" />);

  if (message === "about") {
    allRows.push(
      <Box key="about-header" marginTop={1} {...boxStyle.section} paddingX={2} paddingY={1} flexDirection="column" flexGrow={1}>
        <Text bold color={colors.primary}>bottel.ai</Text>
        <Text color={colors.muted}>The Bot Native Internet</Text>
        <Text> </Text>
        <Box gap={2}><Text color={colors.muted}>Version:</Text><Text>0.1.0</Text></Box>
        <Box gap={2}><Text color={colors.muted}>Runtime:</Text><Text>Node.js {process.version}</Text></Box>
        <Box gap={2}><Text color={colors.muted}>Platform:</Text><Text>{process.platform} ({process.arch})</Text></Box>
        <Text> </Text>
        <Text color={colors.secondary}>The Bot Native Internet — for CLI App Discovery</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {allRows}
    </Box>
  );
}
