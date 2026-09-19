# Structure

- `client/src/game/types.ts` — shared board, operator, obstacle, action and log types.
- `client/src/game/GameLogic.ts` — plain TypeScript rules: initial state, BFS routes, line of sight, ballistic math, player actions and bot turn.
- `client/src/pages/Home.tsx` — React presentation shell and input orchestration. Renders the 8x8 arena as SVG with vector-only primitives and the tactical HUD.
- `client/src/App.tsx` — single route to the game page.
- `client/src/index.css` — dark military design tokens, responsive layout, action controls and modal styling.

React owns presentation and event timing. `GameLogic` is intentionally independent from React so that movement, shooting and AI can be tested without a rendering dependency.
