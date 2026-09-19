import { useEffect, useRef } from "react";
import { findPath, obstacleAt, OBSTACLES } from "../game/GameLogic";
import type { Coord, GameState, WeaponId } from "../game/types";

const VIEW_W = 390;
const VIEW_H = 330;
const ORIGIN_X = 195;
const ORIGIN_Y = 32;
const HALF_W = 21;
const HALF_H = 12;

const toScreen = (point: Coord) => ({
  x: ORIGIN_X + (point.x - point.y) * HALF_W,
  y: ORIGIN_Y + (point.x + point.y) * HALF_H,
});

const fromScreen = (x: number, y: number): Coord => {
  const dx = (x - ORIGIN_X) / HALF_W;
  const dy = (y - ORIGIN_Y) / HALF_H;
  return { x: Math.round((dx + dy) / 2), y: Math.round((dy - dx) / 2) };
};

const diamond = (point: Coord, extra = 0) => {
  const center = toScreen(point);
  return [
    [center.x, center.y - HALF_H - extra],
    [center.x + HALF_W + extra, center.y],
    [center.x, center.y + HALF_H + extra],
    [center.x - HALF_W - extra, center.y],
  ] as [number, number][];
};

const pathPolygon = (ctx: CanvasRenderingContext2D, points: [number, number][]) => {
  ctx.beginPath();
  points.forEach(([x, y], index) => index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.closePath();
};

const samePoint = (a: Coord | null, b: Coord | null) => Boolean(a && b && a.x === b.x && a.y === b.y);

interface ArenaCanvasProps {
  state: GameState;
  mode: "move" | "aim" | "semi" | "burst";
  moveArmed: boolean;
  hovered: Coord | null;
  shotPulse: number;
  onCellClick: (point: Coord) => void;
  onCellHover: (point: Coord | null) => void;
}

export default function ArenaCanvas({ state, mode, moveArmed, hovered, shotPulse, onCellClick, onCellHover }: ArenaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ state, mode, moveArmed, hovered, shotPulse });
  propsRef.current = { state, mode, moveArmed, hovered, shotPulse };

  const draw = (fxProgress = 0) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const { state: current, mode: currentMode, moveArmed: currentMoveArmed, hovered: currentHovered } = propsRef.current;
    const dpr = window.devicePixelRatio || 1;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, VIEW_W, VIEW_H);

    const background = context.createLinearGradient(0, 0, 0, VIEW_H);
    background.addColorStop(0, "#26302e");
    background.addColorStop(0.55, "#151d1c");
    background.addColorStop(1, "#0b1110");
    context.fillStyle = background;
    context.fillRect(0, 0, VIEW_W, VIEW_H);

    // Concrete floor: subtle stains and warehouse seams, not a bright board grid.
    context.save();
    context.globalAlpha = 0.2;
    context.strokeStyle = "#87928a";
    context.lineWidth = 0.45;
    for (let y = 24; y < 310; y += 23) {
      context.beginPath();
      context.moveTo(18, y + (y % 3));
      context.lineTo(370, y - 8);
      context.stroke();
    }
    context.globalAlpha = 0.14;
    context.fillStyle = "#b0b5a3";
    for (let index = 0; index < 34; index += 1) context.fillRect((index * 71) % 380, 20 + ((index * 37) % 275), 1.3, 1.3);
    context.restore();

    const floor = [[195, 20], [342, 116], [195, 212], [48, 116]] as [number, number][];
    pathPolygon(context, floor);
    context.fillStyle = "rgba(8, 13, 13, .48)";
    context.fill();
    context.strokeStyle = "#667269";
    context.lineWidth = 1;
    context.stroke();

    // Yellow/black tactical edge tape.
    context.save();
    context.setLineDash([8, 5]);
    context.lineWidth = 3;
    context.strokeStyle = "rgba(189, 150, 65, .62)";
    pathPolygon(context, [[195, 20], [342, 116], [195, 212], [48, 116]]);
    context.stroke();
    context.setLineDash([8, 5]);
    context.lineWidth = 1;
    context.strokeStyle = "rgba(22, 25, 22, .95)";
    pathPolygon(context, [[195, 20], [342, 116], [195, 212], [48, 116]]);
    context.stroke();
    context.restore();

    const gridActive = currentMode === "move" && currentMoveArmed;
    if (gridActive) {
      for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) {
        const point = { x, y };
        const route = findPath({ x: current.player.x, y: current.player.y }, point, current);
        const inRange = route.length > 0 && route.length <= current.pa;
        const isHovered = samePoint(currentHovered, point);
        const isSelected = samePoint(current.selectedCell, point);
        if (inRange || isHovered || isSelected) {
          pathPolygon(context, diamond(point, isHovered ? 1.5 : 0));
          context.fillStyle = isHovered ? "rgba(207, 167, 72, .2)" : "rgba(96, 123, 70, .15)";
          context.fill();
          context.strokeStyle = isHovered ? "#d4b15f" : "rgba(117, 153, 96, .55)";
          context.lineWidth = isHovered ? 1.4 : 0.7;
          context.stroke();
        }
      }
    }

    const from = { x: current.player.x, y: current.player.y };
    const to = { x: current.enemy.x, y: current.enemy.y };
    if (currentMode === "semi" || currentMode === "burst" || current.lastShot) {
      const start = toScreen(from);
      const end = toScreen(to);
      context.save();
      context.setLineDash([4, 4]);
      context.strokeStyle = current.lastShot?.pathBlocked ? "rgba(239, 92, 103, .62)" : "rgba(101, 218, 196, .72)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(start.x, start.y - 4);
      context.lineTo(end.x, end.y - 8);
      context.stroke();
      context.restore();
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2 - 13;
      context.fillStyle = "rgba(9, 17, 15, .94)";
      context.fillRect(midX - 42, midY - 8, 84, 15);
      context.strokeStyle = "rgba(205, 173, 86, .72)";
      context.strokeRect(midX - 42, midY - 8, 84, 15);
      context.fillStyle = "#d8bf78";
      context.font = "700 6px Arial";
      context.textAlign = "center";
      context.fillText(`CHANCE: ${current.lastShot?.chance ?? 68}%`, midX, midY + 1);
    }

    OBSTACLES.forEach((obstacle) => {
      const center = toScreen({ x: obstacle.x, y: obstacle.y });
      context.save();
      context.fillStyle = "rgba(0, 0, 0, .45)";
      context.beginPath();
      context.ellipse(center.x + 4, center.y + 8, obstacle.type === "full" ? 17 : 19, 5, 0, 0, Math.PI * 2);
      context.fill();
      if (obstacle.type === "half") drawBarricade(context, center.x, center.y);
      else drawDrum(context, center.x, center.y);
      context.restore();
    });

    drawOperator(context, toScreen({ x: current.player.x, y: current.player.y }), "player", toScreen(to), current.player.name, current.loadout.uniform, current.loadout.weapon);
    drawOperator(context, toScreen({ x: current.enemy.x, y: current.enemy.y }), "enemy", toScreen(from), current.enemyLoadout.operatorName, current.enemyLoadout.uniform, current.enemyLoadout.weapon);

    if (fxProgress > 0 && current.lastShot) {
      const start = toScreen(from);
      const end = toScreen(to);
      const x = start.x + (end.x - start.x) * fxProgress;
      const y = start.y - 5 + (end.y - 8 - (start.y - 5)) * fxProgress;
      context.save();
      context.strokeStyle = "rgba(255, 255, 230, .85)";
      context.shadowColor = "#f7f0bf";
      context.shadowBlur = 8;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x - (end.x - start.x) * .08, y - (end.y - start.y) * .08);
      context.lineTo(x, y);
      context.stroke();
      context.restore();
    }

    context.fillStyle = "rgba(187, 199, 183, .42)";
    context.font = "700 6px Arial";
    context.textAlign = "center";
    context.fillText("N", 350, 58);
    context.fillStyle = "#78d7c4";
    context.beginPath();
    context.moveTo(350, 38);
    context.lineTo(355, 48);
    context.lineTo(350, 45);
    context.lineTo(345, 48);
    context.closePath();
    context.fill();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = VIEW_W * dpr;
    canvas.height = VIEW_H * dpr;
    draw(0);
  });

  useEffect(() => {
    if (!shotPulse) return;
    const started = performance.now();
    let frame = 0;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - started) / 420);
      draw(progress);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [shotPulse]);

  const eventToGrid = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    const y = ((event.clientY - rect.top) / rect.height) * VIEW_H;
    const point = fromScreen(x, y);
    return point.x >= 0 && point.x < 8 && point.y >= 0 && point.y < 8 ? point : null;
  };

  return <canvas ref={canvasRef} className="arena-canvas" width={VIEW_W} height={VIEW_H} onPointerMove={(event) => onCellHover(eventToGrid(event))} onPointerLeave={() => onCellHover(null)} onPointerDown={(event) => { const point = eventToGrid(event); if (point) onCellClick(point); }} aria-label="Arena isométrica de combate CQB" />;
}

