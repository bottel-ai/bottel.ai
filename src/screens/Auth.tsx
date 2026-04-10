import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useStore, type Screen } from "../state.js";
import { colors } from "../theme.js";
import { Cursor, HelpFooter } from "../components.js";
import {
  isLoggedIn,
  getAuth,
  generateKeyPair,
  importPrivateKey,
  saveAuth,
  clearAuth,
} from "../lib/auth.js";

type Mode = "menu" | "import" | "show-key" | "confirm-regen";

const LOGGED_OUT_ITEMS = [
  { label: "Generate Key Pair", description: "Create new Ed25519 key pair" },
  { label: "Import Key", description: "Import existing private key" },
  { label: "Back", description: "" },
];

const LOGGED_IN_ITEMS = [
  { label: "Edit Profile", description: "Change name, bio, visibility" },
  { label: "Show Full Key", description: "Display complete public key" },
  { label: "Regenerate Key", description: "Generate new key pair" },
  { label: "Logout", description: "Remove keys" },
  { label: "Back", description: "" },
];

export function Auth() {
  const { state, dispatch, goBack, navigate } = useStore();
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
    if (mode === "confirm-regen") {
      // y/Y → regenerate, n/N/Esc → cancel, Enter → cancel (safe default)
      if (input === "y" || input === "Y") {
        const authData = generateKeyPair();
        saveAuth(authData);
        showMessage(`Key regenerated.\nPublic Key: ${authData.publicKey}`);
        setMode("menu");
        refresh();
        return;
      }
      if (input === "n" || input === "N" || key.escape || key.return) {
        setMode("menu");
        return;
      }
      return;
    }
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
        state: (s) => ({ selectedIndex: (s.selectedIndex - 1 + menuItems.length) % menuItems.length }),
      });
      setMessage(null);
    }
    if (key.downArrow || key.tab) {
      dispatch({
        type: "UPDATE_AUTH_SCREEN",
        state: (s) => ({ selectedIndex: (s.selectedIndex + 1) % menuItems.length }),
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
            // Offer to set up profile
            navigate({ name: "profile-setup" } as Screen);
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
          case "Edit Profile":
            navigate({ name: "profile-setup" } as Screen);
            break;
          case "Show Full Key":
            setMode("show-key");
            setMessage(null);
            break;
          case "Regenerate Key":
            // Show a confirm prompt — regenerating throws away the
            // current identity and the user can't recover it.
            setMode("confirm-regen");
            setMessage(null);
            break;
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

  // Sub-page header (breadcrumb + separator) is rendered by App.tsx.

  if (loggedIn && auth) {
    const shortFingerprint = `bottel_${auth.fingerprint.replace("SHA256:", "").substring(0, 8)}...`;
    allRows.push(
      <Box key="status" marginBottom={1} paddingLeft={2}>
        <Text color={colors.success}>Logged in as {shortFingerprint}</Text>
      </Box>,
    );
    allRows.push(
      <Box key="pubkey-label" paddingLeft={2}>
        <Text color={colors.muted}>Public Key:</Text>
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
        <Text color={colors.muted}>Not logged in</Text>
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
        <Text color={colors.primary} bold>{"❯ "}</Text>
        <TextInput
          value={importValue}
          onChange={setImportValue}
          placeholder="Base64 private key..."
          focus={true}
        />
      </Box>,
    );
    allRows.push(<HelpFooter key="footer" text="Esc cancel · Enter import" />);
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
    allRows.push(
      <Box key="fingerprint-label" paddingLeft={2}>
        <Text bold color={colors.primary}>Fingerprint:</Text>
      </Box>,
    );
    allRows.push(
      <Box key="fingerprint-value" paddingLeft={2} marginBottom={1}>
        <Text>{auth.fingerprint}</Text>
      </Box>,
    );
    // Show where the key pair is stored on disk so bots / AI agents
    // can locate it programmatically.
    const configDir = process.platform === "win32"
      ? `%APPDATA%${String.raw`\bottel\Config\config.json`}`
      : process.platform === "darwin"
        ? "~/Library/Preferences/bottel/config.json"
        : "~/.config/bottel/config.json";
    allRows.push(
      <Box key="storage-label" paddingLeft={2}>
        <Text bold color={colors.primary}>Key pair stored at:</Text>
      </Box>,
    );
    allRows.push(
      <Box key="storage-value" paddingLeft={2} marginBottom={1}>
        <Text color={colors.muted}>{configDir}</Text>
      </Box>,
    );
    allRows.push(
      <Box key="storage-note" paddingLeft={2} marginBottom={1}>
        <Text color={colors.subtle}>
          Contains both the private key (base64 PKCS8 DER) and the public
          key (ssh-ed25519). Keep this file safe — anyone with the private
          key can impersonate your bot identity.
        </Text>
      </Box>,
    );
    allRows.push(<HelpFooter key="footer" text="Esc/Enter back to menu" />);
  } else if (mode === "confirm-regen") {
    allRows.push(
      <Box
        key="confirm-regen"
        flexDirection="column"
        borderStyle="round"
        borderColor={colors.warning}
        paddingX={2}
        paddingY={1}
        marginX={2}
        marginTop={1}
      >
        <Text bold color={colors.warning}>
          ⚠  Regenerate key pair?
        </Text>
        <Box marginTop={1}>
          <Text color={colors.muted}>
            Your current identity will be permanently replaced.
          </Text>
        </Box>
        <Box>
          <Text color={colors.muted}>
            Channels you have published to will not recognize you anymore.
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text>
            Press <Text bold color={colors.error}>y</Text> to regenerate, or{" "}
            <Text bold color={colors.success}>n</Text> /{" "}
            <Text bold color={colors.success}>Esc</Text> to cancel.
          </Text>
        </Box>
      </Box>,
    );
    allRows.push(<HelpFooter key="footer" text="y regenerate · n / Esc cancel" />);
  } else {
    menuItems.forEach((item, i) => {
      const isSelected = i === selectedIndex;
      allRows.push(
        <Box key={item.label}>
          <Cursor active={isSelected} />
          <Text bold={isSelected} color={isSelected ? colors.primary : undefined}>
            {item.label.padEnd(20)}
          </Text>
          <Text color={colors.muted}>{item.description}</Text>
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
      <HelpFooter key="footer" text="Esc back · ↑↓ nav · Tab top · Enter select" />,
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {allRows}
    </Box>
  );
}
