import { useEffect, useState } from "react";
import { AlertTriangle, BadgeCheck, Crosshair, Footprints, Radio, RotateCcw, Shield, Target, TimerReset, Zap } from "lucide-react";
import ArenaCanvas from "../components/ArenaCanvas";
import { DEFAULT_LOADOUT, fireBurst, fireSemi, initialGameState, loadoutStats, movePlayer, aimPlayer, endPlayerTurn, previewMove, runEnemyTurn } from "../game/GameLogic";
import type { ActionId, Coord, GameState, Loadout, UniformId, VestId, WeaponId } from "../game/types";

type Screen = "hq" | "arena";

const uniformOptions: { id: UniformId; label: string; note: string; swatch: string }[] = [
  { id: "multicam", label: "MULTICAM", note: "Neutro / versátil", swatch: "multicam" },
  { id: "all-black", label: "ALL BLACK CQB", note: "+10% furtividade em mapas escuros", swatch: "all-black" },
  { id: "woodland", label: "WOODLAND", note: "+10% proteção à distância", swatch: "woodland" },
];
const vestOptions: { id: VestId; label: string; note: string }[] = [
  { id: "heavy", label: "PLATE CARRIER LEVE", note: "6 PA / turno • mais mobilidade" },
  { id: "heavy", label: "COLETE TÁTICO PESADO", note: "5 PA / turno • +4% estabilidade" },
];
const weaponOptions: { id: WeaponId; label: string; note: string; icon: string }[] = [
  { id: "m4", label: "AEG RIFLE M4", note: "Semi 2 PA • Rajada 3 PA", icon: "M4" },
  { id: "sniper", label: "SNIPER BOLT-ACTION", note: "95% base • 3 PA • sem rajada", icon: "S" },
  { id: "smg", label: "SUBMETRALHADORA / GBB", note: "Semi 1 PA • Rajada 2 PA", icon: "SMG" },
];

function LoadoutCard({ active, onClick, children, className = "" }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return <button type="button" className={`loadout-card ${active ? "selected" : ""} ${className}`} onClick={onClick}>{children}<span className="select-mark">{active ? "✓" : ""}</span></button>;
}

