import { useEffect, useRef, useState } from "react";
import type { Loadout, RivalProfile, UniformId, WeaponId } from "../game/types";
import { tacticalAudio } from "../lib/tacticalAudio";

export interface RealtimeResult { victory: boolean; shots: number; hits: number; seconds: number; rounds: number; }
interface Props { loadout: Loadout; rival: RivalProfile; onFinish: (result: RealtimeResult) => void; onExit: () => void; }
type Vec = { x: number; y: number };
type Viewport = { viewW: number; viewH: number; dpr: number; scale: number; offsetX: number; offsetY: number };
type Bullet = { id: number; position: Vec; velocity: Vec; team: "player" | "enemy"; damage: number; ttl: number; sourceId: string; };
type Enemy = { id: string; position: Vec; aim: Vec; patrol: Vec[]; patrolIndex: number; alerted: boolean; cooldown: number; uniform: UniformId; weapon: WeaponId; name: string; hp: number; armor: number; };
type LootType = "ammo" | "armor" | "med";
type LootItem = { id: number; type: LootType; position: Vec; value: number; active: boolean };
type Runtime = { player: Vec; aim: Vec; joystick: Vec; bullets: Bullet[]; enemies: Enemy[]; loot: LootItem[]; hp: number; armor: number; shots: number; hits: number; started: number; running: boolean; nextBulletId: number; };

const LOGICAL_WIDTH = 1800;
const LOGICAL_HEIGHT = 1400;
const WORLD = { w: LOGICAL_WIDTH, h: LOGICAL_HEIGHT };
const VISION_RADIUS = 260;
const NEAR_VISION_RADIUS = 90;
const HEARING_RADIUS = 320;
const ENEMY_ALERT_RADIUS = 480;
const ENEMY_SIGHT_RADIUS = 680;
const PLAYER_R = 17;

const obstacles = [
  { x: 200, y: 150, w: 400, h: 50, kind: "concrete", label: "BLOCO A" },
  { x: 750, y: 120, w: 60, h: 350, kind: "concrete", label: "MURO NORTE" },
  { x: 920, y: 200, w: 450, h: 50, kind: "wood", label: "ESTande" },
  { x: 1100, y: 380, w: 60, h: 320, kind: "concrete", label: "PAREDE LESTE" },
  { x: 300, y: 600, w: 350, h: 50, kind: "wood", label: "DEPÓSITO" },
  { x: 800, y: 800, w: 500, h: 60, kind: "concrete", label: "BLOCO CENTRAL" },
  { x: 150, y: 900, w: 60, h: 300, kind: "concrete", label: "CORREDOR OESTE" },
  { x: 1300, y: 950, w: 380, h: 50, kind: "wood", label: "SUL SETOR" },
];

const patrolRoutes: Vec[][] = [
  [{ x: 520, y: 390 }, { x: 1217, y: 726 }, { x: 809, y: 530 }, { x: 1151, y: 102 }],
  [{ x: 760, y: 260 }, { x: 525, y: 414 }, { x: 510, y: 762 }, { x: 772, y: 820 }],
  [{ x: 820, y: 560 }, { x: 1283, y: 284 }, { x: 1072, y: 269 }, { x: 809, y: 131 }],
  [{ x: 1060, y: 390 }, { x: 597, y: 798 }, { x: 597, y: 435 }, { x: 1192, y: 568 }],
];

const enemySpawn: Vec[] = [
  { x: 520, y: 390 },
  { x: 760, y: 260 },
  { x: 820, y: 560 },
  { x: 1060, y: 390 },
];

