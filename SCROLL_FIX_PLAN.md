# ChannelView Scroll Fix Plan

## Root Causes

### 1. DUAL useInput HANDLERS FIGHTING (PRIMARY CAUSE)

**The smoking gun.** `App.tsx` Router (line 153) registers a `useInput` handler that
calls `scrollRef.current.scrollTo()` on Up/Down/PageUp/PageDown for the **global**
ScrollView. This handler has NO guard for `channel-view` -- it fires on every screen.

Meanwhile, `ChannelView.tsx` (line 531) registers its OWN `useInput` handler that
calls `msgScrollRef.current.scrollBy()` on Up/Down/PageUp/PageDown for the
**internal** messages ScrollView.

Both handlers fire on every keypress. The Router handler operates on the global
`scrollRef` which is **not the rendered ScrollView** when on channel-view (channel-view
is rendered outside the global ScrollView at App.tsx line 166-175). So the Router's
handler either:
- No-ops (scrollRef.current is null or points to the unmounted global ScrollView)
- Operates on a stale/wrong ScrollView ref

But crucially, the Router handler **returns nothing and does not `return` early** --
useInput handlers in ink cannot prevent other handlers from firing. The real problem
is that ink's `useInput` calls ALL registered handlers, and the Router's handler
may consume/interfere with the key events or cause unexpected side effects on the
global scrollRef.

**Fix:** In Router's `useInput` (App.tsx line 153), add an early return when
`state.screen.name === "channel-view"`:
```
useInput((_input, key) => {
  if (state.screen.name === "channel-view") return;  // <-- ADD THIS
  ...
});
```

### 2. mergeOlder TRIGGERS ON EVERY UP PRESS AT OFFSET 0

**ChannelView.tsx lines 599-609.** When the user presses Up or PageUp and
`hasMoreOlder` is true, the code checks if scroll offset is <= 0. If the prefetch
buffer has data, it calls `mergeOlder()` and returns.

The problem: after `mergeOlder()` re-anchors the scroll position via
`process.nextTick`, the new offset should be > 0. But `process.nextTick` is
asynchronous -- if the user presses Up again BEFORE the nextTick fires, offset is
still 0, so `mergeOlder()` would fire again. With rapid key repeats, multiple
merges can pile up.

However, the guard `prefetchBuf.current = []` at line 292 prevents re-merging the
same buffer. The real issue is that the `return` at line 608 causes the keypress to
be swallowed -- the `scrollBy(-1)` at line 612 never executes. So each Up press at
offset 0 either triggers a merge OR gets eaten, producing the "skip" feeling.

**Fix:** After `mergeOlder()`, still execute the scroll (don't return early). Or
better: let the re-anchor in mergeOlder handle positioning, and only return early
when a merge actually happened. When the buffer is empty and there's no more history,
fall through to the normal scroll handler.

### 3. mergeOlder RE-ANCHOR TIMING (process.nextTick)

**ChannelView.tsx lines 295-300.** After prepending older messages, the code uses
`process.nextTick` to read `getBottomOffset()` and compute the delta. The assumption
is that by nextTick, ink will have re-measured the new children.

This is fragile. ink's layout runs in React's commit phase, which may not have
completed by the next microtask (nextTick). If the ScrollView hasn't re-measured,
`newBottom` equals `prevBottom`, delta is 0, and the scroll stays at `prevOffset`
(which is 0 or near-0) -- the viewport doesn't anchor and the user "jumps" to the
top of the newly prepended messages.

**Fix:** Use `setTimeout(..., 0)` (macrotask) instead of `process.nextTick`
(microtask) for more reliable timing, consistent with the pattern already used
elsewhere in this file (lines 323, 333). Or better: use ink-scroll-view's
`onContentHeightChange` callback to detect when content has been re-measured, and
re-anchor inside that callback.

### 4. STALE CLOSURE IN mergeOlder

**ChannelView.tsx line 303.** `const allMsgs = state.channelView.messages` reads
from the closure's captured `state`, not the state after `dispatch()` on line 290.
React dispatch is async -- `state.channelView.messages` still has the OLD messages
at this point. This means the cursor for the next prefetch page may be wrong
(though it works around this by using `buf` directly on line 306).

This is a minor issue since the code does use `buf` for the cursor, but the dead
read of `allMsgs` is confusing and should be removed.

### 5. scrollHeight CALCULATION MAY BE INACCURATE

**ChannelView.tsx line 934.** The magic number `3 + 3 + 1 + 5` (= 12) for
`chromeLines` is a hand-counted estimate of the non-scrollable UI elements. If this
is wrong (e.g., the header card renders as 4 lines not 3, or the input box renders
as 4 lines not 3), the ScrollView gets a `height` that doesn't match the actual
available space. This causes ink-scroll-view to compute `bottomOffset` incorrectly,
making the viewport too small or too large.

When `scrollHeight` is too small, content that should be visible is clipped, and
scrolling "skips" over it because each scroll step moves past more content than is
visible.

**Fix:** Audit the actual rendered heights of each chrome element and correct the
magic numbers. Consider using ink's `measureElement` to compute this dynamically
instead of hardcoding.

---

## Dead Code / Cleanup

1. **App.tsx line 110:** `lastMessageId` is computed and used in the `useEffect` at
   line 111 to auto-scroll to bottom on new messages. But ChannelView has its OWN
   auto-scroll-to-bottom logic (lines 317-342). The App.tsx effect scrolls the
   **global** ScrollView (which isn't even rendered for channel-view). This is dead
   code for channel-view and potentially harmful -- remove the channel-view branch
   from this effect entirely.

2. **App.tsx lines 131-150:** The mouse wheel handler in Router also fires for
   channel-view (no guard). ChannelView has its own mouse handler (lines 367-391).
   Both will fire. Add an `if (hasTextInput || isChannelView) return;` guard, or
   restructure.

3. **ChannelView.tsx line 303:** `const allMsgs = state.channelView.messages` is
   read but effectively unused (the code uses `buf` instead). Remove it.

4. **ChannelView.tsx line 476:** Duplicate eslint-disable comment.

---

## Fix Plan Summary

| Priority | File | Line(s) | What to do |
|----------|------|---------|------------|
| P0 | App.tsx | 153 | Guard Router's `useInput` to skip channel-view |
| P0 | App.tsx | 108-122 | Guard the auto-scroll-to-bottom `useEffect` to skip channel-view (or remove the channel-view branch entirely -- it scrolls a ref that isn't rendered) |
| P0 | App.tsx | 131-150 | Guard Router's mouse wheel handler to skip channel-view |
| P1 | ChannelView.tsx | 599-609 | Don't `return` early after mergeOlder -- let the scroll handler also execute, or ensure the re-anchor positions correctly |
| P1 | ChannelView.tsx | 295 | Replace `process.nextTick` with `setTimeout(..., 0)` or use `onContentHeightChange` callback for reliable re-anchoring |
| P2 | ChannelView.tsx | 934 | Audit chromeLines magic number against actual rendered heights |
| P3 | ChannelView.tsx | 303 | Remove stale `allMsgs` read |
| P3 | ChannelView.tsx | 476 | Remove duplicate eslint-disable comment |

### Recommended implementation order

1. **P0 fixes first** -- add the three guards in App.tsx. This alone will likely
   fix the "skipping" symptom because the dual handlers are fighting.
2. **P1 fixes** -- improve mergeOlder to not swallow keypresses and to re-anchor
   reliably.
3. **P2/P3** -- cleanup pass.