function drawBarricade(context: CanvasRenderingContext2D, x: number, y: number) {
  context.fillStyle = "#5f3926";
  context.strokeStyle = "#261a14";
  context.lineWidth = 1.2;
  pathPolygon(context, [[x - 15, y + 5], [x - 11, y - 11], [x + 12, y - 11], [x + 16, y + 5]]);
  context.fill();
  context.stroke();
  pathPolygon(context, [[x - 11, y - 11], [x - 5, y - 16], [x + 18, y - 16], [x + 12, y - 11]]);
  context.fillStyle = "#9b6038";
  context.fill();
  context.stroke();
  for (let index = 0; index < 3; index += 1) {
    context.strokeStyle = index === 1 ? "#d38a4b" : "#7e482b";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x - 9 + index * 8, y - 9);
    context.lineTo(x - 11 + index * 9, y + 4);
    context.stroke();
  }
  context.fillStyle = "#d7a25d";
  context.fillRect(x - 12, y - 10, 3, 2);
  context.fillRect(x + 9, y - 10, 3, 2);
  context.font = "700 5px Arial";
  context.textAlign = "center";
  context.fillStyle = "rgba(224, 166, 92, .78)";
  context.fillText("HALF • 40%", x, y + 20);
}

function drawDrum(context: CanvasRenderingContext2D, x: number, y: number) {
  const body = context.createLinearGradient(x - 12, 0, x + 12, 0);
  body.addColorStop(0, "#182b2b");
  body.addColorStop(.5, "#42615a");
  body.addColorStop(1, "#172421");
  context.fillStyle = body;
  context.strokeStyle = "#101917";
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(x - 12, y - 9);
  context.lineTo(x - 11, y + 7);
  context.quadraticCurveTo(x, y + 13, x + 11, y + 7);
  context.lineTo(x + 12, y - 9);
  context.closePath();
  context.fill();
  context.stroke();
  context.fillStyle = "#314d48";
  context.beginPath();
  context.ellipse(x, y - 9, 12, 5, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.strokeStyle = "#b27643";
  context.lineWidth = 1.6;
  for (const offset of [-5, 3]) {
    context.beginPath();
    context.ellipse(x, y + offset, 11.2, 4.3, 0, 0, Math.PI * 2);
    context.stroke();
  }
  context.fillStyle = "#d19d52";
  context.beginPath();
  context.moveTo(x, y - 5);
  context.lineTo(x - 4, y + 2);
  context.lineTo(x + 4, y + 2);
  context.closePath();
  context.fill();
  context.fillStyle = "#1d2723";
  context.font = "700 5px Arial";
  context.textAlign = "center";
  context.fillText("!", x, y + 1);
  context.fillStyle = "rgba(208, 165, 91, .82)";
  context.fillText("FULL • 70%", x, y + 23);
}

function drawOperator(context: CanvasRenderingContext2D, center: { x: number; y: number }, kind: "player" | "enemy", target: { x: number; y: number }, name: string, uniform: "multicam" | "all-black" | "woodland", weapon: WeaponId) {
  const isPlayer = kind === "player";
  const accent = isPlayer ? "#55d7c4" : "#ef5c67";
  const uniformFill = uniform === "all-black" ? "#1a2222" : uniform === "woodland" ? "#3f513a" : "#52624a";
  const dark = isPlayer ? uniformFill : "#4c242d";
  const angle = Math.atan2(target.y - center.y, target.x - center.x);
  context.save();
  context.fillStyle = `${accent}22`;
  context.strokeStyle = accent;
  context.lineWidth = 1;
  context.beginPath();
  context.ellipse(center.x, center.y + 8, 13, 5, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = "rgba(0, 0, 0, .52)";
  context.beginPath();
  context.ellipse(center.x + 2, center.y + 8, 10, 3, 0, 0, Math.PI * 2);
  context.fill();
  pathPolygon(context, [[center.x - 9, center.y + 6], [center.x - 7, center.y - 5], [center.x, center.y - 9], [center.x + 7, center.y - 5], [center.x + 9, center.y + 6]]);
  context.fillStyle = dark;
  context.fill();
  context.strokeStyle = accent;
  context.stroke();
  context.fillStyle = "#101817";
  context.beginPath();
  context.arc(center.x, center.y - 13, 6.5, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = accent;
  context.stroke();
  context.fillStyle = isPlayer ? "#77a888" : "#303b3a";
  context.beginPath();
  context.ellipse(center.x, center.y - 16, 8, 4, 0, Math.PI, Math.PI * 2);
  context.fill();
  context.fillStyle = "rgba(202, 226, 216, .8)";
  context.fillRect(center.x - 4, center.y - 14, 8, 2);
  context.save();
  context.translate(center.x, center.y - 2);
  context.rotate(angle);
  context.fillStyle = weapon === "sniper" ? "#172221" : weapon === "smg" ? "#25312e" : "#222d2a";
  context.fillRect(4, -2, weapon === "sniper" ? 23 : weapon === "smg" ? 12 : 15, 3);
  if (weapon === "sniper") { context.fillStyle = "#607b70"; context.fillRect(12, -5, 7, 2); context.fillStyle = "#172221"; context.fillRect(25, -1, 5, 1.5); }
  if (weapon === "smg") { context.fillStyle = "#4d7564"; context.fillRect(9, 1, 3, 6); }
  context.fillStyle = accent;
  context.fillRect(16, -1, 8, 1.2);
  context.restore();
  context.fillStyle = accent;
  context.beginPath();
  context.arc(center.x, center.y - 27, 2.4, 0, Math.PI * 2);
  context.fill();
  context.font = "700 5px Arial";
  context.textAlign = "center";
  context.fillText(name.slice(0, 10).toUpperCase(), center.x, center.y - 31);
  context.restore();
}
