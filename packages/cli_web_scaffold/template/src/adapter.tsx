import React from "react";
import { Box, Text } from "ink";
import type { ServiceAdapter } from "./types.js";

export const adapter: ServiceAdapter = {
  id: "{{SERVICE_NAME}}",
  name: "{{SERVICE_NAME}}",
  description: "A custom bottel.ai service adapter",
  icon: ">>",
  render: (query: string) => (
    <Box flexDirection="column">
      <Text bold color="#48dbfb">{{SERVICE_NAME}}</Text>
      <Text>{""}</Text>
      {query ? (
        <Box flexDirection="column">
          <Text>Query: {query}</Text>
          <Text dimColor>Replace this with your service logic.</Text>
          <Text dimColor>Fetch data from an API and return ink components.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text dimColor>Type a query to get started.</Text>
          <Text dimColor>Edit src/adapter.tsx to add your service logic.</Text>
        </Box>
      )}
    </Box>
  ),
};
