import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useStore } from "../cli_app_state.js";
import { colors, boxStyle } from "../cli_app_theme.js";
import { Breadcrumb, Cursor, ScreenHeader, HelpFooter } from "../cli_app_components.js";


const MENU_ITEMS = [
  { label: "About", description: "About bottel.ai" },
  { label: "Clear cache", description: "Clear cached data" },
  { label: "Back", description: "Return to home" },
];

export function Settings() {
  const { state, dispatch, goBack } = useStore();
  const { selectedIndex } = state.settings;
  const [message, setMessage] = useState<string | null>(null);

  useInput((_input, key) => {
    if (key.escape) {
      goBack();
      return;
    }
    if (key.upArrow) {
      dispatch({ type: "UPDATE_SETTINGS", state: { selectedIndex: Math.max(0, selectedIndex - 1) } });
      setMessage(null);
    }
    if (key.downArrow) {
      dispatch({ type: "UPDATE_SETTINGS", state: { selectedIndex: Math.min(MENU_ITEMS.length - 1, selectedIndex + 1) } });
      setMessage(null);
    }
    if (key.return) {
      const item = MENU_ITEMS[selectedIndex];
      switch (item?.label) {
        case "About":
          setMessage("about");
          break;
        case "Clear cache":
          setMessage("Cache cleared successfully.");
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

  allRows.push(<HelpFooter key="footer" text="Esc back \u00b7 \u2191\u2193 nav \u00b7 Enter select" />);

  if (message === "about") {
    allRows.push(
      <Box key="about-header" marginTop={1} {...boxStyle.section} paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color={colors.primary}>bottel.ai</Text>
        <Text dimColor>The Bot CLI Internet Portal</Text>
        <Text> </Text>
        <Box gap={2}><Text dimColor>Version:</Text><Text>0.1.0</Text></Box>
        <Box gap={2}><Text dimColor>Runtime:</Text><Text>Node.js {process.version}</Text></Box>
        <Box gap={2}><Text dimColor>Platform:</Text><Text>{process.platform} ({process.arch})</Text></Box>
        <Text> </Text>
        <Text color={colors.secondary}>The Bot CLI Internet Portal — for CLI App Discovery</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {allRows}
    </Box>
  );
}
