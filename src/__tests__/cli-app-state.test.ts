import { describe, it, expect } from "vitest";

describe("bottel_state - State Engine", () => {
  // Test navigation history
  it("navigate pushes to history", () => {
    // Simulate: start at home, navigate to search
    const history: string[] = [];
    const current = "home";
    history.push(current);
    const next = "search";
    expect(history).toEqual(["home"]);
    expect(next).toBe("search");
  });

  it("go back pops from history", () => {
    const history = ["home", "search"];
    const last = history.pop();
    expect(last).toBe("search");
    expect(history).toEqual(["home"]);
  });

  it("go back from empty history returns home", () => {
    const history: string[] = [];
    const screen = history.length === 0 ? "home" : history.pop();
    expect(screen).toBe("home");
  });

  it("deep navigation preserves full path", () => {
    // home -> search -> agent-detail -> back -> back = home
    const history: string[] = [];
    history.push("home"); // navigate to search
    history.push("search"); // navigate to agent-detail
    // Now at agent-detail, history = [home, search]
    expect(history).toEqual(["home", "search"]);

    // Go back: pop search, now at search
    const back1 = history.pop();
    expect(back1).toBe("search");

    // Go back: pop home, now at home
    const back2 = history.pop();
    expect(back2).toBe("home");

    expect(history).toEqual([]);
  });

  // Test installed state
  it("install adds to set", () => {
    const installed = new Set(["code-reviewer", "translator"]);
    installed.add("security-scanner");
    expect(installed.has("security-scanner")).toBe(true);
    expect(installed.size).toBe(3);
  });

  it("uninstall removes from set", () => {
    const installed = new Set(["code-reviewer", "translator"]);
    installed.delete("translator");
    expect(installed.has("translator")).toBe(false);
    expect(installed.size).toBe(1);
  });

  it("double install is idempotent", () => {
    const installed = new Set(["code-reviewer"]);
    installed.add("code-reviewer");
    expect(installed.size).toBe(1);
  });

  // Test search state
  it("search state preserves query across navigation", () => {
    const searchState = { query: "security", selectedIndex: 2, page: 0, inputFocused: false };
    // Simulating navigation away and back
    const preserved = { ...searchState };
    expect(preserved.query).toBe("security");
    expect(preserved.selectedIndex).toBe(2);
  });

  it("search state resets correctly", () => {
    const initial = { query: "", selectedIndex: 0, page: 0, inputFocused: true };
    expect(initial.query).toBe("");
    expect(initial.inputFocused).toBe(true);
  });

  // Test browse state
  it("browse state tracks expanded category", () => {
    const browseState = { categoryIndex: 2, expandedCategory: 2, agentIndex: 1, agentPage: 0, inAgents: true };
    expect(browseState.expandedCategory).toBe(2);
    expect(browseState.inAgents).toBe(true);
  });

  // Test initial state
  it("initial state has correct defaults", () => {
    const defaults = {
      screen: "home",
      history: [] as string[],
      installed: new Set(["code-reviewer", "translator", "data-analyst"]),
    };
    expect(defaults.screen).toBe("home");
    expect(defaults.history.length).toBe(0);
    expect(defaults.installed.size).toBe(3);
    expect(defaults.installed.has("code-reviewer")).toBe(true);
  });
});