function Headquarters({ draft, setDraft, onEnter }: { draft: Loadout; setDraft: (loadout: Loadout) => void; onEnter: () => void }) {
  const patchOptions = ["☢", "✦", "⬡", "⚡", "◈"];
  const stats = loadoutStats(draft);
  return (
    <main className="hq-shell">
      <div className="scanline" />
      <header className="hq-header"><div className="brand-lockup"><div className="brand-mark"><Shield size={16} /></div><div><p className="eyebrow">AIRSOFT / CQB UNIT</p><h1>QUARTEL-GENERAL</h1></div></div><span className="hq-status"><span className="status-dot" /> STANDBY</span></header>
      <section className="hq-hero"><div><p className="eyebrow">OPERAÇÃO / SETOR 07</p><h2>MONTE SEU <span>OPERADOR</span></h2><p>Configure a célula antes de entrar no galpão. Cada escolha altera PA, alcance e sobrevivência.</p></div><div className="patch-preview"><span>{draft.patch}</span><small>{draft.teamName || "SEU CLÃ"}</small></div></section>
      <section className="hq-scroll">
        <div className="hq-section identity-section"><div className="section-heading"><span className="section-index">01</span><div><p className="eyebrow">IDENTIFICAÇÃO</p><h3>REGISTRO DO OPERADOR</h3></div></div><div className="field-grid"><label className="hq-field"><span>NOME DO OPERADOR</span><input value={draft.operatorName} maxLength={14} onChange={(event) => setDraft({ ...draft, operatorName: event.target.value.toUpperCase() })} placeholder="ALFA-01" /></label><label className="hq-field"><span>TIME / CLÃ DE AIRSOFT</span><input value={draft.teamName} maxLength={16} onChange={(event) => setDraft({ ...draft, teamName: event.target.value.toUpperCase() })} placeholder="NIGHTFALL" /></label></div><div className="patch-row"><span className="choice-label">PATCH / BRASÃO</span>{patchOptions.map((patch) => <button type="button" key={patch} className={`patch-choice ${draft.patch === patch ? "selected" : ""}`} onClick={() => setDraft({ ...draft, patch })}>{patch}</button>)}</div></div>
        <div className="hq-section"><div className="section-heading"><span className="section-index">02</span><div><p className="eyebrow">APARÊNCIA</p><h3>FARDAMENTO</h3></div></div><div className="loadout-grid uniform-grid">{uniformOptions.map((option) => <LoadoutCard key={option.id} active={draft.uniform === option.id} onClick={() => setDraft({ ...draft, uniform: option.id })}><span className={`uniform-swatch ${option.swatch}`} /><span className="card-copy"><b>{option.label}</b><small>{option.note}</small></span></LoadoutCard>)}</div></div>
        <div className="hq-section"><div className="section-heading"><span className="section-index">03</span><div><p className="eyebrow">PROTEÇÃO</p><h3>COLETE TÁTICO</h3></div><span className="impact-chip">PA {stats.maxPa}</span></div><div className="loadout-grid vest-grid"><LoadoutCard active={draft.vest === "light"} onClick={() => setDraft({ ...draft, vest: "light" })}><span className="gear-icon">6</span><span className="card-copy"><b>PLATE CARRIER LEVE</b><small>6 PA / turno • alta mobilidade</small></span></LoadoutCard><LoadoutCard active={draft.vest === "heavy"} onClick={() => setDraft({ ...draft, vest: "heavy" })}><span className="gear-icon heavy">5</span><span className="card-copy"><b>COLETE TÁTICO PESADO</b><small>5 PA / turno • +4% estabilidade</small></span></LoadoutCard></div></div>
        <div className="hq-section weapon-section"><div className="section-heading"><span className="section-index">04</span><div><p className="eyebrow">ARMAMENTO PRINCIPAL</p><h3>RÉPLICA PRIMÁRIA</h3></div></div><div className="loadout-grid weapon-grid">{weaponOptions.map((option) => <LoadoutCard key={option.id} active={draft.weapon === option.id} onClick={() => setDraft({ ...draft, weapon: option.id })}><span className="weapon-icon">{option.icon}</span><span className="card-copy"><b>{option.label}</b><small>{option.note}</small></span></LoadoutCard>)}</div></div>
      </section>
      <footer className="hq-footer"><span><Radio size={13} /> LINK DO QUARTEL ESTÁVEL</span><button type="button" className="enter-operation" onClick={onEnter} disabled={!draft.operatorName.trim() || !draft.teamName.trim()}><span>ENTRAR NA OPERAÇÃO</span><b>ARENA CQB ↗</b></button></footer>
    </main>
  );
}

function ShotReadout({ shot }: { shot: GameState["lastShot"] }) {
  if (!shot) return <span className="muted-readout">Aguardando comando de fogo</span>;
  return <span className={shot.hit ? "shot-hit" : "shot-miss"}>{shot.hit ? "HIT CONFIRMADO" : shot.pathBlocked ? "LINHA BLOQUEADA" : "DISPARO DESVIADO"} · {shot.chance}% precisão</span>;
}

