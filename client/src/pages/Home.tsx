import { useEffect, useState } from "react";
import { AlertTriangle, BadgeCheck, Crosshair, Footprints, Radio, RotateCcw, Shield, Target, TimerReset, Zap } from "lucide-react";
import ArenaCanvas from "../components/ArenaCanvas";
import { fireBurst, fireSemi, initialGameState, movePlayer, aimPlayer, endPlayerTurn, previewMove, runEnemyTurn } from "../game/GameLogic";
import type { ActionId, Coord, GameState } from "../game/types";

function ShotReadout({ shot }: { shot: GameState["lastShot"] }) {
  if (!shot) return <span className="muted-readout">Aguardando comando de fogo</span>;
  return <span className={shot.hit ? "shot-hit" : "shot-miss"}>{shot.hit ? "HIT CONFIRMADO" : shot.pathBlocked ? "LINHA BLOQUEADA" : "DISPARO DESVIADO"} · {shot.chance}% precisão</span>;
}

export default function Home() {
  const demo = new URLSearchParams(window.location.search).has("demo");
  const [state, setState] = useState<GameState>(() => initialGameState());
  const [mode, setMode] = useState<ActionId>("move");
  const [moveArmed, setMoveArmed] = useState(false);
  const [hovered, setHovered] = useState<Coord | null>(null);
  const [shotPulse, setShotPulse] = useState(0);
  const [botPending, setBotPending] = useState(false);

  useEffect(() => {
    if (state.turn !== "enemy" || state.phase !== "resolving") return;
    setBotPending(true);
    const timeout = window.setTimeout(() => {
      setState((current) => runEnemyTurn(current));
      setBotPending(false);
      setMoveArmed(false);
    }, 680);
    return () => window.clearTimeout(timeout);
  }, [state.turn, state.phase]);

  useEffect(() => {
    if (!demo) return;
    const first = window.setTimeout(() => { setMode("move"); setMoveArmed(true); setState((current) => movePlayer(current, { x: 2, y: 6 })); }, 620);
    const second = window.setTimeout(() => { setMoveArmed(false); setState((current) => aimPlayer(current)); }, 1320);
    const third = window.setTimeout(() => { setMode("semi"); setState((current) => fireSemi(current)); setShotPulse((value) => value + 1); }, 2060);
    return () => { window.clearTimeout(first); window.clearTimeout(second); window.clearTimeout(third); };
  }, [demo]);

  const handleCellClick = (point: Coord) => {
    if (state.phase !== "active" || state.turn !== "player" || botPending) return;
    if (mode === "move" && moveArmed) setState((current) => movePlayer(current, point));
    else if (mode !== "move") setState((current) => previewMove(current, point));
  };

  const handleAction = (action: ActionId) => {
    setMode(action);
    if (action === "move") { setMoveArmed(true); return; }
    setMoveArmed(false);
    setHovered(null);
    if (action === "aim") setState((current) => aimPlayer(current));
    if (action === "semi") { setState((current) => fireSemi(current)); setShotPulse((value) => value + 1); }
    if (action === "burst") { setState((current) => fireBurst(current)); setShotPulse((value) => value + 1); }
  };

  const handleEndTurn = () => { setMoveArmed(false); setState((current) => endPlayerTurn(current)); };
  const handleRestart = () => { setMoveArmed(false); setHovered(null); setMode("move"); setState((current) => initialGameState(current.wins, current.losses)); };
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

      <section className="status-strip" aria-live="polite"><div className="status-title"><span className={`status-dot ${state.turn === "enemy" ? "enemy-dot" : state.phase === "ended" ? "ended-dot" : ""}`} />{turnText}</div><div className="round-label">ROUND {String(state.round).padStart(2, "0")} <span>•</span> SETOR 07</div></section>

      <section className="arena-panel">
        <div className="arena-heading"><div><p className="eyebrow">VISÃO TÁTICA / GRID 8×8</p><h2>WAREHOUSE <span>CQB</span></h2></div><div className="comms"><Radio size={15} /><span>LINK OK</span></div></div>
        <div className="arena-frame">
          <ArenaCanvas state={state} mode={mode} moveArmed={moveArmed} hovered={hovered} shotPulse={shotPulse} onCellClick={handleCellClick} onCellHover={(point) => setHovered(moveArmed ? point : null)} />
          <div className="arena-legend"><span><i className="legend-swatch player-swatch" /> ALFA-01</span><span><i className="legend-swatch enemy-swatch" /> HOSTIL-07</span><span><i className="legend-swatch cover-swatch" /> COBERTURA</span></div>
        </div>
        <div className="shot-readout"><Crosshair size={14} /><ShotReadout shot={state.lastShot} /></div>
      </section>

      <section className="command-panel">
        <div className="panel-topline"><div><p className="eyebrow">OPERADOR / ALFA-01</p><h3>COMMAND DECK</h3></div><div className="pa-readout"><span>PA</span><strong>{state.pa}</strong><small>/ {state.maxPa}</small></div></div>
        <div className="pa-bar" aria-label={`Pontos de ação: ${state.pa} de ${state.maxPa}`}><div style={{ width: `${(state.pa / state.maxPa) * 100}%` }} /></div>
        <div className="quick-actions">
          <button className={`action-card ${mode === "move" && moveArmed ? "active" : ""}`} disabled={!canAct} onClick={() => handleAction("move")}><span className="action-icon"><Footprints size={17} /></span><span><b>MOVER</b><small>1 PA / CASA</small></span><em>↗</em></button>
          <button className={`action-card ${mode === "aim" ? "active" : ""}`} disabled={actionDisabled(1)} onClick={() => handleAction("aim")}><span className="action-icon aim-icon"><Target size={17} /></span><span><b>MIRAR</b><small>+20% / 1 PA</small></span><em>+20</em></button>
          <button className={`action-card ${mode === "semi" ? "active" : ""}`} disabled={actionDisabled(2)} onClick={() => handleAction("semi")}><span className="action-icon"><Crosshair size={17} /></span><span><b>SEMI</b><small>1 BB / 2 PA</small></span><em>●</em></button>
          <button className={`action-card ${mode === "burst" ? "active" : ""}`} disabled={actionDisabled(3)} onClick={() => handleAction("burst")}><span className="action-icon burst-icon"><Zap size={17} /></span><span><b>RAJADA</b><small>3 BB / 3 PA</small></span><em>•••</em></button>
        </div>
        <div className="command-footer"><div className="instruction"><span className="instruction-dot" />{mode === "move" ? (moveArmed ? "Casas em alcance destacadas" : "Toque em MOVER para ativar o grid") : mode === "aim" ? "Mira estabilizada no próximo disparo" : "Alvo: HOSTIL-07 / linha tracejada"}</div><button className="end-turn" onClick={handleEndTurn} disabled={!canAct}><TimerReset size={15} /> ENCERRAR TURNO</button></div>
        <div className="combat-log"><span className="log-title">EVENT LOG</span>{state.log.map((entry, index) => <span key={`${entry}-${index}`} className={index === 0 ? "log-entry current-log" : "log-entry"}>{entry}</span>)}</div>
      </section>

      <footer className="footer-hint"><span><AlertTriangle size={12} /> COBERTURA REDUZ PRECISÃO</span><span>TOQUE PARA COMANDAR</span></footer>

      {state.phase === "ended" && <div className="result-overlay"><div className={`result-modal ${state.winner === "player" ? "victory" : "defeat"}`}><div className="result-kicker"><BadgeCheck size={16} /> AFTER ACTION REPORT</div><div className="result-stamp">HIT</div><h2>{state.winner === "player" ? "VITÓRIA" : "DERROTA"}</h2><p>{state.winner === "player" ? "Hostil-07 fora de combate. Setor assegurado." : "ALFA-01 atingido. Reorganize a equipe e tente novamente."}</p>{state.lastShot && <div className="result-stats"><span>PRECISÃO <b>{state.lastShot.chance}%</b></span><span>DISTÂNCIA <b>{state.lastShot.distance} casas</b></span><span>COBERTURA <b>-{state.lastShot.coverPenalty}%</b></span></div>}<button className="restart-button" onClick={handleRestart}><RotateCcw size={17} /> REINICIAR PARTIDA</button></div></div>}
    </main>
  );
}
