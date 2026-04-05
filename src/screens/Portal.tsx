import React, { useMemo } from "react";
import { Box, Text, useInput } from "ink";
import fs from "fs";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { Cursor, Breadcrumb, HelpFooter, Separator } from "../cli_app_components.js";
import { adapterMap } from "../adapters/index.js";

interface ServiceData {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  requiresKey: boolean;
}

interface ServicesJson {
  featured: string[];
  categories: { name: string; icon: string; services: string[] }[];
  services: ServiceData[];
}

const servicesData: ServicesJson = JSON.parse(
  fs.readFileSync(new URL("../data/services.json", import.meta.url), "utf-8")
);

// Build a lookup map
const serviceMap = new Map<string, ServiceData>();
for (const s of servicesData.services) serviceMap.set(s.id, s);

// Build flat nav list: featured items, then category items
type NavItem = { serviceId: string; service: ServiceData };

function buildNavItems(): NavItem[] {
  const items: NavItem[] = [];
  const seen = new Set<string>();

  // Featured first
  for (const id of servicesData.featured) {
    const svc = serviceMap.get(id);
    if (svc) {
      items.push({ serviceId: id, service: svc });
      seen.add(id);
    }
  }

  // Remaining services by category (skip featured to avoid duplicates)
  for (const cat of servicesData.categories) {
    for (const id of cat.services) {
      if (seen.has(id)) continue;
      const svc = serviceMap.get(id);
      if (svc) {
        items.push({ serviceId: id, service: svc });
        seen.add(id);
      }
    }
  }

  return items;
}

export function Portal() {
  const { state, dispatch, navigate, goBack } = useStore();
  const { selectedIndex } = state.portal;

  const navItems = useMemo(() => buildNavItems(), []);

  useInput((_input, key) => {
    if (key.escape) {
      goBack();
      return;
    }
    if (key.upArrow) {
      dispatch({ type: "UPDATE_PORTAL", state: { selectedIndex: Math.max(0, selectedIndex - 1) } });
    }
    if (key.downArrow) {
      dispatch({ type: "UPDATE_PORTAL", state: { selectedIndex: Math.min(navItems.length - 1, selectedIndex + 1) } });
    }
    if (key.return) {
      const item = navItems[selectedIndex];
      if (item) {
        navigate({ name: "service", serviceId: item.serviceId });
      }
    }
  });

  // Track which flat index we're rendering
  let flatIndex = 0;

  function renderServiceRow(svc: ServiceData, fi: number) {
    const isActive = fi === selectedIndex;
    return (
      <Box key={`svc-${fi}-${svc.id}`}>
        <Cursor active={isActive} />
        <Box width={4}>
          <Text bold={isActive} color={isActive ? colors.primary : colors.accent}>{svc.icon}</Text>
        </Box>
        <Box width={22}>
          <Text bold={isActive} color={isActive ? colors.primary : undefined}>{svc.name}</Text>
        </Box>
        <Box width={34}>
          <Text dimColor={!isActive}>{svc.description}</Text>
        </Box>
        <Text dimColor color={svc.requiresKey ? colors.warning : colors.success}>
          {svc.requiresKey ? "key required" : "free"}
        </Text>
      </Box>
    );
  }

  const rows: React.ReactNode[] = [];

  // Breadcrumb
  rows.push(<Breadcrumb key="breadcrumb" path={["Home", "Portal"]} />);

  // Header
  rows.push(
    <Box key="header" marginBottom={1}>
      <Text bold color={colors.primary}>Available Services</Text>
    </Box>
  );

  // Featured section
  rows.push(
    <Box key="featured-header" marginBottom={0}>
      <Text bold color={colors.secondary}>Featured:</Text>
    </Box>
  );

  for (const id of servicesData.featured) {
    const svc = serviceMap.get(id);
    if (svc) {
      rows.push(renderServiceRow(svc, flatIndex));
      flatIndex++;
    }
  }

  // Spacer
  rows.push(<Text key="spacer1">{""}</Text>);

  // All Services header
  rows.push(
    <Box key="all-header" marginBottom={0}>
      <Text bold color={colors.secondary}>All Services:</Text>
    </Box>
  );

  rows.push(<Separator key="sep1" />);

  // Categories with services
  for (const cat of servicesData.categories) {
    rows.push(
      <Box key={`cat-${cat.name}`} paddingLeft={2}>
        <Text bold>{cat.name}</Text>
      </Box>
    );

    for (const id of cat.services) {
      const svc = serviceMap.get(id);
      if (svc) {
        rows.push(
          <Box key={`cat-svc-${flatIndex}-${svc.id}`} paddingLeft={2}>
            {renderServiceRow(svc, flatIndex)}
          </Box>
        );
        flatIndex++;
      }
    }
  }

  // Footer
  rows.push(<HelpFooter key="footer" text="Esc back \u00b7 \u2191\u2193 nav \u00b7 Enter open" />);

  return (
    <Box flexDirection="column" paddingX={1}>
      {rows}
    </Box>
  );
}
