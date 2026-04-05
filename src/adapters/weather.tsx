import React from "react";
import { Box, Text } from "ink";
import type { ServiceAdapter } from "./types.js";

export const weather: ServiceAdapter = {
  id: "weather",
  name: "Weather",
  description: "Current weather conditions",
  icon: "~~",
  render: () => (
    <Box flexDirection="column">
      <Text bold color="#74b9ff">Weather — Sydney, Australia</Text>
      <Text>{""}</Text>
      <Box flexDirection="column" borderStyle="round" borderColor="#74b9ff" paddingX={2} paddingY={1}>
        <Box>
          <Text>   .--.      </Text>
          <Text bold color="#feca57">  23°C</Text>
        </Box>
        <Box>
          <Text>  .-(    ).   </Text>
          <Text dimColor>Partly Cloudy</Text>
        </Box>
        <Box>
          <Text> (___.__)__)  </Text>
        </Box>
        <Text>{""}</Text>
        <Box gap={3}>
          <Box flexDirection="column">
            <Text dimColor>Humidity</Text>
            <Text bold>65%</Text>
          </Box>
          <Box flexDirection="column">
            <Text dimColor>Wind</Text>
            <Text bold>12 km/h</Text>
          </Box>
          <Box flexDirection="column">
            <Text dimColor>Feels Like</Text>
            <Text bold>21°C</Text>
          </Box>
          <Box flexDirection="column">
            <Text dimColor>UV Index</Text>
            <Text bold>6</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  ),
};
