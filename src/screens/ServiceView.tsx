import React from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../cli_app_state.js";
import { adapterMap } from "../adapters/index.js";
import { colors } from "../cli_app_theme.js";
import { Breadcrumb, HelpFooter } from "../cli_app_components.js";

const QUERY_SERVICES = new Set(["google", "wikipedia", "calculator"]);

export function ServiceView({ serviceId }: { serviceId: string }) {
  const { state, dispatch, goBack } = useStore();
  const { query, inputFocused } = state.serviceView;

  const adapter = adapterMap.get(serviceId);
  const needsQuery = QUERY_SERVICES.has(serviceId);

  useInput((_input, key) => {
    if (key.escape) {
      goBack();
      return;
    }
  }, { isActive: !inputFocused });

  // Handle escape when input is focused
  useInput((_input, key) => {
    if (key.escape) {
      if (query.length > 0) {
        // Unfocus input so user can press Esc again to go back
        dispatch({ type: "UPDATE_SERVICE_VIEW", state: { inputFocused: false } });
      } else {
        goBack();
      }
      return;
    }
  }, { isActive: inputFocused });

  if (!adapter) {
    return (
      <Box paddingX={1} flexDirection="column">
        <Text color="red">Service not found: {serviceId}</Text>
        <Text dimColor>Esc to go back</Text>
      </Box>
    );
  }

  const breadcrumbPath = ["Home", "Portal", adapter.name];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Breadcrumb path={breadcrumbPath} />

      {needsQuery && (
        <Box marginBottom={1}>
          <Text bold color={colors.secondary}>Query: </Text>
          <TextInput
            value={query}
            onChange={(value) => dispatch({ type: "UPDATE_SERVICE_VIEW", state: { query: value } })}
            onSubmit={() => dispatch({ type: "UPDATE_SERVICE_VIEW", state: { inputFocused: false } })}
            focus={inputFocused}
            placeholder="Type your query and press Enter..."
          />
        </Box>
      )}

      {(!needsQuery || query.length > 0) && (
        <Box flexDirection="column">
          {adapter.render(query)}
        </Box>
      )}

      {needsQuery && query.length === 0 && (
        <Box marginTop={1}>
          <Text dimColor>Enter a query above to see results.</Text>
        </Box>
      )}

      <HelpFooter text="Esc back" />
    </Box>
  );
}