const initialLoot: LootItem[] = [
  { id: 1, type: "ammo", position: { x: 400, y: 280 }, value: 30, active: true },
  { id: 2, type: "armor", position: { x: 880, y: 480 }, value: 50, active: true },
  { id: 3, type: "med", position: { x: 1250, y: 700 }, value: 40, active: true },
  { id: 4, type: "ammo", position: { x: 1550, y: 300 }, value: 30, active: true },
  { id: 5, type: "armor", position: { x: 600, y: 1100 }, value: 50, active: true },
  { id: 6, type: "med", position: { x: 1000, y: 1150 }, value: 50, active: true },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const normalize = (vector: Vec): Vec => { const length = Math.hypot(vector.x, vector.y) || 1; return { x: vector.x / length, y: vector.y / length }; };
const circleHitsRect = (p: Vec, r: number, box: typeof obstacles[number]) => { const x = clamp(p.x, box.x, box.x + box.w); const y = clamp(p.y, box.y, box.y + box.h); return Math.hypot(p.x - x, p.y - y) < r; };
const blocked = (p: Vec, radius = PLAYER_R) => p.x < radius || p.y < radius || p.x > WORLD.w - radius || p.y > WORLD.h - radius || obstacles.some((box) => circleHitsRect(p, radius, box));
const moveWithCollision = (from: Vec, delta: Vec, radius = PLAYER_R) => { const xTry = { x: from.x + delta.x, y: from.y }; const yTry = { x: from.x, y: from.y + delta.y }; const both = { x: from.x + delta.x, y: from.y + delta.y }; if (!blocked(both, radius)) return both; if (!blocked(xTry, radius)) return xTry; if (!blocked(yTry, radius)) return yTry; return from; };
const uniformColor = (uniform: UniformId) => uniform === "all-black" ? "#182323" : uniform === "woodland" ? "#435a3d" : "#657450";

const hasLineOfSight = (from: Vec, to: Vec) => {
  const delta = { x: to.x - from.x, y: to.y - from.y };
  const dist = Math.hypot(delta.x, delta.y);
  if (dist < PLAYER_R + 6) return true;
  const steps = Math.ceil(dist / 14);
  for (let i = 1; i < steps; i += 1) {
    const point = { x: from.x + delta.x * (i / steps), y: from.y + delta.y * (i / steps) };
    if (obstacles.some((box) => circleHitsRect(point, 2, box))) return false;
  }
  return true;
};

const getViewportTransform = (viewW: number, viewH: number, dpr: number, currentScale?: number): Viewport => {
  const scale = currentScale ?? Math.min(viewW / LOGICAL_WIDTH, viewH / LOGICAL_HEIGHT);
  return { viewW, viewH, dpr, scale, offsetX: (viewW - LOGICAL_WIDTH * scale) / 2, offsetY: (viewH - LOGICAL_HEIGHT * scale) / 2 };
};

export default function RealtimeArenaCanvas({ loadout, rival, onFinish, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<Runtime>({
    player: { x: 250, y: 390 },
    aim: { x: 1, y: 0 },
    joystick: { x: 0, y: 0 },
    bullets: [],
    loot: initialLoot,
    enemies: enemySpawn.map((position, index) => ({
      id: `hostile-${index + 1}`,
      position,
      aim: { x: -1, y: 0 },
      patrol: patrolRoutes[index],
      patrolIndex: 0,
      alerted: false,
      cooldown: 1.2 + index * .25,
      uniform: index === 1 ? "all-black" : index === 2 ? "woodland" : rival.uniform,
      weapon: index === 1 ? "smg" : index === 2 ? "sniper" : rival.weapon,
      name: index === 0 ? `HOSTIL-${index + 1}` : `${rival.teamName}-${String(index + 1).padStart(2, "0")}`,
      hp: 100,
      armor: 50,
    })),
    hp: 100,
    armor: 100,
    shots: 0,
    hits: 0,
    started: performance.now(),
    running: true,
    nextBulletId: 1,
  });

  const [joystickActive, setJoystickActive] = useState(false);
  const [fireReady, setFireReady] = useState(true);
  const [hp, setHp] = useState(100);
  const [armor, setArmor] = useState(100);
  const [shotCount, setShotCount] = useState(0);
  const [hostileCount, setHostileCount] = useState(4);
  const joystickPointer = useRef<number | null>(null);

  const applyCamera = (ctx: CanvasRenderingContext2D, viewport: Viewport) => {
    ctx.translate(viewport.offsetX, viewport.offsetY);
    ctx.scale(viewport.scale, viewport.scale);
  };

  const drawOperator = (ctx: CanvasRenderingContext2D, position: Vec, actor: "player" | "enemy", uniform: UniformId, weapon: WeaponId, aim: Vec, name: string, entityHp: number, entityArmor: number) => {
    const accent = actor === "player" ? "#59ddc7" : "#ef6470";
    const angle = Math.atan2(aim.y, aim.x);

    ctx.save();
    ctx.translate(position.x, position.y);
    ctx.rotate(angle);

    // Sombra do operador
    ctx.fillStyle = "rgba(0,0,0,.5)";
    ctx.beginPath();
    ctx.ellipse(0, 5, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Uniforme e Corpo
    ctx.fillStyle = uniformColor(uniform);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 4, 16, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = actor === "player" ? "#263c38" : "#2d2527";
    ctx.fillRect(-10, -4, 20, 13);

    // Cabeça e Capacete
    ctx.fillStyle = "#10191a";
    ctx.beginPath();
    ctx.arc(0, -8, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.stroke();

    ctx.fillStyle = "#8db3a3";
    ctx.fillRect(-7, -9, 14, 3);

    // Arma e Cano com Laser
    const barrel = weapon === "sniper" ? 42 : weapon === "smg" ? 25 : 33;
    ctx.fillStyle = "#172321";
    ctx.fillRect(8, -2, barrel, 5);
    ctx.fillStyle = accent;
    ctx.fillRect(14, -1, 12, 2);

    if (weapon === "sniper") {
      ctx.fillStyle = "#758a7a";
      ctx.fillRect(18, -7, 12, 3);
    }
    if (weapon === "smg") {
      ctx.fillStyle = "#516e5d";
      ctx.fillRect(13, 2, 4, 8);
    }
    ctx.restore();

    // Linha Laser de Mira Tática Bullet Echo
    ctx.save();
    ctx.strokeStyle = actor === "player" ? "rgba(89, 221, 199, 0.45)" : "rgba(239, 100, 112, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(position.x, position.y);
    ctx.lineTo(position.x + aim.x * 160, position.y + aim.y * 160);
    ctx.stroke();
    ctx.restore();

    // Barra de Status Dupla Estilo Bullet Echo (HP Verde + Armadura Azul)
    const barW = 52;
    const barH = 4;
    const startX = position.x - barW / 2;
    const startY = position.y + 24;

    ctx.fillStyle = "rgba(10, 15, 14, 0.85)";
    ctx.fillRect(startX - 2, startY - 2, barW + 4, barH * 2 + 6);

    // HP (Verde)
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(startX, startY, barW * (Math.max(0, entityHp) / 100), barH);

    // Armadura (Azul)
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(startX, startY + barH + 2, barW * (Math.max(0, entityArmor) / 100), barH);

    // Nome do Operador
    ctx.fillStyle = accent;
    ctx.font = "800 10px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`${name.toUpperCase()} [${Math.max(0, entityHp)}]`, position.x, position.y - 30);
  };

  const visionPath = (s: Runtime) => {
    const path = new Path2D();
    const origin = s.player;
    const radius = VISION_RADIUS;
    const spread = 0.45;
    const rays = 64;
    path.moveTo(origin.x, origin.y);
    for (let i = 0; i <= rays; i += 1) {
      const angle = Math.atan2(s.aim.y, s.aim.x) - spread + (spread * 2 * i / rays);
      const direction = { x: Math.cos(angle), y: Math.sin(angle) };
      let length = radius;
      for (let step = 12; step <= radius; step += 12) {
        const point = { x: origin.x + direction.x * step, y: origin.y + direction.y * step };
        if (obstacles.some((box) => circleHitsRect(point, 2, box))) {
          length = step;
          break;
        }
      }
      path.lineTo(origin.x + direction.x * length, origin.y + direction.y * length);
    }
    path.closePath();
    return path;
  };

  const visibleToPlayer = (s: Runtime, position: Vec) =>
    distance(s.player, position) <= NEAR_VISION_RADIUS ||
    (distance(s.player, position) <= VISION_RADIUS && Math.abs(Math.atan2(position.y - s.player.y, position.x - s.player.x) - Math.atan2(s.aim.y, s.aim.x)) < .5 && hasLineOfSight(s.player, position));

  const drawScene = (ctx: CanvasRenderingContext2D, s: Runtime, visibleOnly: boolean) => {
    // Fundo Tático Texturizado Estilo Cidade Bullet Echo
    const bg = ctx.createLinearGradient(0, 0, WORLD.w, WORLD.h);
    bg.addColorStop(0, "#192220");
    bg.addColorStop(1, "#070d0c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);

    // Grid tático estilo piso industrial
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = "#8fa392";
    ctx.lineWidth = 1;
    for (let x = 40; x < WORLD.w; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.h); ctx.stroke();
    }
    for (let y = 40; y < WORLD.h; y += 64) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.w, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Obstáculos e Paredes
    obstacles.forEach((box) => {
      ctx.fillStyle = box.kind === "wood" ? "#593924" : "#3d4d4b";
      ctx.strokeStyle = box.kind === "wood" ? "#a86438" : "#839995";
      ctx.lineWidth = 2;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.strokeRect(box.x, box.y, box.w, box.h);

      ctx.fillStyle = "rgba(4,8,7,.35)";
      for (let i = box.x + 10; i < box.x + box.w; i += 28) {
        ctx.fillRect(i, box.y + 6, 10, box.h - 12);
      }
      ctx.fillStyle = "#b2c4ad";
      ctx.font = "700 9px Arial";
      ctx.textAlign = "left";
      ctx.fillText(box.label, box.x + 8, box.y - 6);
    });

    // Limites da Arena
    ctx.strokeStyle = "#b59b52";
    ctx.setLineDash([12, 8]);
    ctx.strokeRect(16, 16, WORLD.w - 32, WORLD.h - 32);
    ctx.setLineDash([]);

    // Desenho de Itens de Loot no Chão (Caixas de Suprimentos Estilo Bullet Echo)
    s.loot.forEach((item) => {
      if (!item.active) return;
      if (visibleOnly && !visibleToPlayer(s, item.position)) return;

      ctx.save();
      ctx.translate(item.position.x, item.position.y);
      ctx.fillStyle = "#d97706";
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.fillRect(-14, -14, 28, 28);
      ctx.strokeRect(-14, -14, 28, 28);

      ctx.fillStyle = "#ffffff";
      ctx.font = "700 9px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item.type === "ammo" ? "MUNI" : item.type === "armor" ? "ARM" : "HP", 0, 0);
      ctx.restore();
    });

    // Projéteis
    s.bullets.forEach((bullet) => {
      if (visibleOnly && bullet.team === "enemy" && !visibleToPlayer(s, bullet.position)) return;
      ctx.fillStyle = bullet.team === "player" ? "#d8fff0" : "#ff9e88";
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(bullet.position.x, bullet.position.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Operador do Jogador
    drawOperator(ctx, s.player, "player", loadout.uniform, loadout.weapon, s.aim, loadout.operatorName, s.hp, s.armor);

    // Inimigos
    s.enemies.forEach((enemy) => {
      const isVisible = visibleToPlayer(s, enemy.position);
      if (!visibleOnly || isVisible) {
        drawOperator(ctx, enemy.position, "enemy", enemy.uniform, enemy.weapon, normalize({ x: s.player.x - enemy.position.x, y: s.player.y - enemy.position.y }), enemy.name, enemy.hp, enemy.armor);
      }

      // Anel de Audição e Pulsos Acústicos para Inimigos Alertas no Escuro
      const distToPlayer = distance(s.player, enemy.position);
      if (!isVisible && distToPlayer <= HEARING_RADIUS && enemy.alerted) {
        ctx.save();
        ctx.strokeStyle = "rgba(239, 100, 112, 0.55)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(enemy.position.x, enemy.position.y, 22 + Math.sin(performance.now() / 180) * 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    });
  };

  const draw = (ctx: CanvasRenderingContext2D, viewport: Viewport) => {
    const s = runtime.current;
    ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    ctx.clearRect(0, 0, viewport.viewW, viewport.viewH);

    // 1. Renderiza o mundo base limpo
    ctx.save();
    applyCamera(ctx, viewport);
    drawScene(ctx, s, false);
    ctx.restore();

    // 2. Máscara de Escuridão Fog of War / Visão de Lanterna (Estilo Bullet Echo)
    ctx.save();
    ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    ctx.fillStyle = "rgba(4, 10, 8, 0.94)";
    ctx.fillRect(0, 0, viewport.viewW, viewport.viewH);
    ctx.restore();

    ctx.save();
    applyCamera(ctx, viewport);
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "white";

    // Recorte do facho principal da lanterna
    ctx.fill(visionPath(s));

    // Recorte circular de visão próxima ao redor do operador
    ctx.beginPath();
    ctx.arc(s.player.x, s.player.y, NEAR_VISION_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3. Re-renderiza elementos visíveis dentro da lanterna com brilho volumétrico
    ctx.save();
    applyCamera(ctx, viewport);
    ctx.globalCompositeOperation = "destination-over";
    ctx.clip(visionPath(s));
    drawScene(ctx, s, true);
    ctx.restore();

    // Anel Acústico de Radar ao redor do Jogador
    ctx.save();
    applyCamera(ctx, viewport);
    ctx.strokeStyle = "rgba(89, 221, 199, 0.28)";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(s.player.x, s.player.y, HEARING_RADIUS, 0, Math.PI * 2);
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
    s.bullets.push({
      id: s.nextBulletId++,
      position: { x: s.player.x + direction.x * 23, y: s.player.y + direction.y * 23 },
      velocity: { x: direction.x * 650, y: direction.y * 650 },
      team: "player",
      damage: loadout.weapon === "sniper" ? 75 : loadout.weapon === "smg" ? 28 : 45,
      ttl: 1.8,
      sourceId: "player",
    });

    s.enemies.forEach((enemy) => {
      if (distance(enemy.position, s.player) < ENEMY_ALERT_RADIUS) enemy.alerted = true;
    });

    tacticalAudio.fire(loadout.weapon);
    window.setTimeout(() => setFireReady(true), loadout.weapon === "smg" ? 170 : loadout.weapon === "sniper" ? 500 : 300);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    tacticalAudio.startAmbient();
    const context = canvas.getContext("2d");
    if (!context) return;

    let viewport: Viewport = getViewportTransform(1, 1, 1);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const viewW = Math.max(1, rect.width);
      const viewH = Math.max(1, rect.height);
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const bufferW = Math.max(1, Math.round(viewW * dpr));
      const bufferH = Math.max(1, Math.round(viewH * dpr));
      if (canvas.width !== bufferW) canvas.width = bufferW;
      if (canvas.height !== bufferH) canvas.height = bufferH;
      viewport = getViewportTransform(viewW, viewH, dpr, Math.min(viewW / LOGICAL_WIDTH, viewH / LOGICAL_HEIGHT));
    };

    const resizeAfterLayout = () => { window.requestAnimationFrame(resize); };
    resize();
    resizeAfterLayout();
    const observer = new ResizeObserver(resizeAfterLayout);
    observer.observe(canvas);
    window.addEventListener("resize", resizeAfterLayout, { passive: true });

    const frame = { current: 0 };
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(.05, (now - last) / 1000);
      last = now;
      const s = runtime.current;

      if (s.running) {
        const speed = loadout.weapon === "smg" ? 190 : loadout.weapon === "sniper" ? 130 : 160;
        const previousPlayer = s.player;
        s.player = moveWithCollision(s.player, { x: s.joystick.x * speed * dt, y: s.joystick.y * speed * dt });
        if (distance(previousPlayer, s.player) > .3) tacticalAudio.step();

        // Verificação de Coleta de Loot (Itens no Chão)
        s.loot.forEach((item) => {
          if (!item.active) return;
          if (distance(s.player, item.position) < PLAYER_R + 18) {
            item.active = false;
            tacticalAudio.ui();
            if (item.type === "ammo") {
              setShotCount((prev) => prev + item.value);
            } else if (item.type === "armor") {
              s.armor = Math.min(100, s.armor + item.value);
              setArmor(s.armor);
            } else if (item.type === "med") {
              s.hp = Math.min(100, s.hp + item.value);
              setHp(s.hp);
            }
          }
        });

        // IA dos Inimigos
        s.enemies.forEach((enemy) => {
          const toPlayer = { x: s.player.x - enemy.position.x, y: s.player.y - enemy.position.y };
          const dist = Math.hypot(toPlayer.x, toPlayer.y);
          const seesPlayer = dist < ENEMY_SIGHT_RADIUS && hasLineOfSight(enemy.position, s.player);
          if (seesPlayer || dist < HEARING_RADIUS) enemy.alerted = true;

          const target = enemy.patrol[enemy.patrolIndex];
          const patrolDirection = normalize({ x: target.x - enemy.position.x, y: target.y - enemy.position.y });
          const chaseDirection = normalize(toPlayer);
          const direction = enemy.alerted ? chaseDirection : patrolDirection;
          const speedEnemy = enemy.weapon === "smg" ? 95 : enemy.weapon === "sniper" ? 36 : 62;
          const moveDirection = enemy.alerted && enemy.weapon === "sniper" ? { x: -chaseDirection.x, y: -chaseDirection.y } : direction;

          enemy.position = moveWithCollision(enemy.position, { x: moveDirection.x * speedEnemy * dt, y: moveDirection.y * speedEnemy * dt });
          enemy.aim = toPlayer;

          if (!enemy.alerted && distance(enemy.position, target) < 22) {
            enemy.patrolIndex = (enemy.patrolIndex + 1) % enemy.patrol.length;
          }

          enemy.cooldown -= dt;
          if (enemy.alerted && seesPlayer && enemy.cooldown <= 0) {
            enemy.cooldown = enemy.weapon === "smg" ? .72 : enemy.weapon === "sniper" ? 2.1 : 1.25;
            const aim = normalize({ x: s.player.x - enemy.position.x, y: s.player.y - enemy.position.y });
            s.bullets.push({
              id: s.nextBulletId++,
              position: { x: enemy.position.x + aim.x * 23, y: enemy.position.y + aim.y * 23 },
              velocity: { x: aim.x * 420, y: aim.y * 420 },
              team: "enemy",
              damage: enemy.weapon === "sniper" ? 45 : enemy.weapon === "smg" ? 20 : 28,
              ttl: 2.4,
              sourceId: enemy.id,
            });
            tacticalAudio.fire(enemy.weapon);
          }
        });

        // Gestão de Projéteis e Danos
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
              const target = s.enemies.find((enemy) => distance(bullet.position, enemy.position) < PLAYER_R + 6);
              if (target) {
                alive = false;
                s.hits += 1;
                // Aplicação de dano na armadura primeiro, depois no HP do inimigo
                if (target.armor > 0) {
                  target.armor = Math.max(0, target.armor - bullet.damage);
                } else {
                  target.hp = Math.max(0, target.hp - bullet.damage);
                }

                if (target.hp <= 0) {
                  s.enemies = s.enemies.filter((enemy) => enemy.id !== target.id);
                  setHostileCount(s.enemies.length);
                  if (!s.enemies.length) finish(true);
                }
              }
            } else if (distance(bullet.position, s.player) < PLAYER_R + 6) {
              alive = false;
              if (s.armor > 0) {
                s.armor = Math.max(0, s.armor - bullet.damage);
                setArmor(s.armor);
              } else {
                s.hp = Math.max(0, s.hp - bullet.damage);
                setHp(s.hp);
              }
              tacticalAudio.miss();
              if (s.hp <= 0) finish(false);
            }
          }
          if (alive) nextBullets.push(bullet);
        }
        s.bullets = nextBullets;
      }

      draw(context, viewport);
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
    const radius = rect.width * .38;
    const length = Math.min(radius, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    runtime.current.joystick = { x: Math.cos(angle) * (length / radius), y: Math.sin(angle) * (length / radius) };
    setJoystickActive(true);
  };

  const updateAim = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const { scale, offsetX, offsetY } = getViewportTransform(Math.max(1, rect.width), Math.max(1, rect.height), 1, Math.min(rect.width / LOGICAL_WIDTH, rect.height / LOGICAL_HEIGHT));
    const target = { x: (event.clientX - rect.left - offsetX) / scale, y: (event.clientY - rect.top - offsetY) / scale };
    runtime.current.aim = normalize({ x: target.x - runtime.current.player.x, y: target.y - runtime.current.player.y });
  };

  return (
    <div className="realtime-arena">
      <canvas
        ref={canvasRef}
        className="realtime-canvas"
        onPointerMove={updateAim}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          updateAim(event);
        }}
        aria-label="Arena tática estilo Bullet Echo com Loot e Fog of War"
      />
      <div className="realtime-hud">
        <span>HP <b>{hp}%</b></span>
        <span>ARM <b>{armor}%</b></span>
        <span>MUNI <b>{shotCount}</b></span>
        <span>HOSTIS <b>{hostileCount}</b></span>
        <button type="button" onClick={() => { tacticalAudio.ui(); onExit(); }}>QG</button>
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
      <div className="realtime-hint">BULLET ECHO TACTICAL • LOOT ATIVO</div>
    </div>
  );
}