import { useEffect, useRef, useState } from "react";
import type { Loadout, RivalProfile, UniformId, WeaponId } from "../game/types";
import { tacticalAudio } from "../lib/tacticalAudio";

export interface RealtimeResult { victory: boolean; shots: number; hits: number; seconds: number; rounds: number; }
interface Props { loadout: Loadout; rival: RivalProfile; onFinish: (result: RealtimeResult) => void; onExit: () => void; }
type Vec = { x: number; y: number };
type Runtime = { player: Vec; enemy: Vec; aim: Vec; joystick: Vec; shots: number; hits: number; started: number; fireCooldown: number; enemyCooldown: number; running: boolean; }

const WORLD = { w: 960, h: 620 };
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

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const circleHitsRect = (p: Vec, r: number, box: typeof obstacles[number]) => { const x = clamp(p.x, box.x, box.x + box.w); const y = clamp(p.y, box.y, box.y + box.h); return Math.hypot(p.x - x, p.y - y) < r; };
const blocked = (p: Vec) => p.x < PLAYER_R || p.y < PLAYER_R || p.x > WORLD.w - PLAYER_R || p.y > WORLD.h - PLAYER_R || obstacles.some((box) => circleHitsRect(p, PLAYER_R, box));
const moveWithCollision = (from: Vec, delta: Vec) => { const xTry = { x: from.x + delta.x, y: from.y }; const yTry = { x: from.x, y: from.y + delta.y }; const both = { x: from.x + delta.x, y: from.y + delta.y }; if (!blocked(both)) return both; if (!blocked(xTry)) return xTry; if (!blocked(yTry)) return yTry; return from; };
const uniformColor = (uniform: UniformId) => uniform === "all-black" ? "#182323" : uniform === "woodland" ? "#435a3d" : "#657450";

