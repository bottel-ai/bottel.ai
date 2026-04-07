import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../state.js";
import { colors } from "../theme.js";
import { Breadcrumb, Cursor, ScreenHeader, HelpFooter } from "../components.js";
import { isLoggedIn, getAuth, getShortFingerprint } from "../lib/auth.js";
import { submitApp } from "../lib/api.js";

const STEP_LABELS = [
  "App Name",
  "App ID",
  "Description",
  "MCP Server URL",
  "npm Package",
  "Version",
  "Confirm",
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function Submit() {
  const { state, dispatch, goBack } = useStore();
  const { step, name, slug, description, mcpUrl, npmPackage, version } = state.submit;
  const [confirmIndex, setConfirmIndex] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loggedIn = isLoggedIn();
  const auth = getAuth();

  const update = (s: Partial<typeof state.submit>) =>
    dispatch({ type: "UPDATE_SUBMIT", state: s });

  useInput((_input, key) => {
    if (submitted) {
      if (key.escape || key.return) goBack();
      return;
    }

    if (!loggedIn) {
      if (key.escape) goBack();
      return;
    }

    if (step === 6) {
      if (key.escape) { update({ step: 5 }); return; }
      if (key.leftArrow) { setConfirmIndex((confirmIndex - 1 + 2) % 2); return; }
      if (key.rightArrow || key.tab) { setConfirmIndex((confirmIndex + 1) % 2); return; }
      if (key.return) {
        if (confirmIndex === 1) { goBack(); return; }
        if (submitting) return;
        const fingerprint = auth?.fingerprint ?? "unknown";
        setSubmitting(true);
        setError(null);
        submitApp({ name, slug, description, category: "General", version, mcpUrl, npmPackage }, fingerprint)
          .then(() => setSubmitted(true))
          .catch((err: Error) => setError(err.message))
          .finally(() => setSubmitting(false));
      }
      return;
    }

    if (key.escape) {
      if (step === 0) goBack();
      else update({ step: step - 1 });
      return;
    }

    if (key.return) {
      // Validation
      if (step === 0 && !name.trim()) { setError("Name is required"); return; }
      if (step === 0 && name.trim().length < 2) { setError("Name must be at least 2 characters"); return; }
      if (step === 0 && name.trim().length > 50) { setError("Name must be under 50 characters"); return; }
      if (step === 1 && !slug.trim()) { setError("App ID is required"); return; }
      if (step === 1 && !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && slug.length > 1) { setError("App ID must be lowercase letters, numbers, and hyphens only"); return; }
      if (step === 2 && !description.trim()) { setError("Description is required"); return; }
      if (step === 2 && description.trim().length < 10) { setError("Description must be at least 10 characters"); return; }
      if (step === 2 && description.trim().length > 200) { setError("Description must be under 200 characters"); return; }
      if (step === 3 && mcpUrl.trim() && !/^https?:\/\/.+/.test(mcpUrl.trim())) { setError("MCP URL must start with http:// or https://"); return; }
      if (step === 4 && npmPackage.trim() && !/^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9-_.]*$/.test(npmPackage.trim())) { setError("Invalid npm package name (e.g. @scope/name or my-package)"); return; }
      if (step === 5 && !version.trim()) { setError("Version is required"); return; }
      if (step === 5 && !/^\d+\.\d+\.\d+$/.test(version.trim())) { setError("Version must be in semver format (e.g. 1.0.0)"); return; }

      setError(null);
      if (step === 0) update({ step: 1, slug: slugify(name) });
      else if (step < 6) update({ step: step + 1 });
      return;
    }
  });

  const allRows: React.ReactNode[] = [];

  allRows.push(<Breadcrumb key="breadcrumb" path={["Home", "Submit"]} />);
  allRows.push(<ScreenHeader key="header" title="Submit App" />);

  if (!loggedIn) {
    allRows.push(
      <Box key="not-logged-in" paddingLeft={2}>
        <Text color={colors.error}>You must be logged in. Go to Auth first.</Text>
      </Box>,
    );
    allRows.push(<HelpFooter key="footer" text="Esc back" />);
    return <Box flexDirection="column" paddingX={1}>{allRows}</Box>;
  }

  if (submitted) {
    allRows.push(
      <Box key="success" paddingLeft={2} flexDirection="column">
        <Text color={colors.success} bold>App submitted successfully!</Text>
        <Text dimColor>Your app has been published to bottel.ai.</Text>
      </Box>,
    );
    allRows.push(<HelpFooter key="footer" text="Esc/Enter back to home" />);
    return <Box flexDirection="column" paddingX={1}>{allRows}</Box>;
  }

  if (step === 6) {
    const shortFp = getShortFingerprint();

    allRows.push(
      <Box key="review-label" paddingLeft={2} marginBottom={1}>
        <Text bold>Review your submission:</Text>
      </Box>,
    );

    const fields: [string, string][] = [
      ["Name:", name],
      ["App ID:", slug],
      ["Description:", description],
      ["MCP URL:", mcpUrl || "(none)"],
      ["npm Package:", npmPackage || "(none)"],
      ["Version:", version],
      ["Signed by:", `bottel_${shortFp.replace("SHA256:", "")}...`],
    ];

    fields.forEach(([label, value]) => {
      allRows.push(
        <Box key={`field-${label}`} paddingLeft={2}>
          <Text dimColor>{label.padEnd(14)}</Text>
          <Text>{value}</Text>
        </Box>,
      );
    });

    allRows.push(
      <Box key="confirm-buttons" paddingLeft={2} marginTop={1} gap={2}>
        <Cursor active={confirmIndex === 0} />
        <Text bold={confirmIndex === 0} color={confirmIndex === 0 ? colors.success : undefined}>Submit</Text>
        <Text>   </Text>
        <Cursor active={confirmIndex === 1} />
        <Text bold={confirmIndex === 1} color={confirmIndex === 1 ? colors.error : undefined}>Cancel</Text>
      </Box>,
    );

    if (submitting) {
      allRows.push(<Box key="submitting" paddingLeft={2} marginTop={1}><Text color={colors.primary}>Submitting...</Text></Box>);
    }
    if (error) {
      allRows.push(<Box key="error" paddingLeft={2} marginTop={1}><Text color={colors.error}>Error: {error}</Text></Box>);
    }

    allRows.push(<HelpFooter key="footer" text="Esc cancel · ←→ nav · Tab toggle · Enter confirm" />);
    return <Box flexDirection="column" paddingX={1}>{allRows}</Box>;
  }

  const fieldMap: Record<number, { label: string; value: string; setter: (v: string) => void; placeholder: string; hint?: string }> = {
    0: { label: "Name", value: name, setter: (v) => { update({ name: v }); setError(null); }, placeholder: "My Cool Bot" },
    1: { label: "App ID", value: slug, setter: (v) => { update({ slug: v }); setError(null); }, placeholder: "my-cool-bot" },
    2: { label: "Description", value: description, setter: (v) => { update({ description: v }); setError(null); }, placeholder: "A bot that does awesome things" },
    3: { label: "MCP Server URL", value: mcpUrl, setter: (v) => { update({ mcpUrl: v }); setError(null); }, placeholder: "https://my-bot.example.com/mcp", hint: "Optional — leave empty if not an MCP service" },
    4: { label: "npm Package", value: npmPackage, setter: (v) => { update({ npmPackage: v }); setError(null); }, placeholder: "@scope/my-bot or my-bot", hint: "Optional — npm package to install/run via npx" },
    5: { label: "Version", value: version, setter: (v) => { update({ version: v }); setError(null); }, placeholder: "0.1.0" },
  };

  const field = fieldMap[step]!;

  allRows.push(
    <Box key="step-label" paddingLeft={2} marginBottom={1}>
      <Text bold>Step {step + 1}/{STEP_LABELS.length}: {STEP_LABELS[step]}</Text>
    </Box>,
  );

  allRows.push(
    <Box key="input-label" paddingLeft={2}>
      <Text dimColor>{field.label}</Text>
    </Box>,
  );

  allRows.push(
    <Box key="input-row" paddingLeft={2} marginBottom={1}>
      <Box borderStyle="round" borderColor={colors.primary} paddingX={1} flexGrow={1}>
        <TextInput value={field.value} onChange={field.setter} placeholder={field.placeholder} focus={true} />
      </Box>
    </Box>,
  );

  if (field.hint) {
    allRows.push(
      <Box key="hint" paddingLeft={2}>
        <Text dimColor>{field.hint}</Text>
      </Box>,
    );
  }

  if (error) {
    allRows.push(<Box key="error" paddingLeft={2}><Text color={colors.error}>{error}</Text></Box>);
  }

  allRows.push(<HelpFooter key="footer" text="Esc cancel · Enter next" />);

  return <Box flexDirection="column" paddingX={1}>{allRows}</Box>;
}
