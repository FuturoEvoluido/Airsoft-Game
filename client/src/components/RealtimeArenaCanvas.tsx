import { useEffect, useRef, useState } from "react";
import type { Loadout, RivalProfile, UniformId, WeaponId } from "../game/types";
import { tacticalAudio } from "../lib/tacticalAudio";

export interface RealtimeResult { victory: boolean; shots: number; hits: number; seconds: number; rounds: number; }
interface Props { loadout: Loadout; rival: RivalProfile; onFinish: (result: RealtimeResult) => void; onExit: () => void; }
type Vec = { x: number; y: number };
type Bullet = { id: number; position: Vec; velocity: Vec; team: "player" | "enemy"; damage: number; ttl: number; sourceId: string; };
type Enemy = { id: string; position: Vec; aim: Vec; patrol: Vec[]; patrolIndex: number; alerted: boolean; cooldown: number; uniform: UniformId; weapon: WeaponId; name: string; };
type Runtime = { player: Vec; aim: Vec; joystick: Vec; bullets: Bullet[]; enemies: Enemy[]; hp: number; shots: number; hits: number; started: number; running: boolean; nextBulletId: number; };

const WORLD = { w: 960, h: 620 };
const LOGICAL_WIDTH = WORLD.w;
const LOGICAL_HEIGHT = WORLD.h;
const PLAYER_R = 17;
const obstacles = [
  { x: 110, y: 88, w: 230, h: 28, kind: "concrete", label: "CONCRETE" },
  { x: 420, y: 72, w: 34, h: 198, kind: "concrete", label: "WALL" },
  { x: 570, y: 110, w: 250, h: 30, kind: "wood", label: "WOOD" },
  { x: 680, y: 205, w: 34, h: 180, kind: "concrete", label: "WALL" },
  { x: 180, y: 340, w: 210, h: 30, kind: "wood", label: "WOOD" },
  { x: 475, y: 430, w: 290, h: 34, kind: "concrete", label: "CONCRETE" },
  { x: 75, y: 470, w: 34, h: 95, kind: "concrete", label: "WALL" },
];
const patrolRoutes: Vec[][] = [
  [{ x: 790, y: 320 }, { x: 835, y: 500 }, { x: 555, y: 365 }, { x: 790, y: 70 }],
  [{ x: 520, y: 340 }, { x: 360, y: 285 }, { x: 350, y: 525 }, { x: 530, y: 565 }],
  [{ x: 850, y: 75 }, { x: 880, y: 195 }, { x: 735, y: 185 }, { x: 555, y: 90 }],
  [{ x: 820, y: 555 }, { x: 410, y: 550 }, { x: 410, y: 300 }, { x: 820, y: 390 }],
];
const enemySpawn: Vec[] = [{ x: 790, y: 320 }, { x: 520, y: 340 }, { x: 850, y: 75 }, { x: 820, y: 555 }];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const normalize = (vector: Vec): Vec => { const length = Math.hypot(vector.x, vector.y) || 1; return { x: vector.x / length, y: vector.y / length }; };
const circleHitsRect = (p: Vec, r: number, box: typeof obstacles[number]) => { const x = clamp(p.x, box.x, box.x + box.w); const y = clamp(p.y, box.y, box.y + box.h); return Math.hypot(p.x - x, p.y - y) < r; };
const blocked = (p: Vec, radius = PLAYER_R) => p.x < radius || p.y < radius || p.x > WORLD.w - radius || p.y > WORLD.h - radius || obstacles.some((box) => circleHitsRect(p, radius, box));
const moveWithCollision = (from: Vec, delta: Vec, radius = PLAYER_R) => { const xTry = { x: from.x + delta.x, y: from.y }; const yTry = { x: from.x, y: from.y + delta.y }; const both = { x: from.x + delta.x, y: from.y + delta.y }; if (!blocked(both, radius)) return both; if (!blocked(xTry, radius)) return xTry; if (!blocked(yTry, radius)) return yTry; return from; };
const uniformColor = (uniform: UniformId) => uniform === "all-black" ? "#182323" : uniform === "woodland" ? "#435a3d" : "#657450";
const hasLineOfSight = (from: Vec, to: Vec) => { const delta = { x: to.x - from.x, y: to.y - from.y }; const steps = Math.ceil(Math.hypot(delta.x, delta.y) / 14); for (let i = 1; i < steps; i += 1) { const point = { x: from.x + delta.x * (i / steps), y: from.y + delta.y * (i / steps) }; if (obstacles.some((box) => circleHitsRect(point, 2, box))) return false; } return true; };

