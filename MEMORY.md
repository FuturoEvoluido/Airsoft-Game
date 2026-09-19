# Memory

- The visual arena was refactored from inline SVG primitives to a single responsive HTML5 Canvas while preserving the original isometric projection constants and logical cell coordinates.
- Pointer hit-testing uses the inverse projection from canvas-local pixels to grid coordinates, scaled through the element bounding rectangle for mobile responsiveness.
- Neutral mode deliberately suppresses grid lines. MOVER must be armed before reachable-cell overlays appear; hover/touch destination receives an amber tactical outline.
- Procedural drawings are intentionally self-contained: concrete floor, tactical tape, timber half cover, industrial full-cover drums, operators, line-of-sight badge and tracer effects.
- `GameLogic.ts` remains untouched by the visual refactor.
