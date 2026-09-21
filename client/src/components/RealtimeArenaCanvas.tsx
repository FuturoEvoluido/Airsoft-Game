import { useEffect, useRef, useState } from "react";
import type { Loadout, RivalProfile, UniformId, WeaponId } from "../game/types";
import { tacticalAudio } from "../lib/tacticalAudio";

export interface RealtimeResult { victory: boolean; shots: number; hits: number; seconds: number; rounds: number; }
interface Props { loadout: Loadout; rival: RivalProfile; onFinish: (result: RealtimeResult) => void; onExit: () => void; }
type Vec = { x: number; y: number };
type Bullet = { id: number; position: Vec; velocity: Vec; team: "player" | "enemy"; damage: number; ttl: number; sourceId: string; };
type Enemy = {
  id: string;
  position: Vec;
  aim: Vec;
  patrol: Vec[];
  patrolIndex: number;
  alerted: boolean;
  cooldown: number;
  uniform: UniformId;
  weapon: WeaponId;
  name: string;
  hp: number;
  maxHp: number;
};
type Runtime = {
  player: Vec;
  aim: Vec;
  joystick: Vec;
  bullets: Bullet[];
  enemies: Enemy[];
  hp: number;
  maxHp: number;
  shots: number;
  hits: number;
  started: number;
  running: boolean;
  nextBulletId: number;
};

const LOGICAL_WIDTH = 1200;
const LOGICAL_HEIGHT = 800;
const WORLD = { w: LOGICAL_WIDTH, h: LOGICAL_HEIGHT };
const VISION_RADIUS = 360;
const NEAR_VISION_RADIUS = 100;
const HEARING_RADIUS = 300;
const FLASHLIGHT_SPREAD = 0.58; // ~66 degrees wide cone
const ENEMY_ALERT_RADIUS = 480;
const ENEMY_SIGHT_RADIUS = 580;
const PLAYER_R = 17;

const obstacles = [
  { x: 160, y: 128, w: 335, h: 41, kind: "concrete", label: "CONCRETE" },
  { x: 613, y: 105, w: 50, h: 287, kind: "concrete", label: "WALL" },
  { x: 831, y: 160, w: 365, h: 44, kind: "wood", label: "WOOD" },
  { x: 992, y: 298, w: 50, h: 261, kind: "concrete", label: "WALL" },
  { x: 263, y: 494, w: 306, h: 44, kind: "wood", label: "WOOD" },
  { x: 692, y: 624, w: 422, h: 49, kind: "concrete", label: "CONCRETE" },
  { x: 109, y: 684, w: 50, h: 138, kind: "concrete", label: "WALL" },
];

// Spawns configured so Hostile 1 is in direct tactical engagement distance down the hallway
const enemySpawn: Vec[] = [
  { x: 520, y: 390 }, // In central corridor, directly in front of player
  { x: 780, y: 260 }, // Upper corridor
  { x: 800, y: 560 }, // Lower storage
  { x: 1060, y: 400 }, // Far extraction zone
];