function ArenaView({ state, setState, onBack }: { state: GameState; setState: React.Dispatch<React.SetStateAction<GameState>>; onBack: () => void }) {
  const demo = new URLSearchParams(window.location.search).has("demo");
  const [mode, setMode] = useState<ActionId>("move");
  const [moveArmed, setMoveArmed] = useState(false);
  const [hovered, setHovered] = useState<Coord | null>(null);
  const [shotPulse, setShotPulse] = useState(0);
  const [botPending, setBotPending] = useState(false);
  const stats = loadoutStats(state.loadout);

  useEffect(() => {
    if (state.turn !== "enemy" || state.phase !== "resolving") return;
    setBotPending(true);
    const timeout = window.setTimeout(() => { setState((current) => runEnemyTurn(current)); setBotPending(false); setMoveArmed(false); }, 680);
    return () => window.clearTimeout(timeout);
  }, [state.turn, state.phase, setState]);
  useEffect(() => {
    if (!demo) return;
    const first = window.setTimeout(() => { setMode("move"); setMoveArmed(true); setState((current) => movePlayer(current, { x: 2, y: 6 })); }, 620);
    const second = window.setTimeout(() => { setMoveArmed(false); setState((current) => aimPlayer(current)); }, 1320);
    const third = window.setTimeout(() => { setMode("semi"); setState((current) => fireSemi(current)); setShotPulse((value) => value + 1); }, 2060);
    return () => { window.clearTimeout(first); window.clearTimeout(second); window.clearTimeout(third); };
  }, [demo, setState]);

  const handleCellClick = (point: Coord) => {
    if (state.phase !== "active" || state.turn !== "player" || botPending) return;
    if (mode === "move" && moveArmed) setState((current) => movePlayer(current, point));
    else if (mode !== "move") setState((current) => previewMove(current, point));
  };
  const handleAction = (action: ActionId) => {
    setMode(action);
    if (action === "move") { setMoveArmed(true); return; }
    setMoveArmed(false); setHovered(null);
    if (action === "aim") setState((current) => aimPlayer(current));
    if (action === "semi") { setState((current) => fireSemi(current)); setShotPulse((value) => value + 1); }
    if (action === "burst" && stats.burstAvailable) { setState((current) => fireBurst(current)); setShotPulse((value) => value + 1); }
  };
  const handleEndTurn = () => { setMoveArmed(false); setState((current) => endPlayerTurn(current)); };
  const handleRestart = () => { setMoveArmed(false); setHovered(null); setMode("move"); setState((current) => initialGameState(current.wins, current.losses, current.loadout)); };
  const turnText = state.phase === "ended" ? "COMBATE ENCERRADO" : botPending ? "HOSTIL PROCESSANDO" : state.turn === "player" ? "SEU TURNO" : "TURNO HOSTIL";
  const canAct = state.phase === "active" && state.turn === "player" && !botPending;
  const actionDisabled = (cost: number) => !canAct || state.pa < cost;
  const semiLabel = state.loadout.weapon === "sniper" ? "SNIPER" : "SEMI";
  const semiCost = stats.semiCost;

  return <main className="game-shell arena-screen"><div className="scanline" /><header className="topbar"><div className="brand-lockup"><div className="brand-mark"><Shield size={16} /></div><div><p className="eyebrow">{state.loadout.patch} {state.loadout.teamName}</p><h1>TACTICAL ARENA</h1></div></div><div className="match-meta"><button type="button" className="hq-back" onClick={onBack}>QG</button><span className="rank-chip">{state.loadout.operatorName}</span><span className="score-chip"><span className="score-wins">W {String(state.wins).padStart(2, "0")}</span><span className="score-losses">L {String(state.losses).padStart(2, "0")}</span></span></div></header>
    <section className="status-strip" aria-live="polite"><div className="status-title"><span className={`status-dot ${state.turn === "enemy" ? "enemy-dot" : state.phase === "ended" ? "ended-dot" : ""}`} />{turnText}</div><div className="round-label">ROUND {String(state.round).padStart(2, "0")} <span>•</span> SETOR 07</div></section>
    <section className="arena-panel"><div className="arena-heading"><div><p className="eyebrow">{state.loadout.operatorName} / {state.loadout.teamName}</p><h2>WAREHOUSE <span>CQB</span></h2></div><div className="comms"><Radio size={15} /><span>LINK OK</span></div></div><div className="arena-frame"><ArenaCanvas state={state} mode={mode} moveArmed={moveArmed} hovered={hovered} shotPulse={shotPulse} onCellClick={handleCellClick} onCellHover={(point) => setHovered(moveArmed ? point : null)} /><div className="arena-legend"><span><i className="legend-swatch player-swatch" /> {state.loadout.operatorName}</span><span><i className="legend-swatch enemy-swatch" /> HOSTIL-07</span><span><i className="legend-swatch cover-swatch" /> COBERTURA</span></div></div><div className="shot-readout"><Crosshair size={14} /><ShotReadout shot={state.lastShot} /></div></section>
    <section className="command-panel"><div className="panel-topline"><div><p className="eyebrow">{state.loadout.teamName} / {state.loadout.weapon.toUpperCase()}</p><h3>COMMAND DECK</h3></div><div className="pa-readout"><span>PA</span><strong>{state.pa}</strong><small>/ {state.maxPa}</small></div></div><div className="pa-bar" aria-label={`Pontos de ação: ${state.pa} de ${state.maxPa}`}><div style={{ width: `${(state.pa / state.maxPa) * 100}%` }} /></div><div className="quick-actions"><button className={`action-card ${mode === "move" && moveArmed ? "active" : ""}`} disabled={!canAct} onClick={() => handleAction("move")}><span className="action-icon"><Footprints size={17} /></span><span><b>MOVER</b><small>1 PA / CASA</small></span><em>↗</em></button><button className={`action-card ${mode === "aim" ? "active" : ""}`} disabled={actionDisabled(1)} onClick={() => handleAction("aim")}><span className="action-icon aim-icon"><Target size={17} /></span><span><b>MIRAR</b><small>+20% / 1 PA</small></span><em>+20</em></button><button className={`action-card ${mode === "semi" ? "active" : ""}`} disabled={actionDisabled(semiCost)} onClick={() => handleAction("semi")}><span className="action-icon"><Crosshair size={17} /></span><span><b>{semiLabel}</b><small>1 BB / {semiCost} PA</small></span><em>●</em></button><button className={`action-card ${mode === "burst" ? "active" : ""}`} disabled={!stats.burstAvailable || actionDisabled(stats.burstCost)} onClick={() => handleAction("burst")}><span className="action-icon burst-icon"><Zap size={17} /></span><span><b>RAJADA</b><small>{stats.burstAvailable ? `3 BB / ${stats.burstCost} PA` : "BLOQUEADO"}</small></span><em>•••</em></button></div><div className="command-footer"><div className="instruction"><span className="instruction-dot" />{mode === "move" ? (moveArmed ? "Casas em alcance destacadas" : "Toque em MOVER para ativar o grid") : mode === "aim" ? "Mira estabilizada no próximo disparo" : "Alvo: HOSTIL-07 / linha tracejada"}</div><button className="end-turn" onClick={handleEndTurn} disabled={!canAct}><TimerReset size={15} /> ENCERRAR TURNO</button></div><div className="combat-log"><span className="log-title">EVENT LOG</span>{state.log.map((entry, index) => <span key={`${entry}-${index}`} className={index === 0 ? "log-entry current-log" : "log-entry"}>{entry}</span>)}</div></section><footer className="footer-hint"><span><AlertTriangle size={12} /> COBERTURA REDUZ PRECISÃO</span><span>TOQUE PARA COMANDAR</span></footer>
    {state.phase === "ended" && <div className="result-overlay"><div className={`result-modal ${state.winner === "player" ? "victory" : "defeat"}`}><div className="result-kicker"><BadgeCheck size={16} /> AFTER ACTION REPORT</div><div className="result-stamp">HIT</div><h2>{state.winner === "player" ? "VITÓRIA" : "DERROTA"}</h2><p>{state.winner === "player" ? "Hostil-07 fora de combate. Setor assegurado." : "ALFA-01 atingido. Reorganize a equipe e tente novamente."}</p>{state.lastShot && <div className="result-stats"><span>PRECISÃO <b>{state.lastShot.chance}%</b></span><span>DISTÂNCIA <b>{state.lastShot.distance} casas</b></span><span>COBERTURA <b>-{state.lastShot.coverPenalty}%</b></span></div>}<button className="restart-button" onClick={handleRestart}><RotateCcw size={17} /> REINICIAR PARTIDA</button></div></div>}</main>;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("hq");
  const [draft, setDraft] = useState<Loadout>(DEFAULT_LOADOUT);
  const [state, setState] = useState<GameState>(() => initialGameState(0, 0, DEFAULT_LOADOUT));
  const enterArena = () => { const next = { ...draft, operatorName: draft.operatorName.trim().toUpperCase(), teamName: draft.teamName.trim().toUpperCase() }; setDraft(next); setState((current) => initialGameState(current.wins, current.losses, next)); setScreen("arena"); };
  if (screen === "hq") return <Headquarters draft={draft} setDraft={setDraft} onEnter={enterArena} />;
  return <ArenaView state={state} setState={setState} onBack={() => setScreen("hq")} />;
}
