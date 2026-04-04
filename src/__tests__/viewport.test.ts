import { describe, it, expect } from "vitest";

describe("Viewport scrolling logic", () => {
  // Simulate viewport calculation
  function calcViewport(totalRows: number, termHeight: number, focusedIndex: number, currentOffset: number) {
    const maxVisible = Math.max(3, termHeight - 2); // 2 reserved
    let offset = currentOffset;

    if (focusedIndex < offset) offset = focusedIndex;
    if (focusedIndex >= offset + maxVisible) offset = focusedIndex - maxVisible + 1;
    offset = Math.max(0, Math.min(offset, Math.max(0, totalRows - maxVisible)));

    return { offset, maxVisible, hasAbove: offset > 0, hasBelow: offset + maxVisible < totalRows };
  }

  it("starts at offset 0", () => {
    const v = calcViewport(40, 24, 0, 0);
    expect(v.offset).toBe(0);
    expect(v.hasAbove).toBe(false);
    expect(v.hasBelow).toBe(true);
  });

  it("scrolls down when focus moves below viewport", () => {
    const v = calcViewport(40, 24, 23, 0);
    expect(v.offset).toBeGreaterThan(0);
    expect(v.hasAbove).toBe(true);
  });

  it("scrolls up when focus moves above viewport", () => {
    const v = calcViewport(40, 24, 5, 20);
    expect(v.offset).toBe(5);
  });

  it("doesn't scroll past end", () => {
    const v = calcViewport(40, 24, 39, 0);
    expect(v.offset).toBeLessThanOrEqual(40 - 22);
  });

  it("handles content shorter than terminal", () => {
    const v = calcViewport(10, 24, 5, 0);
    expect(v.offset).toBe(0);
    expect(v.hasAbove).toBe(false);
    expect(v.hasBelow).toBe(false);
  });

  it("handles tiny terminal", () => {
    const v = calcViewport(40, 5, 20, 0);
    expect(v.maxVisible).toBe(3);
    expect(v.hasBelow).toBe(true);
  });

  it("keeps focus visible after scrolling down then up", () => {
    // Scroll down to row 30
    let v = calcViewport(40, 24, 30, 0);
    // Then scroll back up to row 5
    v = calcViewport(40, 24, 5, v.offset);
    expect(v.offset).toBe(5);
    expect(v.hasAbove).toBe(true);
  });

  it("viewport shows correct number of rows", () => {
    const v = calcViewport(40, 24, 0, 0);
    expect(v.maxVisible).toBe(22); // 24 - 2 reserved
  });
});
