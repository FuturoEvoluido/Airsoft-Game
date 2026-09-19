# Game Plan: Airsoft Tactical Arena

## Risk Tasks

### 1. Procedural isometric arena
- **Why isolated:** A compact 8x8 diamond grid must remain legible at 390x844 while communicating depth, cover and valid movement targets.
- **Approach:** Use one deterministic SVG viewBox with affine isometric projection, explicit cell geometry, and vector-only obstacle/operator primitives. Keep all hit-testing in logical grid coordinates.
- **Verify:** Every cell is tappable, selected cells and route previews line up with diamonds, obstacles preserve their 2.5D footprint, and the arena does not overflow the mobile viewport.

### 2. Turn loop and short-path movement
- **Why isolated:** Movement, action points, line of sight and the enemy response must share one state transition without double turns or stale state.
- **Approach:** Keep game rules in a framework-agnostic `GameLogic` module. Use BFS for shortest paths through 8x8 blocked cells, immutable state transitions, and a single delayed enemy phase from React.
- **Verify:** Clicking a reachable cell consumes exactly one PA per step, blocked cells are never entered, ending the turn triggers exactly one bot response, and the UI remains interactive after the response.

## Main Build

- **Assets needed:** No runtime image assets. Use SVG/CSS primitives for the CQB floor, wood barricades, metal drums, operators and HUD. A generated reference image is kept outside the project only to anchor art direction.
- **Verify:**
  - Mobile-first dark military interface is readable at 390x844.
  - Player and enemy operators are visually distinct and always show their current tile.
  - Cover types are visually distinct and map to -40% / -70% accuracy penalties.
  - Aim, semi and burst actions spend 1/2/3 PA and display the ballistic calculation.
  - A successful BB immediately ends combat with a HIT modal; no HP bar is used.
  - The bot prioritizes a cover-adjacent step when available and shoots only when it has line of sight.
  - Restart resets the board instantly and win/loss counters persist for the session.
  - No browser console errors during the capture and no external images are requested.
  - `?demo` exposes a deterministic scripted interaction path for visual verification.
  - `pnpm check` passes.
