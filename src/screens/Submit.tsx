import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../state.js";
import { colors } from "../theme.js";
import { Breadcrumb, Cursor, ScreenHeader, HelpFooter } from "../components.js";
import { isLoggedIn, getAuth, getShortFingerprint } from "../lib/auth.js";
import { submitApp } from "../lib/api.js";

// Linear MCP-only flow
const STEP = {
  NAME: 0,
  ID: 1,
  DESCRIPTION: 2,
  MCP: 3,
  VERSION: 4,
  CONFIRM: 5,
} as const;

const STEP_LABELS: Record<number, string> = {
  [STEP.NAME]: "App Name",
  [STEP.ID]: "App ID",
  [STEP.DESCRIPTION]: "Description",
  [STEP.MCP]: "MCP Server URL",
  [STEP.VERSION]: "Version",
  [STEP.CONFIRM]: "Confirm",
};

const TOTAL_STEPS = 6;

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function Submit() {
  const { state, dispatch, goBack } = useStore();
  const { step, name, slug, description, mcpUrl, version } = state.submit;
  const [confirmIndex, setConfirmIndex] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loggedIn = isLoggedIn();
  const auth = getAuth();

  const update = (s: Partial<typeof state.submit>) =>
    dispatch({ type: "UPDATE_SUBMIT", state: s });

  const goToNext = () => {
    if (step < STEP.CONFIRM) update({ step: step + 1 });
  };
  const goToPrev = () => {
    if (step > 0) update({ step: step - 1 });
    else goBack();
  };

  useInput((_input, key) => {
    if (submitted) {
      if (key.escape || key.return) goBack();
      return;
    }

    if (!loggedIn) {
      if (key.escape) goBack();
      return;
    }

    // Confirm step
    if (step === STEP.CONFIRM) {
      if (key.escape) { goToPrev(); return; }
      if (key.leftArrow) { setConfirmIndex((confirmIndex - 1 + 2) % 2); return; }
      if (key.rightArrow || key.tab) { setConfirmIndex((confirmIndex + 1) % 2); return; }
      if (key.return) {
        if (confirmIndex === 1) { goBack(); return; }
        if (submitting) return;
        const fingerprint = auth?.fingerprint ?? "unknown";
        setSubmitting(true);
        setError(null);
        submitApp({ name, slug, description, category: "General", version, mcpUrl }, fingerprint)
          .then(() => setSubmitted(true))
          .catch((err: Error) => setError(err.message))
          .finally(() => setSubmitting(false));
      }
      return;
    }

    if (key.escape) { goToPrev(); return; }

    if (key.return) {
      // Validation per step
      if (step === STEP.NAME) {
        if (!name.trim()) { setError("Name is required"); return; }
        if (name.trim().length < 2) { setError("Name must be at least 2 characters"); return; }
        if (name.trim().length > 50) { setError("Name must be under 50 characters"); return; }
      }
      if (step === STEP.ID) {
        if (!slug.trim()) { setError("App ID is required"); return; }
        if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && slug.length > 1) { setError("App ID must be lowercase letters, numbers, and hyphens only"); return; }
      }
      if (step === STEP.DESCRIPTION) {
        if (!description.trim()) { setError("Description is required"); return; }
        if (description.trim().length < 10) { setError("Description must be at least 10 characters"); return; }
        if (description.trim().length > 200) { setError("Description must be under 200 characters"); return; }
      }
      if (step === STEP.MCP) {
        if (!mcpUrl.trim()) { setError("MCP URL is required"); return; }
        if (!/^https?:\/\/.+/.test(mcpUrl.trim())) { setError("MCP URL must start with http:// or https://"); return; }
      }
      if (step === STEP.VERSION) {
        if (!version.trim()) { setError("Version is required"); return; }
        if (!/^\d+\.\d+\.\d+$/.test(version.trim())) { setError("Version must be in semver format (e.g. 1.0.0)"); return; }
      }

      setError(null);
      if (step === STEP.NAME) update({ slug: slugify(name) });
      goToNext();
    }
  });

  const allRows: React.ReactNode[] = [];

  allRows.push(<Breadcrumb key="breadcrumb" path={["Home", "Submit"]} />);
  allRows.push(<ScreenHeader key="header" title="Submit MCP App" />);

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
        <Text dimColor>Your MCP app has been published to bottel.ai.</Text>
      </Box>,
    );
    allRows.push(<HelpFooter key="footer" text="Esc/Enter back to home" />);
    return <Box flexDirection="column" paddingX={1}>{allRows}</Box>;
  }

  // Confirm step
  if (step === STEP.CONFIRM) {
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
      ["MCP URL:", mcpUrl],
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

    allRows.push(<HelpFooter key="footer" text="Esc back · ←→ nav · Tab toggle · Enter confirm" />);
    return <Box flexDirection="column" paddingX={1}>{allRows}</Box>;
  }

  // Field input steps
  const fieldMap: Record<number, { label: string; value: string; setter: (v: string) => void; placeholder: string }> = {
    [STEP.NAME]: { label: "Name", value: name, setter: (v) => { update({ name: v }); setError(null); }, placeholder: "My Cool Bot" },
    [STEP.ID]: { label: "App ID", value: slug, setter: (v) => { update({ slug: v }); setError(null); }, placeholder: "my-cool-bot" },
    [STEP.DESCRIPTION]: { label: "Description", value: description, setter: (v) => { update({ description: v }); setError(null); }, placeholder: "A bot that does awesome things" },
    [STEP.MCP]: { label: "MCP Server URL", value: mcpUrl, setter: (v) => { update({ mcpUrl: v }); setError(null); }, placeholder: "https://my-bot.example.com/mcp" },
    [STEP.VERSION]: { label: "Version", value: version, setter: (v) => { update({ version: v }); setError(null); }, placeholder: "0.1.0" },
  };

  const field = fieldMap[step]!;

  allRows.push(
    <Box key="step-label" paddingLeft={2} marginBottom={1}>
      <Text bold>Step {step + 1}/{TOTAL_STEPS}: {STEP_LABELS[step]}</Text>
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

  if (error) {
    allRows.push(<Box key="error" paddingLeft={2}><Text color={colors.error}>{error}</Text></Box>);
  }

  allRows.push(<HelpFooter key="footer" text="Esc back · Enter next" />);

  return <Box flexDirection="column" paddingX={1}>{allRows}</Box>;
}
