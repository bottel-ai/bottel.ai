import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import Conf from "conf";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { Breadcrumb, Cursor, ScreenHeader, HelpFooter } from "../cli_app_components.js";
import { isLoggedIn, getAuth, getShortFingerprint } from "../lib/auth.js";

const CATEGORIES = [
  "Development",
  "Security",
  "Data & Analytics",
  "Writing & Content",
  "DevOps & Infra",
  "Research",
];

const STEP_LABELS = [
  "App Name",
  "Slug",
  "Description",
  "Category",
  "Version",
  "Confirm",
];

interface Submission {
  name: string;
  slug: string;
  description: string;
  category: string;
  version: string;
  fingerprint: string;
  submittedAt: string;
}

const submissionStore = new Conf<{ submissions: Submission[] }>({
  projectName: "bottel",
  defaults: { submissions: [] },
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function Submit() {
  const { state, dispatch, goBack } = useStore();
  const { step, name, slug, description, category, version } = state.submit;
  const [confirmIndex, setConfirmIndex] = useState(0); // 0=Submit, 1=Cancel
  const [submitted, setSubmitted] = useState(false);

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

    // Confirm step (step 5)
    if (step === 5) {
      if (key.escape) {
        update({ step: 4 });
        return;
      }
      if (key.leftArrow) {
        setConfirmIndex(0);
        return;
      }
      if (key.rightArrow) {
        setConfirmIndex(1);
        return;
      }
      if (key.return) {
        if (confirmIndex === 1) {
          // Cancel
          goBack();
          return;
        }
        // Submit
        const existing = submissionStore.get("submissions");
        const submission: Submission = {
          name,
          slug,
          description,
          category,
          version,
          fingerprint: auth?.fingerprint ?? "unknown",
          submittedAt: new Date().toISOString(),
        };
        submissionStore.set("submissions", [...existing, submission]);
        setSubmitted(true);
        return;
      }
      return;
    }

    // Category step (step 3) - arrow select
    if (step === 3) {
      if (key.escape) {
        update({ step: 2 });
        return;
      }
      if (key.upArrow) {
        const idx = CATEGORIES.indexOf(category);
        const newIdx = Math.max(0, idx - 1);
        update({ category: CATEGORIES[newIdx]! });
        return;
      }
      if (key.downArrow) {
        const idx = CATEGORIES.indexOf(category);
        const newIdx = Math.min(CATEGORIES.length - 1, idx + 1);
        update({ category: CATEGORIES[newIdx]! });
        return;
      }
      if (key.return) {
        update({ step: 4 });
        return;
      }
      return;
    }

    // Text input steps (0, 1, 2, 4)
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
        // Auto-generate slug from name
        const autoSlug = slugify(name);
        update({ step: 1, slug: autoSlug });
      } else if (step === 1) {
        update({ step: 2 });
      } else if (step === 2) {
        update({ step: 3 });
      } else if (step === 4) {
        update({ step: 5 });
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
        <Text dimColor>Your submission has been saved.</Text>
      </Box>,
    );
    allRows.push(<HelpFooter key="footer" text="Esc/Enter back to home" />);

    return (
      <Box flexDirection="column" paddingX={1}>
        {allRows}
      </Box>
    );
  }

  // Confirm step
  if (step === 5) {
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
      ["Category:", category],
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

    allRows.push(
      <HelpFooter key="footer" text="Esc cancel \u00b7 \u2190\u2192 nav \u00b7 Enter confirm" />,
    );

    return (
      <Box flexDirection="column" paddingX={1}>
        {allRows}
      </Box>
    );
  }

  // Category step
  if (step === 3) {
    allRows.push(
      <Box key="step-label" paddingLeft={2} marginBottom={1}>
        <Text bold>Step {step + 1}/{STEP_LABELS.length}: {STEP_LABELS[step]}</Text>
      </Box>,
    );

    CATEGORIES.forEach((cat) => {
      const isSelected = cat === category;
      allRows.push(
        <Box key={`cat-${cat}`}>
          <Cursor active={isSelected} />
          <Text bold={isSelected} color={isSelected ? colors.primary : undefined}>
            {cat}
          </Text>
        </Box>,
      );
    });

    allRows.push(
      <HelpFooter key="footer" text="Esc back \u00b7 \u2191\u2193 nav \u00b7 Enter next" />,
    );

    return (
      <Box flexDirection="column" paddingX={1}>
        {allRows}
      </Box>
    );
  }

  // Text input steps (0, 1, 2, 4)
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
    4: {
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
    <Box key="input-row" paddingLeft={2}>
      <Text>{field.label}: </Text>
      <TextInput
        value={field.value}
        onChange={field.setter}
        placeholder={field.placeholder}
        focus={true}
      />
    </Box>,
  );

  allRows.push(
    <HelpFooter key="footer" text="Esc cancel \u00b7 Enter next" />,
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      {allRows}
    </Box>
  );
}
