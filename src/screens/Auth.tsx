import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { Breadcrumb, Cursor, ScreenHeader, HelpFooter } from "../cli_app_components.js";
import {
  isLoggedIn,
  getAuth,
  generateKeyPair,
  importPrivateKey,
  saveAuth,
  clearAuth,
} from "../lib/auth.js";

type Mode = "menu" | "import" | "show-key";

const LOGGED_OUT_ITEMS = [
  { label: "Generate Key Pair", description: "Create new Ed25519 key pair" },
  { label: "Import Key", description: "Import existing private key" },
  { label: "Back", description: "" },
];

const LOGGED_IN_ITEMS = [
  { label: "Show Full Key", description: "Display complete public key" },
  { label: "Regenerate Key", description: "Generate new key pair" },
  { label: "Logout", description: "Remove keys" },
  { label: "Back", description: "" },
];

export function Auth() {
  const { state, dispatch, goBack } = useStore();
  const { selectedIndex } = state.authScreen;
  const [mode, setMode] = useState<Mode>("menu");
  const [importValue, setImportValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageColor, setMessageColor] = useState<string>(colors.success);
  const [, setTick] = useState(0);

  const refresh = () => setTick((t) => t + 1);
  const loggedIn = isLoggedIn();
  const auth = getAuth();
  const menuItems = loggedIn ? LOGGED_IN_ITEMS : LOGGED_OUT_ITEMS;

  const showMessage = (msg: string, color: string = colors.success) => {
    setMessage(msg);
    setMessageColor(color);
  };

  useInput((input, key) => {
    if (mode === "import") {
      if (key.escape) {
        setMode("menu");
        setImportValue("");
        return;
      }
      if (key.return) {
        try {
          const authData = importPrivateKey(importValue.trim());
          saveAuth(authData);
          showMessage(`Key imported successfully. Fingerprint: ${authData.fingerprint}`);
          setMode("menu");
          setImportValue("");
          dispatch({ type: "UPDATE_AUTH_SCREEN", state: { selectedIndex: 0 } });
          refresh();
        } catch {
          showMessage("Invalid private key format.", colors.error);
          setMode("menu");
          setImportValue("");
        }
        return;
      }
      return;
    }

    if (mode === "show-key") {
      if (key.escape || key.return) {
        setMode("menu");
      }
      return;
    }

    if (key.escape) {
      goBack();
      return;
    }
    if (key.upArrow) {
      dispatch({
        type: "UPDATE_AUTH_SCREEN",
        state: { selectedIndex: Math.max(0, selectedIndex - 1) },
      });
      setMessage(null);
    }
    if (key.downArrow) {
      dispatch({
        type: "UPDATE_AUTH_SCREEN",
        state: { selectedIndex: Math.min(menuItems.length - 1, selectedIndex + 1) },
      });
      setMessage(null);
    }
    if (key.return) {
      const item = menuItems[selectedIndex];
      if (!item) return;

      if (!loggedIn) {
        switch (item.label) {
          case "Generate Key Pair": {
            const authData = generateKeyPair();
            saveAuth(authData);
            showMessage(`Key pair generated!\nPublic Key: ${authData.publicKey}`);
            dispatch({ type: "UPDATE_AUTH_SCREEN", state: { selectedIndex: 0 } });
            refresh();
            break;
          }
          case "Import Key":
            setMode("import");
            setImportValue("");
            setMessage(null);
            break;
          case "Back":
            goBack();
            break;
        }
      } else {
        switch (item.label) {
          case "Show Full Key":
            setMode("show-key");
            setMessage(null);
            break;
          case "Regenerate Key": {
            const authData = generateKeyPair();
            saveAuth(authData);
            showMessage(`Key regenerated!\nPublic Key: ${authData.publicKey}`);
            refresh();
            break;
          }
          case "Logout":
            clearAuth();
            showMessage("Logged out successfully.");
            dispatch({ type: "UPDATE_AUTH_SCREEN", state: { selectedIndex: 0 } });
            refresh();
            break;
          case "Back":
            goBack();
            break;
        }
      }
    }
  });

  const allRows: React.ReactNode[] = [];

  allRows.push(<Breadcrumb key="breadcrumb" path={["Home", "Auth"]} />);
  allRows.push(<ScreenHeader key="header" title="Auth" />);

  if (loggedIn && auth) {
    const shortFingerprint = `bottel_${auth.fingerprint.replace("SHA256:", "").substring(0, 8)}...`;
    allRows.push(
      <Box key="status" marginBottom={1} paddingLeft={2}>
        <Text color={colors.success}>Logged in as {shortFingerprint}</Text>
      </Box>,
    );
    allRows.push(
      <Box key="pubkey-label" paddingLeft={2}>
        <Text dimColor>Public Key:</Text>
      </Box>,
    );
    allRows.push(
      <Box key="pubkey-value" paddingLeft={2} marginBottom={1}>
        <Text>{auth.publicKey.substring(0, 40)}...</Text>
      </Box>,
    );
  } else {
    allRows.push(
      <Box key="status" marginBottom={1} paddingLeft={2}>
        <Text dimColor>Not logged in</Text>
      </Box>,
    );
  }

  if (mode === "import") {
    allRows.push(
      <Box key="import-label" paddingLeft={2} marginBottom={0}>
        <Text>Paste your base64-encoded private key:</Text>
      </Box>,
    );
    allRows.push(
      <Box key="import-input" paddingLeft={2} marginBottom={1}>
        <Text color={colors.primary}>{"\u276f "}</Text>
        <TextInput
          value={importValue}
          onChange={setImportValue}
          placeholder="Base64 private key..."
          focus={true}
        />
      </Box>,
    );
    allRows.push(<HelpFooter key="footer" text="Esc cancel \u00b7 Enter import" />);
  } else if (mode === "show-key" && auth) {
    allRows.push(
      <Box key="fullkey-label" paddingLeft={2}>
        <Text bold color={colors.primary}>Full Public Key:</Text>
      </Box>,
    );
    allRows.push(
      <Box key="fullkey-value" paddingLeft={2} marginBottom={1}>
        <Text wrap="wrap">{auth.publicKey}</Text>
      </Box>,
    );
    allRows.push(<HelpFooter key="footer" text="Esc/Enter back to menu" />);
  } else {
    menuItems.forEach((item, i) => {
      const isSelected = i === selectedIndex;
      allRows.push(
        <Box key={item.label}>
          <Cursor active={isSelected} />
          <Text bold={isSelected} color={isSelected ? colors.primary : undefined}>
            {item.label.padEnd(20)}
          </Text>
          <Text dimColor>{item.description}</Text>
        </Box>,
      );
    });

    if (message) {
      message.split("\n").forEach((line, i) => {
        allRows.push(
          <Box key={`message-${i}`} marginTop={i === 0 ? 1 : 0} paddingLeft={2}>
            <Text color={messageColor}>{line}</Text>
          </Box>,
        );
      });
    }

    allRows.push(
      <HelpFooter key="footer" text="Esc back \u00b7 \u2191\u2193 nav \u00b7 Enter select" />,
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {allRows}
    </Box>
  );
}
