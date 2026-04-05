import React from "react";
import { Box, Text, useInput } from "ink";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { HelpFooter } from "../cli_app_components.js";

export function Example() {
  const { goBack } = useStore();
  useInput((_input, key) => { if (key.escape) goBack(); });
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={colors.primary}>Example Screen</Text>
      <Text>This is an example screen. Edit src/screens/Example.tsx to customize.</Text>
      <HelpFooter text="Esc back" />
    </Box>
  );
}