export default function RealtimeArenaCanvas({ loadout, rival, onFinish, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<Runtime>({ player: { x: 150, y: 270 }, aim: { x: 1, y: 0 }, joystick: { x: 0, y: 0 }, bullets: [], enemies: enemySpawn.map((position, index) => ({ id: `hostile-${index + 1}`, position, aim: { x: -1, y: 0 }, patrol: patrolRoutes[index], patrolIndex: 0, alerted: false, cooldown: 1.2 + index * .25, uniform: index === 1 ? "all-black" : index === 2 ? "woodland" : rival.uniform, weapon: index === 1 ? "smg" : index === 2 ? "sniper" : rival.weapon, name: index === 0 ? rival.operatorName : `${rival.teamName}-${String(index + 1).padStart(2, "0")}` })), hp: 100, shots: 0, hits: 0, started: performance.now(), running: true, nextBulletId: 1 });
  const [joystickActive, setJoystickActive] = useState(false);
  const [fireReady, setFireReady] = useState(true);
  const [hp, setHp] = useState(100);
  const [shotCount, setShotCount] = useState(0);
  const [hostileCount, setHostileCount] = useState(4);
  const joystickPointer = useRef<number | null>(null);

  const getViewportTransform = (viewW: number, viewH: number) => {
    const scale = Math.min(viewW / LOGICAL_WIDTH, viewH / LOGICAL_HEIGHT);
    return { scale, offsetX: (viewW - LOGICAL_WIDTH * scale) / 2, offsetY: (viewH - LOGICAL_HEIGHT * scale) / 2 };
  };
  const applyCamera = (ctx: CanvasRenderingContext2D, viewW: number, viewH: number) => {
    const { scale, offsetX, offsetY } = getViewportTransform(viewW, viewH);
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
  };

  const drawOperator = (ctx: CanvasRenderingContext2D, position: Vec, actor: "player" | "enemy", uniform: UniformId, weapon: WeaponId, aim: Vec, name: string) => {
    const accent = actor === "player" ? "#59ddc7" : "#ef6470"; const angle = Math.atan2(aim.y, aim.x);
    ctx.save(); ctx.translate(position.x, position.y); ctx.rotate(angle); ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.beginPath(); ctx.ellipse(0, 5, 22, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = uniformColor(uniform); ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 4, 16, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = actor === "player" ? "#263c38" : "#2d2527"; ctx.fillRect(-10, -4, 20, 13); ctx.fillStyle = "#10191a"; ctx.beginPath(); ctx.arc(0, -8, 11, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = accent; ctx.stroke(); ctx.fillStyle = "#8db3a3"; ctx.fillRect(-7, -9, 14, 3); const barrel = weapon === "sniper" ? 42 : weapon === "smg" ? 25 : 33; ctx.fillStyle = "#172321"; ctx.fillRect(8, -2, barrel, 5); ctx.fillStyle = accent; ctx.fillRect(14, -1, 12, 2); if (weapon === "sniper") { ctx.fillStyle = "#758a7a"; ctx.fillRect(18, -7, 12, 3); } if (weapon === "smg") { ctx.fillStyle = "#516e5d"; ctx.fillRect(13, 2, 4, 8); } ctx.restore(); ctx.fillStyle = accent; ctx.font = "800 11px Arial"; ctx.textAlign = "center"; ctx.fillText(name.slice(0, 14), position.x, position.y - 28);
  };

  const visionPath = (s: Runtime) => { const path = new Path2D(); const origin = s.player; const radius = 260; const spread = 0.58; const rays = 56; path.moveTo(origin.x, origin.y); for (let i = 0; i <= rays; i += 1) { const angle = Math.atan2(s.aim.y, s.aim.x) - spread + (spread * 2 * i / rays); const direction = { x: Math.cos(angle), y: Math.sin(angle) }; let length = radius; for (let step = 10; step <= radius; step += 10) { const point = { x: origin.x + direction.x * step, y: origin.y + direction.y * step }; if (blocked(point, 2)) { length = step; break; } } path.lineTo(origin.x + direction.x * length, origin.y + direction.y * length); } path.closePath(); path.moveTo(origin.x + 92, origin.y); path.arc(origin.x, origin.y, 92, 0, Math.PI * 2); return path; };
  const visibleToPlayer = (s: Runtime, position: Vec) => distance(s.player, position) <= 92 || (distance(s.player, position) <= 260 && Math.abs(Math.atan2(position.y - s.player.y, position.x - s.player.x) - Math.atan2(s.aim.y, s.aim.x)) < .6 && hasLineOfSight(s.player, position));

  const drawScene = (ctx: CanvasRenderingContext2D, s: Runtime, visibleOnly: boolean) => {
    const bg = ctx.createLinearGradient(0, 0, WORLD.w, WORLD.h); bg.addColorStop(0, "#22312e"); bg.addColorStop(1, "#091110"); ctx.fillStyle = bg; ctx.fillRect(0, 0, WORLD.w, WORLD.h); ctx.globalAlpha = .18; ctx.strokeStyle = "#9eaf9f"; ctx.lineWidth = 1; for (let x = 20; x < WORLD.w; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.h); ctx.stroke(); } for (let y = 18; y < WORLD.h; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.w, y); ctx.stroke(); } ctx.globalAlpha = 1;
    obstacles.forEach((box) => { ctx.fillStyle = box.kind === "wood" ? "#68442d" : "#4a5a58"; ctx.strokeStyle = box.kind === "wood" ? "#bd7a46" : "#9bad9f"; ctx.lineWidth = 2; ctx.fillRect(box.x, box.y, box.w, box.h); ctx.strokeRect(box.x, box.y, box.w, box.h); ctx.fillStyle = "rgba(8,14,13,.28)"; for (let i = box.x + 8; i < box.x + box.w; i += 22) ctx.fillRect(i, box.y + 5, 8, box.h - 10); ctx.fillStyle = "#c4d0c0"; ctx.font = "700 9px Arial"; ctx.textAlign = "left"; ctx.fillText(box.label, box.x + 8, box.y - 6); });
    ctx.strokeStyle = "#d1b66b"; ctx.setLineDash([10, 7]); ctx.strokeRect(12, 12, WORLD.w - 24, WORLD.h - 24); ctx.setLineDash([]);
    s.bullets.forEach((bullet) => { if (visibleOnly && bullet.team === "enemy" && !visibleToPlayer(s, bullet.position)) return; ctx.fillStyle = bullet.team === "player" ? "#d8fff0" : "#ff9e88"; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(bullet.position.x, bullet.position.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; });
    drawOperator(ctx, s.player, "player", loadout.uniform, loadout.weapon, s.aim, loadout.operatorName);
    s.enemies.forEach((enemy) => { if (!visibleOnly || visibleToPlayer(s, enemy.position)) drawOperator(ctx, enemy.position, "enemy", enemy.uniform, enemy.weapon, { x: s.player.x - enemy.position.x, y: s.player.y - enemy.position.y }, enemy.name); });
    ctx.fillStyle = "#101817"; ctx.fillRect(s.player.x - 24, s.player.y + 22, 48, 5); ctx.fillStyle = s.hp > 35 ? "#59ddc7" : "#ef6470"; ctx.fillRect(s.player.x - 24, s.player.y + 22, 48 * (s.hp / 100), 5);
  };

  const draw = (ctx: CanvasRenderingContext2D, dpr: number, viewW: number, viewH: number) => {
    const s = runtime.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, viewW, viewH);
    ctx.save(); applyCamera(ctx, viewW, viewH); drawScene(ctx, s, false); ctx.restore();
    ctx.fillStyle = "rgba(0,0,0,.985)"; ctx.fillRect(0, 0, viewW, viewH);
    ctx.save(); applyCamera(ctx, viewW, viewH); ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = "white"; ctx.fill(visionPath(s)); ctx.beginPath(); ctx.arc(s.player.x, s.player.y, 92, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.save(); applyCamera(ctx, viewW, viewH); ctx.globalCompositeOperation = "destination-over"; ctx.clip(visionPath(s)); drawScene(ctx, s, true); ctx.restore(); ctx.globalCompositeOperation = "source-over";
  };

  const finish = (victory: boolean) => { if (!runtime.current.running) return; runtime.current.running = false; onFinish({ victory, shots: runtime.current.shots, hits: runtime.current.hits, seconds: Math.round((performance.now() - runtime.current.started) / 1000), rounds: Math.max(1, Math.round((performance.now() - runtime.current.started) / 30000)) }); };
  const fire = () => { const s = runtime.current; if (!s.running || !fireReady) return; setFireReady(false); s.shots += 1; setShotCount(s.shots); const direction = normalize(s.aim); s.bullets.push({ id: s.nextBulletId++, position: { x: s.player.x + direction.x * 23, y: s.player.y + direction.y * 23 }, velocity: { x: direction.x * 620, y: direction.y * 620 }, team: "player", damage: 100, ttl: 1.8, sourceId: "player" }); s.enemies.forEach((enemy) => { if (distance(enemy.position, s.player) < 390) enemy.alerted = true; }); tacticalAudio.fire(loadout.weapon); window.setTimeout(() => setFireReady(true), loadout.weapon === "smg" ? 180 : loadout.weapon === "sniper" ? 520 : 320); };

  useEffect(() => { const canvas = canvasRef.current; if (!canvas) return; tacticalAudio.startAmbient(); const context = canvas.getContext("2d"); if (!context) return; let viewW = 1; let viewH = 1; const resize = () => { const rect = canvas.getBoundingClientRect(); viewW = Math.max(1, rect.width); viewH = Math.max(1, rect.height); const dpr = window.devicePixelRatio || 1; canvas.width = Math.round(viewW * dpr); canvas.height = Math.round(viewH * dpr); }; resize(); const observer = new ResizeObserver(resize); observer.observe(canvas); const frame = { current: 0 }; let last = performance.now(); const loop = (now: number) => { const dt = Math.min(.05, (now - last) / 1000); last = now; const s = runtime.current; if (s.running) {
      const speed = loadout.weapon === "smg" ? 190 : loadout.weapon === "sniper" ? 130 : 160; const previousPlayer = s.player; s.player = moveWithCollision(s.player, { x: s.joystick.x * speed * dt, y: s.joystick.y * speed * dt }); if (distance(previousPlayer, s.player) > .3) tacticalAudio.step();
      s.enemies.forEach((enemy) => { const toPlayer = { x: s.player.x - enemy.position.x, y: s.player.y - enemy.position.y }; const dist = Math.hypot(toPlayer.x, toPlayer.y); const seesPlayer = dist < 560 && hasLineOfSight(enemy.position, s.player); if (seesPlayer) enemy.alerted = true; const target = enemy.patrol[enemy.patrolIndex]; const patrolDirection = normalize({ x: target.x - enemy.position.x, y: target.y - enemy.position.y }); const chaseDirection = normalize(toPlayer); const direction = enemy.alerted ? chaseDirection : patrolDirection; const speedEnemy = enemy.weapon === "smg" ? 95 : enemy.weapon === "sniper" ? 36 : 62; const moveDirection = enemy.alerted && enemy.weapon === "sniper" ? { x: -chaseDirection.x, y: -chaseDirection.y } : direction; enemy.position = moveWithCollision(enemy.position, { x: moveDirection.x * speedEnemy * dt, y: moveDirection.y * speedEnemy * dt }); enemy.aim = toPlayer; if (!enemy.alerted && distance(enemy.position, target) < 22) enemy.patrolIndex = (enemy.patrolIndex + 1) % enemy.patrol.length; enemy.cooldown -= dt; if (enemy.alerted && seesPlayer && enemy.cooldown <= 0) { enemy.cooldown = enemy.weapon === "smg" ? .72 : enemy.weapon === "sniper" ? 2.1 : 1.25; const aim = normalize({ x: s.player.x - enemy.position.x, y: s.player.y - enemy.position.y }); s.bullets.push({ id: s.nextBulletId++, position: { x: enemy.position.x + aim.x * 23, y: enemy.position.y + aim.y * 23 }, velocity: { x: aim.x * 400, y: aim.y * 400 }, team: "enemy", damage: enemy.weapon === "sniper" ? 45 : enemy.weapon === "smg" ? 22 : 30, ttl: 2.4, sourceId: enemy.id }); tacticalAudio.fire(enemy.weapon); } });
      const nextBullets: Bullet[] = []; for (const bullet of s.bullets) { let alive = true; const steps = Math.max(1, Math.ceil((Math.hypot(bullet.velocity.x, bullet.velocity.y) * dt) / 8)); const step = { x: bullet.velocity.x * dt / steps, y: bullet.velocity.y * dt / steps }; for (let i = 0; i < steps && alive; i += 1) { bullet.position = { x: bullet.position.x + step.x, y: bullet.position.y + step.y }; bullet.ttl -= dt / steps; if (bullet.ttl <= 0 || blocked(bullet.position, 3)) { alive = false; continue; } if (bullet.team === "player") { const target = s.enemies.find((enemy) => distance(bullet.position, enemy.position) < PLAYER_R + 4); if (target) { alive = false; s.hits += 1; s.enemies = s.enemies.filter((enemy) => enemy.id !== target.id); setHostileCount(s.enemies.length); if (!s.enemies.length) finish(true); } } else if (distance(bullet.position, s.player) < PLAYER_R + 4) { alive = false; s.hp = Math.max(0, s.hp - bullet.damage); setHp(s.hp); tacticalAudio.miss(); if (s.hp <= 0) finish(false); } } if (alive) nextBullets.push(bullet); } s.bullets = nextBullets;
    } draw(context, window.devicePixelRatio || 1, viewW, viewH); frame.current = requestAnimationFrame(loop); }; frame.current = requestAnimationFrame(loop); return () => { cancelAnimationFrame(frame.current); observer.disconnect(); tacticalAudio.stopAmbient(); }; }, [loadout.weapon]);

  const updateJoystick = (event: React.PointerEvent<HTMLDivElement>) => { const rect = event.currentTarget.getBoundingClientRect(); const dx = event.clientX - (rect.left + rect.width / 2); const dy = event.clientY - (rect.top + rect.height / 2); const radius = rect.width * .38; const length = Math.min(radius, Math.hypot(dx, dy)); const angle = Math.atan2(dy, dx); runtime.current.joystick = { x: Math.cos(angle) * (length / radius), y: Math.sin(angle) * (length / radius) }; setJoystickActive(true); };
  const updateAim = (event: React.PointerEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(); const { scale, offsetX, offsetY } = getViewportTransform(rect.width, rect.height); const target = { x: (event.clientX - rect.left - offsetX) / scale, y: (event.clientY - rect.top - offsetY) / scale }; runtime.current.aim = normalize({ x: target.x - runtime.current.player.x, y: target.y - runtime.current.player.y }); };
  return <div className="realtime-arena"><canvas ref={canvasRef} className="realtime-canvas" onPointerMove={updateAim} onPointerDown={(event) => { updateAim(event); if (event.clientX > event.currentTarget.getBoundingClientRect().left + event.currentTarget.getBoundingClientRect().width * .48) fire(); }} aria-label="Arena top-down com fog of war" /><div className="realtime-hud"><span>HP <b>{hp}%</b></span><span>BBs <b>{shotCount}</b></span><span>HOSTIS <b>{hostileCount}</b></span><button type="button" onClick={() => { tacticalAudio.ui(); onExit(); }}>QG</button></div><div className="joystick" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); joystickPointer.current = event.pointerId; updateJoystick(event); }} onPointerMove={(event) => { if (joystickPointer.current === event.pointerId) updateJoystick(event); }} onPointerUp={() => { joystickPointer.current = null; runtime.current.joystick = { x: 0, y: 0 }; setJoystickActive(false); }} onPointerCancel={() => { joystickPointer.current = null; runtime.current.joystick = { x: 0, y: 0 }; setJoystickActive(false); }}><div className={`joystick-knob ${joystickActive ? "active" : ""}`} /></div><button type="button" className="fire-control" onPointerDown={(event) => { event.stopPropagation(); fire(); }}>{fireReady ? "FIRE" : "READY"}</button><div className="realtime-hint">FOG OF WAR • FLASHLIGHT ATIVA</div></div>;
}
