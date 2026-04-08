import { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { colors } from "@bottel/cli-app-scaffold/theme";
import { Breadcrumb, HelpFooter } from "@bottel/cli-app-scaffold/components";
import { getOrCreateAuth, setName } from "../lib/auth.js";

export function Greeting() {
  const { exit } = useApp();
  const auth = getOrCreateAuth();
  const [name, setLocalName] = useState(auth.name ?? "");
  const [editing, setEditing] = useState(!auth.name);
  const [input, setInput] = useState("");

  useInput((char, key) => {
    if (editing) return; // TextInput handles
    if (char === "q" || key.escape) exit();
    if (char === "e") setEditing(true);
  }, { isActive: !editing });

  const submit = () => {
    if (input.trim()) {
      setName(input.trim());
      setLocalName(input.trim());
      setEditing(false);
      setInput("");
    }
  };

  const shortFp = auth.fingerprint.replace("SHA256:", "").slice(0, 16);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Breadcrumb path={["Hello"]} />

      <Box marginBottom={1}>
        <Text bold color={colors.primary}>👋 bottel-hello</Text>
        <Text dimColor>  the smallest possible bottel app</Text>
      </Box>

      {editing ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>What should I call you?</Text>
          <Box borderStyle="round" borderColor={colors.primary} paddingX={1} marginTop={0}>
            <Text color={colors.accent}>❯ </Text>
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={submit}
              placeholder="Your name..."
              focus={true}
            />
          </Box>
          <Text dimColor>  Press Enter to save</Text>
        </Box>
      ) : (
        <Box flexDirection="column" borderStyle="round" borderColor={colors.primary} paddingX={2} paddingY={1} marginBottom={1} flexGrow={1}>
          <Box>
            <Text>Hello, </Text>
            <Text bold color={colors.accent}>{name}</Text>
            <Text>! 🎉</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Your public key fingerprint:</Text>
          </Box>
          <Box>
            <Text color={colors.success}>#{shortFp}</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Your full SSH public key:</Text>
          </Box>
          <Box>
            <Text color={colors.secondary}>{auth.publicKey}</Text>
          </Box>
        </Box>
      )}

      <HelpFooter text={editing ? "Enter save · Esc quit" : "e edit name · q quit"} />
    </Box>
  );
}
