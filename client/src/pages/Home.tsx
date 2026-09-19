import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BadgeCheck, Crosshair, Footprints, Radio, RotateCcw, Shield, Target, TimerReset, Zap } from "lucide-react";
import { fireBurst, fireSemi, initialGameState, movePlayer, aimPlayer, endPlayerTurn, obstacleAt, previewMove, runEnemyTurn } from "../game/GameLogic";
import type { ActionId, Coord, GameState, Obstacle } from "../game/types";

const VIEW_W = 390;
const VIEW_H = 330;
const ORIGIN_X = 195;
const ORIGIN_Y = 32;
const HALF_W = 21;
const HALF_H = 12;

const toScreen = (point: Coord) => ({ x: ORIGIN_X + (point.x - point.y) * HALF_W, y: ORIGIN_Y + (point.x + point.y) * HALF_H });
const diamondPoints = (point: Coord) => {
  const center = toScreen(point);
  return `${center.x},${center.y - HALF_H} ${center.x + HALF_W},${center.y} ${center.x},${center.y + HALF_H} ${center.x - HALF_W},${center.y}`;
};
const coordLabel = (point: Coord) => `${String.fromCharCode(65 + point.x)}${point.y + 1}`;

function Cover({ obstacle }: { obstacle: Obstacle }) {
  const center = toScreen({ x: obstacle.x, y: obstacle.y });
  if (obstacle.type === "full") {
    return (
      <g className="cover cover-drum" aria-label="Tambor de cobertura total">
        <ellipse cx={center.x} cy={center.y - 10} rx="12" ry="5" fill="#3d4a42" stroke="#b56f3b" strokeWidth="1.5" />
        <path d={`M ${center.x - 12} ${center.y - 10} L ${center.x - 11} ${center.y + 7} Q ${center.x} ${center.y + 13} ${center.x + 11} ${center.y + 7} L ${center.x + 12} ${center.y - 10}`} fill="#28342f" stroke="#151e1b" strokeWidth="2" />
        <path d={`M ${center.x - 10} ${center.y - 5} Q ${center.x} ${center.y + 1} ${center.x + 10} ${center.y - 5}`} fill="none" stroke="#b56f3b" strokeWidth="2" opacity=".85" />
        <ellipse cx={center.x} cy={center.y - 10} rx="6" ry="2" fill="#17211d" opacity=".8" />
        <text x={center.x} y={center.y + 24} textAnchor="middle" className="svg-label cover-label">FULL • 70%</text>
      </g>
    );
  }
  return (
    <g className="cover cover-barricade" aria-label="Barricada de meia cobertura">
      <path d={`M ${center.x - 15} ${center.y + 7} L ${center.x - 12} ${center.y - 9} L ${center.x + 12} ${center.y - 9} L ${center.x + 15} ${center.y + 7} Z`} fill="#6a432c" stroke="#2b211b" strokeWidth="2" />
      <path d={`M ${center.x - 12} ${center.y - 9} L ${center.x - 6} ${center.y - 14} L ${center.x + 18} ${center.y - 14} L ${center.x + 12} ${center.y - 9} Z`} fill="#a96b3e" stroke="#2b211b" strokeWidth="1.5" />
      {[0, 1, 2].map((index) => <line key={index} x1={center.x - 9 + index * 8} y1={center.y - 9} x2={center.x - 11 + index * 9} y2={center.y + 6} stroke="#d39151" strokeWidth="2" opacity=".85" />)}
      <text x={center.x} y={center.y + 20} textAnchor="middle" className="svg-label cover-label">HALF • 40%</text>
    </g>
  );
}

