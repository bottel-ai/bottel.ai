import React, { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import Logo from "./components/Logo.js";
import StatusBar from "./components/StatusBar.js";
import { Home } from "./screens/Home.js";
import { Browse } from "./screens/Browse.js";
import { Search } from "./screens/Search.js";
import { AgentDetail } from "./screens/AgentDetail.js";
import { Installed } from "./screens/Installed.js";
import { Settings } from "./screens/Settings.js";

type Screen =
  | { name: "home" }
  | { name: "browse" }
  | { name: "search" }
  | { name: "agent-detail"; agentId: string }
  | { name: "installed" }
  | { name: "settings" };

const MENU_ITEMS = [
  { label: "Home", description: "Store front" },
  { label: "Browse", description: "Browse by category" },
  { label: "Search", description: "Find apps" },
  { label: "Installed", description: "Your apps" },
  { label: "Settings", description: "Preferences" },
  { label: "Exit", description: "Quit bottel" },
];

function HomeMenu({
  onNavigate,
}: {
  onNavigate: (screen: Screen) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { exit } = useApp();

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(MENU_ITEMS.length - 1, prev + 1));
    }
    if (key.return) {
      const item = MENU_ITEMS[selectedIndex];
      switch (item.label) {
        case "Home":
          break;
        case "Browse":
          onNavigate({ name: "browse" });
          break;
        case "Search":
          onNavigate({ name: "search" });
          break;
        case "Installed":
          onNavigate({ name: "installed" });
          break;
        case "Settings":
          onNavigate({ name: "settings" });
          break;
        case "Exit":
          exit();
          break;
      }
    }
  });

  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      {MENU_ITEMS.map((item, i) => {
        const isSelected = i === selectedIndex;
        return (
          <Box key={item.label}>
            <Text>{isSelected ? "> " : "  "}</Text>
            <Text
              bold={isSelected}
              color={isSelected ? "#48dbfb" : undefined}
            >
              {item.label.padEnd(18)}
            </Text>
            <Text dimColor>{item.description}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: "home" });

  const navigate = (s: Screen) => {
    setScreen(s);
  };

  const goHome = () => {
    setScreen({ name: "home" });
  };

  const isHome = screen.name === "home";

  return (
    <Box flexDirection="column">
      {isHome && <Logo />}
      <StatusBar />

      {isHome && <HomeMenu onNavigate={navigate} />}

      {isHome && (
        <Home
          onViewAgent={(id) => navigate({ name: "agent-detail", agentId: id })}
          onViewCategory={() => navigate({ name: "browse" })}
          onSearch={() => navigate({ name: "search" })}
        />
      )}

      {screen.name === "browse" && (
        <Browse
          onBack={goHome}
          onViewAgent={(id) => navigate({ name: "agent-detail", agentId: id })}
        />
      )}

      {screen.name === "search" && (
        <Search
          onBack={goHome}
          onViewAgent={(id) => navigate({ name: "agent-detail", agentId: id })}
        />
      )}

      {screen.name === "agent-detail" && (
        <AgentDetail agentId={screen.agentId} onBack={goHome} />
      )}

      {screen.name === "installed" && (
        <Installed
          onBack={goHome}
          onViewAgent={(id) => navigate({ name: "agent-detail", agentId: id })}
        />
      )}

      {screen.name === "settings" && <Settings onBack={goHome} />}
    </Box>
  );
}

export default App;
