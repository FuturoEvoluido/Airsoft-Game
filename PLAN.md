# Game Plan: Airsoft Tactical Arena

## Visual refactor

The arena renderer is now a responsive HTML5 Canvas. The isometric projection remains the same (`toScreen` / `fromScreen` use the original 8x8 geometry), while pointer events map through the canvas bounding rectangle back into the same logical cells. No image assets or network requests are used.

The neutral state renders a dark industrial concrete floor, warehouse seams, light wear marks and black/amber tactical edge tape. Isometric grid guidance appears only when the player arms MOVER, where reachable cells are softly olive/amber highlighted and the hovered destination receives a reticle outline.

Obstacles are procedural 2.5D drawings: layered timber barricades with visible slats and brackets, and oxidized industrial drums with cylindrical gradients, raised rings, warning bands and ground shadows. Operators are vector silhouettes with helmet, eye protection, vest, team base indicator and directional M4-like replica.

## Verification criteria

- Canvas hit-testing remains aligned with the existing logical grid at mobile viewport sizes.
- Movement is only accepted from the armed MOVER mode and still consumes the same PA.
- Aim, semi and burst retain their existing actions and ballistic math.
- Firing shows a dashed trajectory, chance badge and a short white BB tracer animation.
- HIT still opens the existing end-of-combat modal.
- No external image requests are introduced.
