import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { Breadcrumb, Cursor, ScreenHeader, HelpFooter } from "../cli_app_components.js";
import { isLoggedIn, getAuth, getShortFingerprint } from "../lib/auth.js";
import { submitApp } from "../lib/api.js";

const STEP_LABELS = [
  "App Name",
  "Slug",
  "Description",
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
  const { step, name, slug, description, version } = state.submit;
  const [confirmIndex, setConfirmIndex] = useState(0); // 0=Submit, 1=Cancel
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loggedIn = isLoggedIn();
  const auth = getAuth();

  const update = (s: Partial<typeof state.submit>) =>
    dispatch({ type: "UPDATE_SUBMIT", state: s });

  useInput((_input, key) => {
    if (submitted) {
      if (key.escape || key.return) {
        goBack();
      }
      return;
    }

    if (!loggedIn) {
      if (key.escape) {
        goBack();
      }
      return;
    }

    if (step === 4) {
      if (key.escape) {
        update({ step: 3 });
        return;
      }
      if (key.leftArrow) {
        setConfirmIndex((confirmIndex - 1 + 2) % 2);
        return;
      }
      if (key.rightArrow || key.tab) {
        setConfirmIndex((confirmIndex + 1) % 2);
        return;
      }
      if (key.return) {
        if (confirmIndex === 1) {
          goBack();
          return;
        }
        if (submitting) return;
        const fingerprint = auth?.fingerprint ?? "unknown";
        setSubmitting(true);
        setError(null);
        submitApp({ name, slug, description, category: "General", version }, fingerprint)
          .then(() => {
            setSubmitted(true);
          })
          .catch((err: Error) => {
            setError(err.message);
          })
          .finally(() => {
            setSubmitting(false);
          });
        return;
      }
      return;
    }

    if (key.escape) {
      if (step === 0) {
        goBack();
      } else {
        update({ step: step - 1 });
      }
      return;
    }

    if (key.return) {
      if (step === 0) {
        const autoSlug = slugify(name);
        update({ step: 1, slug: autoSlug });
      } else if (step === 1) {
        update({ step: 2 });
      } else if (step === 2) {
        update({ step: 3 });
      } else if (step === 3) {
        update({ step: 4 });
      }
      return;
    }
  });

  const allRows: React.ReactNode[] = [];

  allRows.push(<Breadcrumb key="breadcrumb" path={["Home", "Submit App"]} />);
  allRows.push(<ScreenHeader key="header" title="Submit App" />);

  if (!loggedIn) {
    allRows.push(
      <Box key="not-logged-in" paddingLeft={2}>
        <Text color={colors.error}>
          You must be logged in to submit an app. Go to Auth to generate or import a key.
        </Text>
      </Box>,
    );
    allRows.push(<HelpFooter key="footer" text="Esc back" />);

    return (
      <Box flexDirection="column" paddingX={1}>
        {allRows}
      </Box>
    );
  }

  if (submitted) {
    allRows.push(
      <Box key="success" paddingLeft={2} flexDirection="column">
        <Text color={colors.success} bold>
          App submitted successfully!
        </Text>
        <Text dimColor>Your app has been published to bottel.ai.</Text>
      </Box>,
    );
    allRows.push(<HelpFooter key="footer" text="Esc/Enter back to home" />);

    return (
      <Box flexDirection="column" paddingX={1}>
        {allRows}
      </Box>
    );
  }

  if (step === 4) {
    const shortFp = getShortFingerprint();

    allRows.push(
      <Box key="review-label" paddingLeft={2} marginBottom={1}>
        <Text bold>Review your submission:</Text>
      </Box>,
    );

    const fields: [string, string][] = [
      ["Name:", name],
      ["Slug:", slug],
      ["Description:", description],
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
        <Text bold={confirmIndex === 0} color={confirmIndex === 0 ? colors.success : undefined}>
          Submit
        </Text>
        <Text>   </Text>
        <Cursor active={confirmIndex === 1} />
        <Text bold={confirmIndex === 1} color={confirmIndex === 1 ? colors.error : undefined}>
          Cancel
        </Text>
      </Box>,
    );

    if (submitting) {
      allRows.push(
        <Box key="submitting" paddingLeft={2} marginTop={1}>
          <Text color={colors.primary}>Submitting...</Text>
        </Box>,
      );
    }

    if (error) {
      allRows.push(
        <Box key="error" paddingLeft={2} marginTop={1}>
          <Text color={colors.error}>Error: {error}</Text>
        </Box>,
      );
    }

    allRows.push(
      <HelpFooter key="footer" text="Esc cancel · ←→ nav · Tab toggle · Enter confirm" />,
    );

    return (
      <Box flexDirection="column" paddingX={1}>
        {allRows}
      </Box>
    );
  }

  const fieldMap: Record<number, { label: string; value: string; setter: (v: string) => void; placeholder: string }> = {
    0: {
      label: "Name",
      value: name,
      setter: (v: string) => update({ name: v }),
      placeholder: "My Cool App",
    },
    1: {
      label: "Slug",
      value: slug,
      setter: (v: string) => update({ slug: v }),
      placeholder: "my-cool-app",
    },
    2: {
      label: "Description",
      value: description,
      setter: (v: string) => update({ description: v }),
      placeholder: "A tool that does stuff",
    },
    3: {
      label: "Version",
      value: version,
      setter: (v: string) => update({ version: v }),
      placeholder: "0.1.0",
    },
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
        <TextInput
          value={field.value}
          onChange={field.setter}
          placeholder={field.placeholder}
          focus={true}
        />
      </Box>
    </Box>,
  );

  allRows.push(
    <HelpFooter key="footer" text="Esc cancel · Enter next" />,
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      {allRows}
    </Box>
  );
}
