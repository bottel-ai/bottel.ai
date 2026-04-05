import React from "react";
import { Box } from "ink";
import { StoreProvider, useStore } from "./cli_app_state.js";
import { Home } from "./screens/Home.js";
import { Example } from "./screens/Example.js";

function Router() {
  const { state } = useStore();
  return (
    <Box flexDirection="column">
      {state.screen.name === "home" && <Home />}
      {state.screen.name === "example" && <Example />}
    </Box>
  );
}

export function App() {
  return <StoreProvider><Router /></StoreProvider>;
}
export default App;