function Operator({ kind, point, selected }: { kind: "player" | "enemy"; point: Coord; selected: boolean }) {
  const center = toScreen(point);
  const isPlayer = kind === "player";
  const color = isPlayer ? "#54d3c2" : "#ef5c67";
  const fill = isPlayer ? "#254f50" : "#5b272f";
  return (
    <g className={`operator operator-${kind} ${selected ? "operator-selected" : ""}`} aria-label={isPlayer ? "Operador do jogador" : "Operador inimigo"}>
      <ellipse cx={center.x} cy={center.y + 8} rx="11" ry="4" fill="#050807" opacity=".65" />
      <path d={`M ${center.x - 9} ${center.y + 5} Q ${center.x - 8} ${center.y - 4} ${center.x} ${center.y - 6} Q ${center.x + 8} ${center.y - 4} ${center.x + 9} ${center.y + 5} Z`} fill={fill} stroke={color} strokeWidth="1.5" />
      <circle cx={center.x} cy={center.y - 12} r="6" fill={color} stroke="#101713" strokeWidth="2" />
      <path d={`M ${center.x - 6} ${center.y - 14} Q ${center.x} ${center.y - 20} ${center.x + 7} ${center.y - 14}`} fill="none" stroke="#d6e0d2" strokeWidth="2" opacity=".8" />
      <line x1={center.x + (isPlayer ? 5 : -5)} y1={center.y - 1} x2={center.x + (isPlayer ? 15 : -15)} y2={center.y - 5} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={center.x} cy={center.y - 26} r="3" fill={color} />
      <text x={center.x} y={center.y - 30} textAnchor="middle" className="svg-label operator-label" fill={color}>{isPlayer ? "ALFA" : "HOSTIL"}</text>
    </g>
  );
}

function ShotReadout({ shot }: { shot: GameState["lastShot"] }) {
  if (!shot) return <span className="muted-readout">Aguardando comando de fogo</span>;
  return (
    <span className={shot.hit ? "shot-hit" : "shot-miss"}>
      {shot.hit ? "HIT CONFIRMADO" : shot.pathBlocked ? "LINHA BLOQUEADA" : "DISPARO DESVIADO"} · {shot.chance}% precisão
    </span>
  );
}