const patrolRoutes: Vec[][] = [
  [{ x: 520, y: 390 }, { x: 520, y: 460 }, { x: 450, y: 390 }, { x: 520, y: 320 }],
  [{ x: 780, y: 260 }, { x: 920, y: 220 }, { x: 920, y: 300 }, { x: 780, y: 300 }],
  [{ x: 800, y: 560 }, { x: 640, y: 560 }, { x: 640, y: 460 }, { x: 800, y: 460 }],
  [{ x: 1060, y: 400 }, { x: 1140, y: 460 }, { x: 1140, y: 280 }, { x: 1060, y: 320 }],
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const normalize = (vector: Vec): Vec => { const length = Math.hypot(vector.x, vector.y) || 1; return { x: vector.x / length, y: vector.y / length }; };
const circleHitsRect = (p: Vec, r: number, box: typeof obstacles[number]) => { const x = clamp(p.x, box.x, box.x + box.w); const y = clamp(p.y, box.y, box.y + box.h); return Math.hypot(p.x - x, p.y - y) < r; };
const blocked = (p: Vec, radius = PLAYER_R) => p.x < radius || p.y < radius || p.x > WORLD.w - radius || p.y > WORLD.h - radius || obstacles.some((box) => circleHitsRect(p, radius, box));
const moveWithCollision = (from: Vec, delta: Vec, radius = PLAYER_R) => { const xTry = { x: from.x + delta.x, y: from.y }; const yTry = { x: from.x, y: from.y + delta.y }; const both = { x: from.x + delta.x, y: from.y + delta.y }; if (!blocked(both, radius)) return both; if (!blocked(xTry, radius)) return xTry; if (!blocked(yTry, radius)) return yTry; return from; };
const uniformColor = (uniform: UniformId) => uniform === "all-black" ? "#1b2927" : uniform === "woodland" ? "#4a6344" : "#6f8059";

// Robust raycast that ignores shooter and target self-collision
const hasLineOfSight = (from: Vec, to: Vec) => {
  const delta = { x: to.x - from.x, y: to.y - from.y };
  const dist = Math.hypot(delta.x, delta.y);
  if (dist <= PLAYER_R * 2) return true;
  const startDist = PLAYER_R + 4;
  const endDist = Math.max(startDist, dist - (PLAYER_R + 4));
  if (startDist >= endDist) return true;
  const steps = Math.max(2, Math.ceil((endDist - startDist) / 12));
  for (let i = 0; i <= steps; i += 1) {
    const progress = (startDist + (endDist - startDist) * (i / steps)) / dist;
    const point = { x: from.x + delta.x * progress, y: from.y + delta.y * progress };
    if (obstacles.some((box) => circleHitsRect(point, 3, box))) return false;
  }
  return true;
};

export default function RealtimeArenaCanvas({ loadout, rival, onFinish, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<Runtime>({
    player: { x: 220, y: 390 },
    aim: { x: 1, y: 0 },
    joystick: { x: 0, y: 0 },
    bullets: [],
    enemies: enemySpawn.map((position, index) => ({
      id: `hostile-${index + 1}`,
      position,
      aim: { x: -1, y: 0 },
      patrol: patrolRoutes[index],
      patrolIndex: 0,
      alerted: false,
      cooldown: 1.2 + index * 0.25,
      uniform: index === 1 ? "all-black" : index === 2 ? "woodland" : rival.uniform,
      weapon: index === 1 ? "smg" : index === 2 ? "sniper" : rival.weapon,
      name: index === 0 ? rival.operatorName : `${rival.teamName}-${String(index + 1).padStart(2, "0")}`,
      hp: 100,
      maxHp: 100,
    })),
    hp: 100,
    maxHp: 100,
    shots: 0,
    hits: 0,
    started: performance.now(),
    running: true,
    nextBulletId: 1,
  });

  const [joystickActive, setJoystickActive] = useState(false);
  const [fireReady, setFireReady] = useState(true);
  const [hp, setHp] = useState(100);
  const [shotCount, setShotCount] = useState(0);
  const [hostileCount, setHostileCount] = useState(4);
  const joystickPointer = useRef<number | null>(null);

  const getViewportTransform = (viewW: number, viewH: number, player: Vec = runtime.current.player) => {
    const scale = Math.max(viewW / LOGICAL_WIDTH, viewH / LOGICAL_HEIGHT);
    const scaledW = LOGICAL_WIDTH * scale;
    const scaledH = LOGICAL_HEIGHT * scale;
    const targetOffsetX = viewW / 2 - player.x * scale;
    const targetOffsetY = viewH / 2 - player.y * scale;
    const offsetX = clamp(targetOffsetX, viewW - scaledW, 0);
    const offsetY = clamp(targetOffsetY, viewH - scaledH, 0);
    return { scale, offsetX, offsetY };
  };

  const applyCamera = (ctx: CanvasRenderingContext2D, viewW: number, viewH: number) => {
    const { scale, offsetX, offsetY } = getViewportTransform(viewW, viewH, runtime.current.player);
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
  };

  // Bullet Echo Overhead Health Bar and Operator Rendering
  const drawOperator = (
    ctx: CanvasRenderingContext2D,
    position: Vec,
    actor: "player" | "enemy",
    uniform: UniformId,
    weapon: WeaponId,
    aim: Vec,
    name: string,
    currentHp: number,
    maxHp = 100
  ) => {
    const isPlayer = actor === "player";
    const accent = isPlayer ? "#59ddc7" : "#ef4444";
    const angle = Math.atan2(aim.y, aim.x);

    ctx.save();
    ctx.translate(position.x, position.y);

    // Operator Base Shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.beginPath();
    ctx.ellipse(0, 6, 22, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rotated Character Body
    ctx.save();
    ctx.rotate(angle);

    // Tactical circle aura (Bullet Echo outline)
    ctx.strokeStyle = isPlayer ? "rgba(89, 221, 199, 0.6)" : "rgba(239, 68, 68, 0.6)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.stroke();

    // Shoulders & Torso
    ctx.fillStyle = uniformColor(uniform);
    ctx.beginPath();
    ctx.ellipse(0, 2, 17, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tactical Vest
    ctx.fillStyle = isPlayer ? "#1d2e2b" : "#321d20";
    ctx.fillRect(-8, -4, 16, 12);

    // Helmet / Head
    ctx.fillStyle = "#121b1a";
    ctx.beginPath();
    ctx.arc(0, -5, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Weapon Barrel & Stock
    const barrel = weapon === "sniper" ? 44 : weapon === "smg" ? 26 : 34;
    ctx.fillStyle = "#182422";
    ctx.fillRect(8, -2.5, barrel, 5);
    ctx.fillStyle = accent;
    ctx.fillRect(14, -1.5, 12, 3);
    if (weapon === "sniper") {
      ctx.fillStyle = "#708c7e";
      ctx.fillRect(20, -7, 14, 3);
    } else if (weapon === "smg") {
      ctx.fillStyle = "#486657";
      ctx.fillRect(13, 2.5, 4, 8);
    }
    ctx.restore();

    // Bullet Echo Overhead Name and Health Bar (Non-rotated, always horizontal)
    const barW = 46;
    const barH = 5;
    const barY = -30;

    // Name Tag
    ctx.font = "900 10px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    ctx.fillText(name.slice(0, 14), 1, barY - 7);
    ctx.fillStyle = isPlayer ? "#7eead7" : "#ff8e8e";
    ctx.fillText(name.slice(0, 14), 0, barY - 8);

    // Health Bar Container
    ctx.fillStyle = "rgba(10, 20, 18, 0.85)";
    ctx.fillRect(-barW / 2 - 1, barY - 1, barW + 2, barH + 2);
    ctx.strokeStyle = "rgba(91, 214, 195, 0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-barW / 2 - 1, barY - 1, barW + 2, barH + 2);

    // Health Fill
    const hpRatio = clamp(currentHp / maxHp, 0, 1);
    ctx.fillStyle = isPlayer ? (hpRatio > 0.35 ? "#34d399" : "#f87171") : "#f87171";
    ctx.fillRect(-barW / 2, barY, barW * hpRatio, barH);

    // HP Value Number (Bullet Echo style: "NICOLAIDIS 59")
    ctx.font = "800 8px Inter, Arial, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "right";
    ctx.fillText(String(Math.ceil(currentHp)), barW / 2 + 18, barY + barH);

    ctx.restore();
  };

  // Vision cone path (Flashlight sector + ambient near vision circle)
  const visionPath = (s: Runtime) => {
    const path = new Path2D();
    const origin = s.player;
    const radius = VISION_RADIUS;
    const spread = FLASHLIGHT_SPREAD;
    const rays = 64;
    path.moveTo(origin.x, origin.y);
    for (let i = 0; i <= rays; i += 1) {
      const angle = Math.atan2(s.aim.y, s.aim.x) - spread + (spread * 2 * i / rays);
      const direction = { x: Math.cos(angle), y: Math.sin(angle) };
      let length = radius;
      for (let step = 16; step <= radius; step += 14) {
        const point = { x: origin.x + direction.x * step, y: origin.y + direction.y * step };
        if (blocked(point, 3)) {
          length = step;
          break;
        }
      }
      path.lineTo(origin.x + direction.x * length, origin.y + direction.y * length);
    }
    path.closePath();

    // Include close-range ambient hearing/proximity circle
    path.moveTo(origin.x + NEAR_VISION_RADIUS, origin.y);
    path.arc(origin.x, origin.y, NEAR_VISION_RADIUS, 0, Math.PI * 2);
    return path;
  };

  // Visibility Check: inside flashlight cone or within near proximity, with unobstructed line of sight
  const visibleToPlayer = (s: Runtime, position: Vec) => {
    const d = distance(s.player, position);
    if (d <= NEAR_VISION_RADIUS) {
      return hasLineOfSight(s.player, position);
    }
    if (d > VISION_RADIUS) return false;
    const angleToTarget = Math.atan2(position.y - s.player.y, position.x - s.player.x);
    const aimAngle = Math.atan2(s.aim.y, s.aim.x);
    let diff = Math.abs(angleToTarget - aimAngle);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    return diff < FLASHLIGHT_SPREAD + 0.08 && hasLineOfSight(s.player, position);
  };

  // Full scene rendering
  const drawScene = (ctx: CanvasRenderingContext2D, s: Runtime) => {
    // 1. Tactical floor & ambient grid
    const bg = ctx.createLinearGradient(0, 0, WORLD.w, WORLD.h);
    bg.addColorStop(0, "#172622");
    bg.addColorStop(1, "#0a1513");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);

    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = "#82b89f";
    ctx.lineWidth = 1;
    for (let x = 24; x < WORLD.w; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD.h);
      ctx.stroke();
    }
    for (let y = 24; y < WORLD.h; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD.w, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 2. Obstacles (Tactical concrete and wood walls)
    obstacles.forEach((box) => {
      ctx.fillStyle = box.kind === "wood" ? "#5a3a24" : "#324541";
      ctx.strokeStyle = box.kind === "wood" ? "#b0723d" : "#7c9d8d";
      ctx.lineWidth = 2.5;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.strokeRect(box.x, box.y, box.w, box.h);

      ctx.fillStyle = "rgba(4, 9, 8, 0.4)";
      for (let i = box.x + 8; i < box.x + box.w; i += 22) {
        ctx.fillRect(i, box.y + 4, 8, box.h - 8);
      }
      ctx.fillStyle = "#b4d3c3";
      ctx.font = "700 9px Inter, Arial, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(box.label, box.x + 8, box.y - 6);
    });

    // Arena Perimeter Bounds
    ctx.strokeStyle = "#5bd6c3";
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 8]);
    ctx.strokeRect(10, 10, WORLD.w - 20, WORLD.h - 20);
    ctx.setLineDash([]);

    // 3. Bullets
    s.bullets.forEach((bullet) => {
      if (bullet.team === "enemy" && !visibleToPlayer(s, bullet.position)) return;
      ctx.fillStyle = bullet.team === "player" ? "#d8fff0" : "#ff9e88";
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(bullet.position.x, bullet.position.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // 4. Acoustic sound waves for enemies in the dark within hearing radius (Bullet Echo Radar)
    s.enemies.forEach((enemy) => {
      const d = distance(s.player, enemy.position);
      const isVisible = visibleToPlayer(s, enemy.position);
      if (!isVisible && d < HEARING_RADIUS && enemy.alerted) {
        // Draw acoustic ripple indication
        const pulseTime = (performance.now() % 1000) / 1000;
        const radius = 14 + pulseTime * 18;
        ctx.strokeStyle = `rgba(239, 68, 68, ${0.8 - pulseTime * 0.7})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(enemy.position.x, enemy.position.y, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = "rgba(239, 68, 68, 0.85)";
        ctx.font = "900 8px Inter, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("(( • ))", enemy.position.x, enemy.position.y - radius - 4);
      }
    });

    // 5. Enemies (Rendered when inside flashlight beam or proximity)
    s.enemies.forEach((enemy) => {
      if (visibleToPlayer(s, enemy.position)) {
        drawOperator(
          ctx,
          enemy.position,
          "enemy",
          enemy.uniform,
          enemy.weapon,
          enemy.aim,
          enemy.name,
          enemy.hp,
          enemy.maxHp
        );
      }
    });

    // 6. Player Operator
    drawOperator(
      ctx,
      s.player,
      "player",
      loadout.uniform,
      loadout.weapon,
      s.aim,
      loadout.operatorName,
      s.hp,
      s.maxHp
    );
  };

  // Main draw loop with Bullet Echo Fog of War & Lighting
  const draw = (ctx: CanvasRenderingContext2D, dpr: number, viewW: number, viewH: number) => {
    const s = runtime.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewW, viewH);

    ctx.save();
    applyCamera(ctx, viewW, viewH);

    // 1. Draw entire scene (world, obstacles, player, bullets, and visible enemies)
    drawScene(ctx, s);

    // 2. Bullet Echo Fog of War: Darkness overlay with flashlight cone cut out via evenodd rule
    const darknessMask = new Path2D();
    darknessMask.rect(-2000, -2000, WORLD.w + 4000, WORLD.h + 4000);
    darknessMask.addPath(visionPath(s));

    ctx.fillStyle = "rgba(4, 10, 8, 0.74)";
    ctx.fill(darknessMask, "evenodd");

    // 3. Volumetric Flashlight Beam & Illumination Glow inside the cone
    ctx.save();
    ctx.clip(visionPath(s));
    const beamGlow = ctx.createRadialGradient(
      s.player.x,
      s.player.y,
      10,
      s.player.x,
      s.player.y,
      VISION_RADIUS
    );
    beamGlow.addColorStop(0, "rgba(160, 245, 230, 0.22)");
    beamGlow.addColorStop(0.5, "rgba(100, 220, 195, 0.10)");
    beamGlow.addColorStop(1, "rgba(50, 140, 120, 0.0)");
    ctx.fillStyle = beamGlow;
    ctx.fill(visionPath(s));
    ctx.restore();

    // 4. Flashlight Beam Edge Outline Lines
    const aimAngle = Math.atan2(s.aim.y, s.aim.x);
    const leftAngle = aimAngle - FLASHLIGHT_SPREAD;
    const rightAngle = aimAngle + FLASHLIGHT_SPREAD;
    ctx.strokeStyle = "rgba(120, 240, 215, 0.38)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s.player.x, s.player.y);
    ctx.lineTo(s.player.x + Math.cos(leftAngle) * VISION_RADIUS, s.player.y + Math.sin(leftAngle) * VISION_RADIUS);
    ctx.moveTo(s.player.x, s.player.y);
    ctx.lineTo(s.player.x + Math.cos(rightAngle) * VISION_RADIUS, s.player.y + Math.sin(rightAngle) * VISION_RADIUS);
    ctx.stroke();

    // 5. Bullet Echo Acoustic Hearing Circle (Dashed Ring around player)
    ctx.strokeStyle = "rgba(110, 230, 205, 0.25)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 12]);
    ctx.beginPath();
    ctx.arc(s.player.x, s.player.y, HEARING_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 6. Laser Aim Guide Line (from weapon barrel to target distance)
    const aimDir = normalize(s.aim);
    let laserLen = VISION_RADIUS;
    for (let step = 20; step <= VISION_RADIUS; step += 10) {
      const p = { x: s.player.x + aimDir.x * step, y: s.player.y + aimDir.y * step };
      if (blocked(p, 2)) {
        laserLen = step;
        break;
      }
    }
    ctx.strokeStyle = "rgba(239, 68, 68, 0.55)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(s.player.x + aimDir.x * 24, s.player.y + aimDir.y * 24);
    ctx.lineTo(s.player.x + aimDir.x * laserLen, s.player.y + aimDir.y * laserLen);
    ctx.stroke();

    ctx.restore();
  };

  const finish = (victory: boolean) => {
    if (!runtime.current.running) return;
    runtime.current.running = false;
    onFinish({
      victory,
      shots: runtime.current.shots,
      hits: runtime.current.hits,
      seconds: Math.round((performance.now() - runtime.current.started) / 1000),
      rounds: Math.max(1, Math.round((performance.now() - runtime.current.started) / 30000)),
    });
  };

  const fire = () => {
    const s = runtime.current;
    if (!s.running || !fireReady) return;
    setFireReady(false);
    s.shots += 1;
    setShotCount(s.shots);
    const direction = normalize(s.aim);
    const bulletDamage = loadout.weapon === "sniper" ? 100 : loadout.weapon === "smg" ? 34 : 50;

    s.bullets.push({
      id: s.nextBulletId++,
      position: { x: s.player.x + direction.x * 26, y: s.player.y + direction.y * 26 },
      velocity: { x: direction.x * 680, y: direction.y * 680 },
      team: "player",
      damage: bulletDamage,
      ttl: 1.8,
      sourceId: "player",
    });

    s.enemies.forEach((enemy) => {
      if (distance(enemy.position, s.player) < ENEMY_ALERT_RADIUS) enemy.alerted = true;
    });

    tacticalAudio.fire(loadout.weapon);
    window.setTimeout(() => setFireReady(true), loadout.weapon === "smg" ? 170 : loadout.weapon === "sniper" ? 520 : 310);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    tacticalAudio.startAmbient();
    const context = canvas.getContext("2d");
    if (!context) return;

    let viewW = 1;
    let viewH = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      viewW = Math.max(1, rect.width);
      viewH = Math.max(1, rect.height);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(viewW * dpr);
      canvas.height = Math.round(viewH * dpr);
    };

    const resizeAfterLayout = () => {
      window.requestAnimationFrame(resize);
    };

    resize();
    resizeAfterLayout();
    const observer = new ResizeObserver(resizeAfterLayout);
    observer.observe(canvas);
    window.addEventListener("resize", resizeAfterLayout, { passive: true });

    const frame = { current: 0 };
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = runtime.current;

      if (s.running) {
        // Player movement
        const speed = loadout.weapon === "smg" ? 200 : loadout.weapon === "sniper" ? 135 : 165;
        const previousPlayer = s.player;
        s.player = moveWithCollision(s.player, {
          x: s.joystick.x * speed * dt,
          y: s.joystick.y * speed * dt,
        });
        if (distance(previousPlayer, s.player) > 0.3) tacticalAudio.step();

        // Enemies AI & movement
        s.enemies.forEach((enemy) => {
          const toPlayer = { x: s.player.x - enemy.position.x, y: s.player.y - enemy.position.y };
          const dist = Math.hypot(toPlayer.x, toPlayer.y);
          const seesPlayer = dist < ENEMY_SIGHT_RADIUS && hasLineOfSight(enemy.position, s.player);

          if (seesPlayer) enemy.alerted = true;

          const target = enemy.patrol[enemy.patrolIndex];
          const patrolDirection = normalize({ x: target.x - enemy.position.x, y: target.y - enemy.position.y });
          const chaseDirection = normalize(toPlayer);
          const direction = enemy.alerted ? chaseDirection : patrolDirection;
          const speedEnemy = enemy.weapon === "smg" ? 95 : enemy.weapon === "sniper" ? 38 : 64;
          const moveDirection = enemy.alerted && enemy.weapon === "sniper" ? { x: -chaseDirection.x, y: -chaseDirection.y } : direction;

          enemy.position = moveWithCollision(enemy.position, {
            x: moveDirection.x * speedEnemy * dt,
            y: moveDirection.y * speedEnemy * dt,
          });
          enemy.aim = toPlayer;

          if (!enemy.alerted && distance(enemy.position, target) < 24) {
            enemy.patrolIndex = (enemy.patrolIndex + 1) % enemy.patrol.length;
          }

          enemy.cooldown -= dt;
          if (enemy.alerted && seesPlayer && enemy.cooldown <= 0) {
            enemy.cooldown = enemy.weapon === "smg" ? 0.72 : enemy.weapon === "sniper" ? 2.1 : 1.25;
            const aim = normalize({ x: s.player.x - enemy.position.x, y: s.player.y - enemy.position.y });
            s.bullets.push({
              id: s.nextBulletId++,
              position: { x: enemy.position.x + aim.x * 24, y: enemy.position.y + aim.y * 24 },
              velocity: { x: aim.x * 420, y: aim.y * 420 },
              team: "enemy",
              damage: enemy.weapon === "sniper" ? 45 : enemy.weapon === "smg" ? 20 : 28,
              ttl: 2.4,
              sourceId: enemy.id,
            });
            tacticalAudio.fire(enemy.weapon);
          }
        });

        // Bullet physics & hit detection
        const nextBullets: Bullet[] = [];
        for (const bullet of s.bullets) {
          let alive = true;
          const steps = Math.max(1, Math.ceil((Math.hypot(bullet.velocity.x, bullet.velocity.y) * dt) / 8));
          const step = { x: bullet.velocity.x * dt / steps, y: bullet.velocity.y * dt / steps };

          for (let i = 0; i < steps && alive; i += 1) {
            bullet.position = { x: bullet.position.x + step.x, y: bullet.position.y + step.y };
            bullet.ttl -= dt / steps;
            if (bullet.ttl <= 0 || blocked(bullet.position, 3)) {
              alive = false;
              continue;
            }

            if (bullet.team === "player") {
              const target = s.enemies.find((enemy) => distance(bullet.position, enemy.position) < PLAYER_R + 5);
              if (target) {
                alive = false;
                s.hits += 1;
                target.hp -= bullet.damage;
                tacticalAudio.hit();

                if (target.hp <= 0) {
                  s.enemies = s.enemies.filter((enemy) => enemy.id !== target.id);
                  setHostileCount(s.enemies.length);
                  if (!s.enemies.length) finish(true);
                }
              }
            } else if (distance(bullet.position, s.player) < PLAYER_R + 5) {
              alive = false;
              s.hp = Math.max(0, s.hp - bullet.damage);
              setHp(s.hp);
              tacticalAudio.miss();
              if (s.hp <= 0) finish(false);
            }
          }
          if (alive) nextBullets.push(bullet);
        }
        s.bullets = nextBullets;
      }

      draw(context, window.devicePixelRatio || 1, viewW, viewH);
      frame.current = requestAnimationFrame(loop);
    };

    frame.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame.current);
      observer.disconnect();
      window.removeEventListener("resize", resizeAfterLayout);
      tacticalAudio.stopAmbient();
    };
  }, [loadout.weapon]);

  const updateJoystick = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const radius = rect.width * 0.38;
    const length = Math.min(radius, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    runtime.current.joystick = {
      x: Math.cos(angle) * (length / radius),
      y: Math.sin(angle) * (length / radius),
    };
    setJoystickActive(true);
  };

  const updateAim = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const { scale, offsetX, offsetY } = getViewportTransform(rect.width, rect.height, runtime.current.player);
    const target = {
      x: (event.clientX - rect.left - offsetX) / scale,
      y: (event.clientY - rect.top - offsetY) / scale,
    };
    runtime.current.aim = normalize({
      x: target.x - runtime.current.player.x,
      y: target.y - runtime.current.player.y,
    });
  };

  return (
    <div className="realtime-arena">
      <canvas
        ref={canvasRef}
        className="realtime-canvas"
        onPointerMove={updateAim}
        onPointerDown={(event) => {
          updateAim(event);
          if (event.clientX > event.currentTarget.getBoundingClientRect().left + event.currentTarget.getBoundingClientRect().width * 0.48) {
            fire();
          }
        }}
        aria-label="Arena top-down Bullet Echo com fog of war e lanterna"
      />
      <div className="realtime-hud">
        <span>HP <b>{hp}%</b></span>
        <span>BBs <b>{shotCount}</b></span>
        <span>HOSTIS <b>{hostileCount}</b></span>
        <button
          type="button"
          onClick={() => {
            tacticalAudio.ui();
            onExit();
          }}
        >
          QG
        </button>
      </div>
      <div
        className="joystick"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          joystickPointer.current = event.pointerId;
          updateJoystick(event);
        }}
        onPointerMove={(event) => {
          if (joystickPointer.current === event.pointerId) updateJoystick(event);
        }}
        onPointerUp={() => {
          joystickPointer.current = null;
          runtime.current.joystick = { x: 0, y: 0 };
          setJoystickActive(false);
        }}
        onPointerCancel={() => {
          joystickPointer.current = null;
          runtime.current.joystick = { x: 0, y: 0 };
          setJoystickActive(false);
        }}
      >
        <div className={`joystick-knob ${joystickActive ? "active" : ""}`} />
      </div>
      <button
        type="button"
        className="fire-control"
        onPointerDown={(event) => {
          event.stopPropagation();
          fire();
        }}
      >
        {fireReady ? "FIRE" : "READY"}
      </button>
      <div className="realtime-hint">FOG OF WAR • FLASHLIGHT BULLET ECHO</div>
    </div>
  );
}
