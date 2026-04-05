import React from "react";
import { Box, Text } from "ink";
import type { ServiceAdapter } from "./types.js";

export const wikipedia: ServiceAdapter = {
  id: "wikipedia",
  name: "Wikipedia",
  description: "Search Wikipedia articles",
  icon: "Wp",
  render: () => (
    <Box flexDirection="column">
      <Text bold color="#ffffff">Wikipedia — Artificial Intelligence</Text>
      <Text dimColor>From Wikipedia, the free encyclopedia</Text>
      <Text>{""}</Text>
      <Box flexDirection="column" paddingX={1}>
        <Text wrap="wrap">
          Artificial intelligence (AI) is the intelligence of machines or software, as opposed to the
          intelligence of living beings, primarily of humans. It is a field of study in computer science
          that develops and studies intelligent machines. Such machines may be called AIs. AI technology
          is widely used throughout industry, government, and science. Some high-profile applications are
          advanced web search engines, recommendation systems, human speech interaction, self-driving cars,
          generative and creative tools, and superhuman play and analysis in strategy games.
        </Text>
      </Box>
      <Text>{""}</Text>
      <Text bold>Contents</Text>
      <Text>  1. History</Text>
      <Text>  2. Goals</Text>
      <Text>  3. Tools and Techniques</Text>
      <Text>  4. Machine Learning</Text>
      <Text>  5. Natural Language Processing</Text>
      <Text>  6. Applications</Text>
      <Text>  7. Ethics and Risks</Text>
      <Text>{""}</Text>
      <Box>
        <Text dimColor>Categories: </Text>
        <Text color="#74b9ff">Computer Science</Text>
        <Text dimColor> | </Text>
        <Text color="#74b9ff">Machine Learning</Text>
        <Text dimColor> | </Text>
        <Text color="#74b9ff">Computational Neuroscience</Text>
      </Box>
    </Box>
  ),
};