export default function Home() {
  const demo = new URLSearchParams(window.location.search).has("demo");
  const [state, setState] = useState<GameState>(() => initialGameState());
  const [mode, setMode] = useState<ActionId>("move");
  const [botPending, setBotPending] = useState(false);

  const obstacles = useMemo(() => [
    { id: "barricade-a", x: 3, y: 2, type: "half", label: "BARRICADA" },
    { id: "barricade-b", x: 4, y: 5, type: "half", label: "BARRICADA" },
    { id: "drum-a", x: 5, y: 3, type: "full", label: "TAMBOR" },
    { id: "drum-b", x: 2, y: 4, type: "full", label: "TAMBOR" },
  ] as Obstacle[], []);

  useEffect(() => {
    if (state.turn !== "enemy" || state.phase !== "resolving") return;
    setBotPending(true);
    const timeout = window.setTimeout(() => {
      setState((current) => runEnemyTurn(current));
      setBotPending(false);
    }, 680);
    return () => window.clearTimeout(timeout);
  }, [state.turn, state.phase]);

  useEffect(() => {
    if (!demo) return;
    const first = window.setTimeout(() => setState((current) => movePlayer(current, { x: 2, y: 6 })), 620);
    const second = window.setTimeout(() => setState((current) => aimPlayer(current)), 1320);
    const third = window.setTimeout(() => setState((current) => fireSemi(current)), 2060);
    return () => { window.clearTimeout(first); window.clearTimeout(second); window.clearTimeout(third); };
  }, [demo]);

  const selected = state.selectedCell;
  const currentPlayer = { x: state.player.x, y: state.player.y };
  const currentEnemy = { x: state.enemy.x, y: state.enemy.y };

  const handleCellClick = (point: Coord) => {
    if (state.phase !== "active" || state.turn !== "player" || botPending) return;
    if (mode === "move") setState((current) => movePlayer(current, point));
    else setState((current) => previewMove(current, point));
  };
  const handleAction = (action: ActionId) => {
    setMode(action);
    if (action === "aim") setState((current) => aimPlayer(current));
    if (action === "semi") setState((current) => fireSemi(current));
    if (action === "burst") setState((current) => fireBurst(current));
  };
  const handleEndTurn = () => setState((current) => endPlayerTurn(current));
  const handleRestart = () => setState((current) => initialGameState(current.wins, current.losses));

  const turnText = state.phase === "ended" ? "COMBATE ENCERRADO" : botPending ? "HOSTIL PROCESSANDO" : state.turn === "player" ? "SEU TURNO" : "TURNO HOSTIL";
  const canAct = state.phase === "active" && state.turn === "player" && !botPending;
  const actionDisabled = (cost: number) => !canAct || state.pa < cost;

  return (
    <main className="game-shell">
      <div className="scanline" />
      <header className="topbar">
        <div className="brand-lockup"><div className="brand-mark"><Shield size={16} /></div><div><p className="eyebrow">AIRSOFT / CQB UNIT</p><h1>TACTICAL ARENA</h1></div></div>
        <div className="match-meta"><span className="rank-chip">RECRUTA</span><span className="score-chip"><span className="score-wins">W {String(state.wins).padStart(2, "0")}</span><span className="score-losses">L {String(state.losses).padStart(2, "0")}</span></span></div>
      </header>

      <section className="status-strip" aria-live="polite">
        <div className="status-title"><span className={`status-dot ${state.turn === "enemy" ? "enemy-dot" : state.phase === "ended" ? "ended-dot" : ""}`} />{turnText}</div>
        <div className="round-label">ROUND {String(state.round).padStart(2, "0")} <span>•</span> SETOR 07</div>
      </section>

      <section className="arena-panel">
        <div className="arena-heading"><div><p className="eyebrow">VISÃO TÁTICA / GRID 8×8</p><h2>WAREHOUSE <span>CQB</span></h2></div><div className="comms"><Radio size={15} /><span>LINK OK</span></div></div>
        <div className="arena-frame">
          <svg className="arena-svg" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label="Arena isométrica de combate">
            <defs>
              <linearGradient id="floorGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#1d2b27" /><stop offset="100%" stopColor="#0d1514" /></linearGradient>
              <filter id="tileGlow"><feGaussianBlur stdDeviation="2" /></filter>
              <pattern id="floorLines" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 12L12 0" stroke="#b4cdb9" strokeOpacity=".025" strokeWidth="1" /></pattern>
            </defs>
            <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#floorGradient)" />
            <path d="M 195 20 L 342 116 L 195 212 L 48 116 Z" fill="#091110" stroke="#355047" strokeWidth="1.2" />
            <path d="M 195 20 L 342 116 L 195 212 L 48 116 Z" fill="url(#floorLines)" opacity=".9" />
            {Array.from({ length: 8 }).flatMap((_, y) => Array.from({ length: 8 }).map((__, x) => {
              const point = { x, y };
              const isPath = state.pathPreview.some((cell) => cell.x === x && cell.y === y);
              const isSelected = selected?.x === x && selected?.y === y;
              const blocked = Boolean(obstacleAt(point));
              return <g key={`${x}-${y}`} onClick={() => handleCellClick(point)} className={`grid-cell ${blocked ? "grid-blocked" : ""} ${isPath ? "grid-path" : ""} ${isSelected ? "grid-selected" : ""}`}>
                <polygon points={diamondPoints(point)} fill={isSelected ? "#3c786c" : isPath ? "#235044" : (x + y) % 2 ? "#182822" : "#14221e"} stroke={isPath || isSelected ? "#64dec4" : "#294239"} strokeWidth={isPath || isSelected ? "1.25" : ".65"} />
                <text x={toScreen(point).x} y={toScreen(point).y + 3} textAnchor="middle" className="cell-label">{coordLabel(point)}</text>
              </g>;
            }))}
            <line x1={toScreen(currentPlayer).x} y1={toScreen(currentPlayer).y} x2={toScreen(currentEnemy).x} y2={toScreen(currentEnemy).y} stroke={state.lastShot?.pathBlocked ? "#ef5c67" : "#5bc9bb"} strokeDasharray="3 4" strokeOpacity=".38" />
            {obstacles.map((obstacle) => <Cover key={obstacle.id} obstacle={obstacle} />)}
            <Operator kind="player" point={currentPlayer} selected={state.turn === "player"} />
            <Operator kind="enemy" point={currentEnemy} selected={state.turn === "enemy"} />
            <g className="north-marker"><path d="M 350 35 l 6 10 l -6 -3 l -6 3 z" fill="#68d7c4" /><text x="350" y="58" textAnchor="middle" className="svg-label">N</text></g>
          </svg>
          <div className="arena-legend"><span><i className="legend-swatch player-swatch" /> ALFA-01</span><span><i className="legend-swatch enemy-swatch" /> HOSTIL-07</span><span><i className="legend-swatch cover-swatch" /> COBERTURA</span></div>
        </div>
        <div className="shot-readout"><Crosshair size={14} /><ShotReadout shot={state.lastShot} /></div>
      </section>

      <section className="command-panel">
        <div className="panel-topline"><div><p className="eyebrow">OPERADOR / ALFA-01</p><h3>COMMAND DECK</h3></div><div className="pa-readout"><span>PA</span><strong>{state.pa}</strong><small>/ {state.maxPa}</small></div></div>
        <div className="pa-bar" aria-label={`Pontos de ação: ${state.pa} de ${state.maxPa}`}><div style={{ width: `${(state.pa / state.maxPa) * 100}%` }} /></div>
        <div className="quick-actions">
          <button className={`action-card ${mode === "move" ? "active" : ""}`} disabled={!canAct} onClick={() => setMode("move")}><span className="action-icon"><Footprints size={17} /></span><span><b>MOVER</b><small>1 PA / CASA</small></span><em>↗</em></button>
          <button className={`action-card ${mode === "aim" ? "active" : ""}`} disabled={actionDisabled(1)} onClick={() => handleAction("aim")}><span className="action-icon aim-icon"><Target size={17} /></span><span><b>MIRAR</b><small>+20% / 1 PA</small></span><em>+20</em></button>
          <button className={`action-card ${mode === "semi" ? "active" : ""}`} disabled={actionDisabled(2)} onClick={() => handleAction("semi")}><span className="action-icon"><Crosshair size={17} /></span><span><b>SEMI</b><small>1 BB / 2 PA</small></span><em>●</em></button>
          <button className={`action-card ${mode === "burst" ? "active" : ""}`} disabled={actionDisabled(3)} onClick={() => handleAction("burst")}><span className="action-icon burst-icon"><Zap size={17} /></span><span><b>RAJADA</b><small>3 BB / 3 PA</small></span><em>•••</em></button>
        </div>
        <div className="command-footer"><div className="instruction"><span className="instruction-dot" />{mode === "move" ? "Selecione uma casa alcançável" : mode === "aim" ? "Mira estabilizada no próximo disparo" : "Alvo: HOSTIL-07 / linha tracejada"}</div><button className="end-turn" onClick={handleEndTurn} disabled={!canAct}><TimerReset size={15} /> ENCERRAR TURNO</button></div>
        <div className="combat-log"><span className="log-title">EVENT LOG</span>{state.log.map((entry, index) => <span key={`${entry}-${index}`} className={index === 0 ? "log-entry current-log" : "log-entry"}>{entry}</span>)}</div>
      </section>

      <footer className="footer-hint"><span><AlertTriangle size={12} /> COBERTURA REDUZ PRECISÃO</span><span>TOQUE PARA COMANDAR</span></footer>

      {state.phase === "ended" && <div className="result-overlay"><div className={`result-modal ${state.winner === "player" ? "victory" : "defeat"}`}><div className="result-kicker"><BadgeCheck size={16} /> AFTER ACTION REPORT</div><div className="result-stamp">HIT</div><h2>{state.winner === "player" ? "VITÓRIA" : "DERROTA"}</h2><p>{state.winner === "player" ? "Hostil-07 fora de combate. Setor assegurado." : "ALFA-01 atingido. Reorganize a equipe e tente novamente."}</p>{state.lastShot && <div className="result-stats"><span>PRECISÃO <b>{state.lastShot.chance}%</b></span><span>DISTÂNCIA <b>{state.lastShot.distance} casas</b></span><span>COBERTURA <b>-{state.lastShot.coverPenalty}%</b></span></div>}<button className="restart-button" onClick={handleRestart}><RotateCcw size={17} /> REINICIAR PARTIDA</button></div></div>}
    </main>
  );
}
