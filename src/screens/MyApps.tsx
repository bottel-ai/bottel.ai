import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { Breadcrumb, Cursor, ScreenHeader, HelpFooter } from "../cli_app_components.js";
import { isLoggedIn, getAuth } from "../lib/auth.js";
import { type App, getMyApps, deleteApp } from "../lib/api.js";

export function MyApps() {
  const { state, dispatch, navigate, goBack } = useStore();
  const selectedIndex = state.myApps.selectedIndex;

  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      dispatch({ type: "UPDATE_MY_APPS", state: { selectedIndex: Math.max(0, selectedIndex - 1) } });
      return;
    }

    if (key.downArrow) {
      dispatch({ type: "UPDATE_MY_APPS", state: { selectedIndex: Math.min(apps.length - 1, selectedIndex + 1) } });
      return;
    }

    if (key.return) {
      const app = apps[selectedIndex];
      if (app) {
        navigate({ name: "agent-detail", agentId: app.id });
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
    <HelpFooter key="footer" text="Esc back \u00b7 \u2191\u2193 nav \u00b7 Enter view \u00b7 d delete" />,
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      {rows}
    </Box>
  );
}
