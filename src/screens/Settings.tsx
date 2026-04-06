import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useStore } from "../cli_app_state.js";
import { colors, boxStyle } from "../cli_app_theme.js";
import { Breadcrumb, Cursor, ScreenHeader, HelpFooter } from "../cli_app_components.js";
import { isLoggedIn } from "../lib/auth.js";

const MENU_ITEMS = [
  { label: "Edit Profile", description: "Change name, bio, visibility" },
  { label: "Auth", description: "Keys, login, logout" },
  { label: "My Apps", description: "Manage your submitted apps" },
  { label: "Installed", description: "View installed apps" },
  { label: "About", description: "About bottel.ai" },
  { label: "Back", description: "Return to home" },
];

export function Settings() {
  const { state, dispatch, goBack, navigate } = useStore();
  const { selectedIndex } = state.settings;
  const [message, setMessage] = useState<string | null>(null);

  useInput((_input, key) => {
    if (key.escape) {
      goBack();
      return;
    }
    if (key.upArrow) {
      dispatch({ type: "UPDATE_SETTINGS", state: { selectedIndex: (selectedIndex - 1 + MENU_ITEMS.length) % MENU_ITEMS.length } });
      setMessage(null);
    }
    if (key.downArrow || key.tab) {
      dispatch({ type: "UPDATE_SETTINGS", state: { selectedIndex: (selectedIndex + 1) % MENU_ITEMS.length } });
      setMessage(null);
    }
    if (key.return) {
      const item = MENU_ITEMS[selectedIndex];
      switch (item?.label) {
        case "Edit Profile":
          if (isLoggedIn()) {
            navigate({ name: "profile-setup" });
          } else {
            setMessage("You must be logged in first. Go to Auth.");
          }
          break;
        case "Auth":
          navigate({ name: "auth" });
          break;
        case "My Apps":
          if (isLoggedIn()) {
            navigate({ name: "my-apps" });
          } else {
            setMessage("You must be logged in first. Go to Auth.");
          }
          break;
        case "Installed":
          navigate({ name: "installed" });
          break;
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

  allRows.push(<Breadcrumb key="breadcrumb" path={["Home", "Settings"]} />);
  allRows.push(<ScreenHeader key="header" title="Settings" />);

  MENU_ITEMS.forEach((item, i) => {
    const isSelected = i === selectedIndex;
    allRows.push(
      <Box key={item.label}>
        <Cursor active={isSelected} />
        <Text bold={isSelected} color={isSelected ? colors.primary : undefined}>
          {item.label.padEnd(18)}
        </Text>
        <Text dimColor>{item.description}</Text>
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
        <Text dimColor>The Bot Native Internet</Text>
        <Text> </Text>
        <Box gap={2}><Text dimColor>Version:</Text><Text>0.1.0</Text></Box>
        <Box gap={2}><Text dimColor>Runtime:</Text><Text>Node.js {process.version}</Text></Box>
        <Box gap={2}><Text dimColor>Platform:</Text><Text>{process.platform} ({process.arch})</Text></Box>
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
