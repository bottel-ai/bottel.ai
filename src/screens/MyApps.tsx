import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../state.js";
import { colors } from "../theme.js";
import { Breadcrumb, Cursor, ScreenHeader, HelpFooter } from "../components.js";
import { isLoggedIn, getAuth } from "../lib/auth.js";
import { type App, getMyApps, deleteApp, updateApp } from "../lib/api.js";

export function MyApps() {
  const { state, dispatch, navigate, goBack } = useStore();
  const selectedIndex = state.myApps.selectedIndex;

  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editStep, setEditStep] = useState(0); // 0=name, 1=description, 2=version, 3=confirm
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editVersion, setEditVersion] = useState("");
  const [editConfirmIndex, setEditConfirmIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  const loggedIn = isLoggedIn();
  const auth = getAuth();
  const fingerprint = auth?.fingerprint ?? "";

  useEffect(() => {
    if (!loggedIn) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    getMyApps(fingerprint)
      .then((data) => {
        if (!cancelled) setApps(data);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [loggedIn, fingerprint]);

  useInput((input, key) => {
    // Edit mode input handling
    if (editing) {
      if (editStep === 3) {
        // Confirm step
        if (key.escape) {
          setEditStep(2);
          return;
        }
        if (key.leftArrow) {
          setEditConfirmIndex((editConfirmIndex - 1 + 2) % 2);
          return;
        }
        if (key.rightArrow || key.tab) {
          setEditConfirmIndex((editConfirmIndex + 1) % 2);
          return;
        }
        if (key.return) {
          if (editConfirmIndex === 1) {
            // Cancel
            setEditing(false);
            return;
          }
          // Save
          const app = apps[selectedIndex];
          if (!app || saving) return;
          setSaving(true);
          setError(null);
          updateApp(app.slug, { name: editName, description: editDescription, version: editVersion }, fingerprint)
            .then(() => {
              // Refresh the list
              return getMyApps(fingerprint);
            })
            .then((data) => {
              setApps(data);
              setEditing(false);
            })
            .catch((err: Error) => {
              setError(err.message);
            })
            .finally(() => {
              setSaving(false);
            });
        }
        return;
      }

      // Steps 0-2: text input steps
      if (key.escape) {
        if (editStep === 0) {
          setEditing(false);
        } else {
          setEditStep(editStep - 1);
        }
        return;
      }
      if (key.return) {
        setEditStep(editStep + 1);
        if (editStep + 1 === 3) {
          setEditConfirmIndex(0);
        }
        return;
      }
      return;
    }

    if (confirmDelete !== null) {
      if (input === "y" || input === "Y") {
        const app = apps[confirmDelete];
        if (app && !deleting) {
          setDeleting(true);
          deleteApp(app.slug, fingerprint)
            .then(() => {
              setApps((prev) => prev.filter((_, i) => i !== confirmDelete));
              setConfirmDelete(null);
              // Adjust selected index if needed
              dispatch({
                type: "UPDATE_MY_APPS",
                state: { selectedIndex: Math.max(0, selectedIndex - (selectedIndex >= apps.length - 1 ? 1 : 0)) },
              });
            })
            .catch((err) => {
              setError(String(err));
              setConfirmDelete(null);
            })
            .finally(() => {
              setDeleting(false);
            });
        }
        return;
      }
      if (input === "n" || input === "N" || key.escape) {
        setConfirmDelete(null);
        return;
      }
      return;
    }

    if (key.escape) {
      goBack();
      return;
    }

    if (key.upArrow) {
      if (apps.length > 0) {
        dispatch({ type: "UPDATE_MY_APPS", state: { selectedIndex: (selectedIndex - 1 + apps.length) % apps.length } });
      }
      return;
    }

    if (key.downArrow || key.tab) {
      if (apps.length > 0) {
        dispatch({ type: "UPDATE_MY_APPS", state: { selectedIndex: (selectedIndex + 1) % apps.length } });
      }
      return;
    }

    if (key.return) {
      const app = apps[selectedIndex];
      if (app) {
        navigate({ name: "agent-detail", agentId: app.id });
      }
      return;
    }

    if (input === "e" && !confirmDelete && apps.length > 0) {
      const app = apps[selectedIndex];
      if (app) {
        setEditName(app.name);
        setEditDescription(app.description);
        setEditVersion(app.version);
        setEditStep(0);
        setEditing(true);
      }
      return;
    }

    if (input === "d" || input === "D") {
      if (apps.length > 0) {
        setConfirmDelete(selectedIndex);
      }
      return;
    }
  });

  const rows: React.ReactNode[] = [];

  rows.push(<Breadcrumb key="breadcrumb" path={["Home", "My Apps"]} />);
  rows.push(<ScreenHeader key="header" title="My Apps" />);

  if (!loggedIn) {
    rows.push(
      <Box key="not-logged-in" paddingLeft={2}>
        <Text color={colors.error}>
          You must be logged in to view your apps. Go to Auth to generate or import a key.
        </Text>
      </Box>,
    );
    rows.push(<HelpFooter key="footer" text="Esc back" />);
    return (
      <Box flexDirection="column" paddingX={1}>
        {rows}
      </Box>
    );
  }

  if (loading) {
    rows.push(
      <Box key="loading" paddingLeft={2}>
        <Text>Loading...</Text>
      </Box>,
    );
    return (
      <Box flexDirection="column" paddingX={1}>
        {rows}
      </Box>
    );
  }

  if (error) {
    rows.push(
      <Box key="error" paddingLeft={2}>
        <Text color={colors.error}>Error: {error}</Text>
      </Box>,
    );
    rows.push(<HelpFooter key="footer" text="Esc back" />);
    return (
      <Box flexDirection="column" paddingX={1}>
        {rows}
      </Box>
    );
  }

  if (apps.length === 0) {
    rows.push(
      <Box key="empty" paddingLeft={2} flexDirection="column">
        <Text dimColor>No apps yet.</Text>
        <Text dimColor>Go to Submit to publish your first app!</Text>
      </Box>,
    );
    rows.push(<HelpFooter key="footer" text="Esc back" />);
    return (
      <Box flexDirection="column" paddingX={1}>
        {rows}
      </Box>
    );
  }

  // Edit mode rendering
  if (editing) {
    const app = apps[selectedIndex];
    const EDIT_STEP_LABELS = ["Name", "Description", "Version"];

    rows.push(
      <Box key="editing-title" paddingLeft={2} marginBottom={1}>
        <Text bold>Editing: {app?.name}</Text>
      </Box>,
    );

    if (editStep < 3) {
      const editFieldMap: Record<number, { label: string; value: string; setter: (v: string) => void }> = {
        0: { label: "Name", value: editName, setter: setEditName },
        1: { label: "Description", value: editDescription, setter: setEditDescription },
        2: { label: "Version", value: editVersion, setter: setEditVersion },
      };

      const field = editFieldMap[editStep]!;

      rows.push(
        <Box key="edit-step-label" paddingLeft={4} marginBottom={1}>
          <Text bold>Step {editStep + 1}/3: {EDIT_STEP_LABELS[editStep]}</Text>
        </Box>,
      );

      rows.push(
        <Box key="edit-input-row" paddingLeft={4}>
          <Text>{field.label}: </Text>
          <TextInput
            value={field.value}
            onChange={field.setter}
            focus={true}
          />
        </Box>,
      );

      rows.push(
        <HelpFooter key="footer" text="Esc cancel · Enter next" />,
      );
    } else {
      // Confirm step
      rows.push(
        <Box key="changes-label" paddingLeft={4} marginBottom={1}>
          <Text bold>Changes:</Text>
        </Box>,
      );

      const changes: [string, string, string][] = [
        ["Name:", app?.name ?? "", editName],
        ["Description:", app?.description ?? "", editDescription],
        ["Version:", app?.version ?? "", editVersion],
      ];

      changes.forEach(([label, oldVal, newVal]) => {
        const changed = oldVal !== newVal;
        rows.push(
          <Box key={`change-${label}`} paddingLeft={6}>
            <Text dimColor>{label.padEnd(14)}</Text>
            {changed ? (
              <Text>
                <Text dimColor>{oldVal}</Text>
                <Text dimColor> → </Text>
                <Text color={colors.primary}>{newVal}</Text>
              </Text>
            ) : (
              <Text>{oldVal}</Text>
            )}
          </Box>,
        );
      });

      rows.push(
        <Box key="edit-confirm-buttons" paddingLeft={4} marginTop={1} gap={2}>
          <Cursor active={editConfirmIndex === 0} />
          <Text bold={editConfirmIndex === 0} color={editConfirmIndex === 0 ? colors.success : undefined}>
            Save
          </Text>
          <Text>   </Text>
          <Cursor active={editConfirmIndex === 1} />
          <Text bold={editConfirmIndex === 1} color={editConfirmIndex === 1 ? colors.error : undefined}>
            Cancel
          </Text>
        </Box>,
      );

      if (saving) {
        rows.push(
          <Box key="saving" paddingLeft={4} marginTop={1}>
            <Text color={colors.primary}>Saving...</Text>
          </Box>,
        );
      }

      if (error) {
        rows.push(
          <Box key="edit-error" paddingLeft={4} marginTop={1}>
            <Text color={colors.error}>Error: {error}</Text>
          </Box>,
        );
      }

      rows.push(
        <HelpFooter key="footer" text="Esc cancel · ←→ nav · Tab toggle · Enter confirm" />,
      );
    }

    return (
      <Box flexDirection="column" paddingX={1}>
        {rows}
      </Box>
    );
  }

  rows.push(
    <Box key="count" paddingLeft={2} marginBottom={1}>
      <Text bold>Your Apps ({apps.length})</Text>
    </Box>,
  );

  apps.forEach((app, i) => {
    const isActive = i === selectedIndex;
    const isDeleting = confirmDelete === i;

    rows.push(
      <Box key={`app-${app.slug}`} paddingLeft={2} flexDirection="column">
        <Box>
          <Cursor active={isActive} />
          <Box width={22}>
            <Text color={isActive ? colors.primary : undefined} bold={isActive}>
              {app.name}
            </Text>
          </Box>
          <Box width={10}>
            <Text dimColor>v{app.version}</Text>
          </Box>
          <Text dimColor>{app.installs} installs</Text>
        </Box>
        {isDeleting && (
          <Box paddingLeft={4}>
            {deleting ? (
              <Text color={colors.error}>Deleting...</Text>
            ) : (
              <Text color={colors.error}>
                Delete {app.name}? y/n
              </Text>
            )}
          </Box>
        )}
      </Box>,
    );
  });

  rows.push(
    <HelpFooter key="footer" text="Esc back · ↑↓ nav · Tab top · Enter view · e edit · d delete" />,
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      {rows}
    </Box>
  );
}