export default function RealtimeArenaCanvas({ loadout, rival, onFinish, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<Runtime>({ player: { x: 150, y: 270 }, enemy: { x: 790, y: 320 }, aim: { x: 1, y: 0 }, joystick: { x: 0, y: 0 }, shots: 0, hits: 0, started: performance.now(), fireCooldown: 0, enemyCooldown: 1.5, running: true });
  const [joystickActive, setJoystickActive] = useState(false);
  const [fireReady, setFireReady] = useState(true);
  const joystickPointer = useRef<number | null>(null);
  const scaleRef = useRef({ x: 1, y: 1 });

  const drawOperator = (ctx: CanvasRenderingContext2D, position: Vec, actor: "player" | "enemy", uniform: UniformId, weapon: WeaponId, aim: Vec, name: string) => {
    const accent = actor === "player" ? "#59ddc7" : "#ef6470";
    const angle = Math.atan2(aim.y, aim.x);
    ctx.save(); ctx.translate(position.x, position.y); ctx.rotate(angle);
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.beginPath(); ctx.ellipse(0, 5, 22, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = uniformColor(uniform); ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 4, 16, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = actor === "player" ? "#263c38" : "#2d2527"; ctx.fillRect(-10, -4, 20, 13);
    ctx.fillStyle = "#10191a"; ctx.beginPath(); ctx.arc(0, -8, 11, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = accent; ctx.stroke();
    ctx.fillStyle = "#8db3a3"; ctx.fillRect(-7, -9, 14, 3);
    const barrel = weapon === "sniper" ? 42 : weapon === "smg" ? 25 : 33; ctx.fillStyle = "#172321"; ctx.fillRect(8, -2, barrel, 5); ctx.fillStyle = accent; ctx.fillRect(14, -1, 12, 2);
    if (weapon === "sniper") { ctx.fillStyle = "#758a7a"; ctx.fillRect(18, -7, 12, 3); }
    if (weapon === "smg") { ctx.fillStyle = "#516e5d"; ctx.fillRect(13, 2, 4, 8); }
    ctx.restore();
    ctx.fillStyle = accent; ctx.font = "800 11px Arial"; ctx.textAlign = "center"; ctx.fillText(name.slice(0, 14), position.x, position.y - 28);
  };

  const draw = (ctx: CanvasRenderingContext2D, dpr: number) => {
    const s = runtime.current; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, WORLD.w, WORLD.h);
    const bg = ctx.createLinearGradient(0, 0, WORLD.w, WORLD.h); bg.addColorStop(0, "#22312e"); bg.addColorStop(1, "#091110"); ctx.fillStyle = bg; ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    ctx.globalAlpha = .18; ctx.strokeStyle = "#9eaf9f"; ctx.lineWidth = 1; for (let x = 20; x < WORLD.w; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.h); ctx.stroke(); } for (let y = 18; y < WORLD.h; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.w, y); ctx.stroke(); } ctx.globalAlpha = 1;
    obstacles.forEach((box) => { ctx.fillStyle = box.kind === "wood" ? "#68442d" : "#4a5a58"; ctx.strokeStyle = box.kind === "wood" ? "#bd7a46" : "#9bad9f"; ctx.lineWidth = 2; ctx.fillRect(box.x, box.y, box.w, box.h); ctx.strokeRect(box.x, box.y, box.w, box.h); ctx.fillStyle = "rgba(8,14,13,.28)"; for (let i = box.x + 8; i < box.x + box.w; i += 22) ctx.fillRect(i, box.y + 5, 8, box.h - 10); ctx.fillStyle = "#c4d0c0"; ctx.font = "700 9px Arial"; ctx.textAlign = "left"; ctx.fillText(box.label, box.x + 8, box.y - 6); });
    ctx.strokeStyle = "#d1b66b"; ctx.setLineDash([10, 7]); ctx.strokeRect(12, 12, WORLD.w - 24, WORLD.h - 24); ctx.setLineDash([]);
    drawOperator(ctx, s.player, "player", loadout.uniform, loadout.weapon, s.aim, loadout.operatorName);
    const enemyAim = { x: s.player.x - s.enemy.x, y: s.player.y - s.enemy.y }; drawOperator(ctx, s.enemy, "enemy", rival.uniform, rival.weapon, enemyAim, rival.operatorName);
    ctx.fillStyle = "rgba(4,10,9,.8)"; ctx.fillRect(18, 24, 185, 26); ctx.fillStyle = "#70dfc9"; ctx.font = "800 11px Arial"; ctx.textAlign = "left"; ctx.fillText(`LIVE CQB  •  ${rival.weapon.toUpperCase()} THREAT`, 30, 41);
  };

  const finish = (victory: boolean) => { if (!runtime.current.running) return; runtime.current.running = false; onFinish({ victory, shots: runtime.current.shots, hits: runtime.current.hits, seconds: Math.round((performance.now() - runtime.current.started) / 1000), rounds: Math.max(1, Math.round((performance.now() - runtime.current.started) / 30000)) }); };
  const fire = () => { const s = runtime.current; if (!s.running || !fireReady) return; setFireReady(false); s.shots += 1; const hitChance = loadout.weapon === "sniper" ? .82 : loadout.weapon === "smg" ? .58 : .68; if (distance(s.player, s.enemy) < (loadout.weapon === "sniper" ? 500 : 310) && Math.random() < hitChance) { s.hits += 1; finish(true); } else { setTimeout(() => setFireReady(true), loadout.weapon === "smg" ? 180 : 360); } tacticalAudio.fire(loadout.weapon); };

  useEffect(() => { const canvas = canvasRef.current; if (!canvas) return; const dpr = window.devicePixelRatio || 1; canvas.width = WORLD.w * dpr; canvas.height = WORLD.h * dpr; const context = canvas.getContext("2d"); if (!context) return; const frame = { current: 0 }; let last = performance.now(); const loop = (now: number) => { const dt = Math.min(.05, (now - last) / 1000); last = now; const s = runtime.current; if (s.running) { const speed = loadout.weapon === "smg" ? 190 : loadout.weapon === "sniper" ? 130 : 160; s.player = moveWithCollision(s.player, { x: s.joystick.x * speed * dt, y: s.joystick.y * speed * dt }); const delta = { x: s.player.x - s.enemy.x, y: s.player.y - s.enemy.y }; const len = Math.max(1, Math.hypot(delta.x, delta.y)); const enemySpeed = rival.weapon === "smg" ? 92 : rival.weapon === "sniper" ? 34 : 60; const enemyMove = rival.weapon === "sniper" ? { x: -delta.x / len * enemySpeed * dt, y: -delta.y / len * enemySpeed * dt } : { x: delta.x / len * enemySpeed * dt, y: delta.y / len * enemySpeed * dt }; s.enemy = moveWithCollision(s.enemy, enemyMove); s.enemyCooldown -= dt; if (s.enemyCooldown <= 0 && distance(s.player, s.enemy) < 290) { s.enemyCooldown = rival.weapon === "smg" ? 1.2 : 2.4; if (Math.random() < (rival.weapon === "sniper" ? .18 : .3)) finish(false); } } draw(context, dpr); frame.current = requestAnimationFrame(loop); }; frame.current = requestAnimationFrame(loop); return () => cancelAnimationFrame(frame.current); }, [loadout.weapon, rival.weapon]);

  const updateJoystick = (event: React.PointerEvent<HTMLDivElement>) => { const rect = event.currentTarget.getBoundingClientRect(); const dx = event.clientX - (rect.left + rect.width / 2); const dy = event.clientY - (rect.top + rect.height / 2); const radius = rect.width * .38; const length = Math.min(radius, Math.hypot(dx, dy)); const angle = Math.atan2(dy, dx); runtime.current.joystick = { x: Math.cos(angle) * (length / radius), y: Math.sin(angle) * (length / radius) }; setJoystickActive(true); };
  return <div className="realtime-arena"><canvas ref={canvasRef} className="realtime-canvas" onPointerMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); runtime.current.aim = { x: event.clientX - (rect.left + rect.width / 2), y: event.clientY - (rect.top + rect.height / 2) }; }} onPointerDown={(event) => { if (event.clientX > event.currentTarget.getBoundingClientRect().left + event.currentTarget.getBoundingClientRect().width * .48) fire(); }} aria-label="Arena top-down em tempo real" /><div className="realtime-hud"><span>POSIÇÃO <b>{Math.round(runtime.current.player.x)} / {Math.round(runtime.current.player.y)}</b></span><span>BBs <b>{runtime.current.shots}</b></span><button type="button" onClick={() => { tacticalAudio.ui(); onExit(); }}>QG</button></div><div className="joystick" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); joystickPointer.current = event.pointerId; updateJoystick(event); }} onPointerMove={(event) => { if (joystickPointer.current === event.pointerId) updateJoystick(event); }} onPointerUp={() => { joystickPointer.current = null; runtime.current.joystick = { x: 0, y: 0 }; setJoystickActive(false); }} onPointerCancel={() => { joystickPointer.current = null; runtime.current.joystick = { x: 0, y: 0 }; setJoystickActive(false); }}><div className={`joystick-knob ${joystickActive ? "active" : ""}`} /></div><button type="button" className="fire-control" onPointerDown={(event) => { event.stopPropagation(); fire(); }}>FIRE</button><div className="realtime-hint">ARRASTE O JOYSTICK • TOQUE NO MAPA PARA DISPARAR</div></div>;
}
