# Memory

- Direction: premium tactical command console, charcoal/olive floor, cyan player accent, signal-red enemy accent, amber wood and rust-metal cover.
- Runtime intentionally uses no external image or font asset. The generated reference image is guidance only; the shipped arena is SVG/CSS.
- Grid projection uses `cx = originX + (x-y)*halfW`, `cy = originY + (x+y)*halfH` with a 390px-friendly viewBox.
- Enemy actions run in a single `setTimeout` callback after the player presses END TURN. The UI shows a processing state to prevent double submissions.
