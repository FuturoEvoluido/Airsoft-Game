import { useEffect, useRef, useState } from "react";
import { AlertTriangle, BadgeCheck, ChevronLeft, Crosshair, Crown, Footprints, Medal, Radio, RotateCcw, Shield, Target, TimerReset, Trophy, X, Zap } from "lucide-react";
import RealtimeArenaCanvas, { type RealtimeResult } from "../components/RealtimeArenaCanvas";
import { DEFAULT_LOADOUT, fireBurst, fireSemi, initialGameState, loadoutStats, movePlayer, aimPlayer, endPlayerTurn, previewMove, runEnemyTurn } from "../game/GameLogic";
import { applyMatchResult, buildLeaderboard, createMatchReport, getRank, rankProgress, readProfile, type CompetitiveProfile, type LeaderboardEntry, type MatchReport } from "../game/Progression";
import { tacticalAudio } from "../lib/tacticalAudio";
import type { ActionId, Coord, GameState, Loadout, UniformId, WeaponId } from "../game/types";

type Screen = "hq" | "arena";
const LOADOUT_STORAGE_KEY = "airsoft-tactical-arena.loadout.v1";

function readSavedLoadout(): Loadout {
  try { const saved = window.localStorage.getItem(LOADOUT_STORAGE_KEY); return saved ? { ...DEFAULT_LOADOUT, ...(JSON.parse(saved) as Partial<Loadout>) } : DEFAULT_LOADOUT; } catch { return DEFAULT_LOADOUT; }
}

const uniformOptions: { id: UniformId; label: string; note: string; swatch: string }[] = [
  { id: "multicam", label: "MULTICAM", note: "Neutro / versátil", swatch: "multicam" },
  { id: "all-black", label: "ALL BLACK CQB", note: "+10% furtividade em mapas escuros", swatch: "all-black" },
  { id: "woodland", label: "WOODLAND", note: "+10% proteção à distância", swatch: "woodland" },
];
const weaponOptions: { id: WeaponId; label: string; note: string; icon: string }[] = [
  { id: "m4", label: "AEG RIFLE M4", note: "Semi 2 PA • Rajada 3 PA", icon: "M4" },
  { id: "sniper", label: "SNIPER BOLT-ACTION", note: "95% base • 3 PA • sem rajada", icon: "S" },
  { id: "smg", label: "SUBMETRALHADORA / GBB", note: "Semi 1 PA • Rajada 2 PA", icon: "SMG" },
];

function LoadoutCard({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className={`loadout-card ${active ? "selected" : ""}`} onClick={() => { tacticalAudio.select(); onClick(); }}>{children}<span className="select-mark">{active ? "✓" : ""}</span></button>;
}

function AudioToggle() {
  const [muted, setMuted] = useState(tacticalAudio.isMuted);
  return <button type="button" className="audio-toggle" aria-label={muted ? "Ativar áudio" : "Silenciar áudio"} onClick={() => { const next = tacticalAudio.toggle(); setMuted(next); }}><span className={`audio-led ${muted ? "muted" : ""}`} />{muted ? "MUTE" : "AUDIO"}</button>;
}

function RankProgress({ profile, compact = false }: { profile: CompetitiveProfile; compact?: boolean }) {
  const progress = rankProgress(profile.xp);
  return <div className={`rank-progress ${compact ? "compact" : ""}`}><div className="rank-line"><span className="rank-insignia">{progress.rank.insignia}</span><div><b>{progress.rank.label}</b><small>{profile.xp} XP {progress.needed === null ? "• PATENTE MÁXIMA" : `• ${progress.needed - progress.current} XP para ${getRank(profile.xp + (progress.needed ?? 0) + 1).label}`}</small></div><strong>{profile.credits} CR</strong></div><div className="xp-track"><span style={{ width: `${progress.percent}%` }} /></div></div>;
}

function OperatorPreview({ loadout }: { loadout: Loadout }) {
  const uniform = loadout.uniform === "all-black" ? "#202827" : loadout.uniform === "woodland" ? "#40573d" : "#687450";
  const uniformLight = loadout.uniform === "all-black" ? "#394340" : loadout.uniform === "woodland" ? "#71805a" : "#a28f63";
  const vest = loadout.vest === "light" ? "#3b6354" : "#1e3030";
  const isSniper = loadout.weapon === "sniper";
  const isSmg = loadout.weapon === "smg";
  return <div className="operator-preview" aria-label="Pré-visualização do operador configurado"><svg viewBox="0 0 180 170" role="img" aria-label={`${loadout.operatorName || "Operador"} com ${loadout.weapon}`}><defs><radialGradient id="avatarHalo"><stop offset="0" stopColor="#54d3c2" stopOpacity=".26" /><stop offset="1" stopColor="#54d3c2" stopOpacity="0" /></radialGradient><linearGradient id="avatarFloor" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#10241d" /><stop offset=".5" stopColor="#395d49" /><stop offset="1" stopColor="#10241d" /></linearGradient></defs><ellipse cx="90" cy="73" rx="68" ry="61" fill="url(#avatarHalo)" /><ellipse cx="90" cy="146" rx="54" ry="9" fill="url(#avatarFloor)" opacity=".85" /><path d="M56 138 Q60 91 90 87 Q120 91 124 138 Z" fill={vest} stroke="#72b59a" strokeWidth="1.4" /><path d="M59 104 L76 99 L78 136 L60 136 Z M104 99 L121 104 L120 136 L102 136 Z" fill={uniform} opacity=".95" /><path d="M76 99 L90 108 L104 99 L102 138 L78 138 Z" fill={vest} stroke="#779e82" strokeWidth="1" /><rect x="81" y="112" width="18" height="14" rx="2" fill={uniformLight} opacity=".78" /><path d="M84 116 H96 M84 120 H96" stroke="#18221d" strokeWidth="1" opacity=".75" /><circle cx="90" cy="70" r="22" fill="#af876d" stroke="#121b19" strokeWidth="3" /><path d="M67 66 Q70 42 90 40 Q110 42 113 66 L108 61 Q90 55 72 61 Z" fill={uniform} stroke="#8da477" strokeWidth="1.4" /><path d="M70 62 Q90 52 110 62 L108 69 Q90 63 72 69 Z" fill="#17201d" /><path d="M75 68 H87 M93 68 H105" stroke="#a8d2c1" strokeWidth="3" opacity=".9" /><path d="M78 88 Q90 95 102 88" fill="none" stroke="#17211d" strokeWidth="4" /><path d="M60 112 L43 125 M120 112 L137 125" stroke={uniform} strokeWidth="10" strokeLinecap="round" /><g transform="translate(106 112) rotate(-8)"><rect x="0" y="-2" width={isSniper ? 58 : isSmg ? 29 : 42} height="5" rx="1" fill="#182321" /><rect x={isSniper ? 29 : isSmg ? 15 : 22} y="-5" width={isSniper ? 12 : 7} height="3" fill="#758a7a" />{isSniper && <rect x="28" y="-10" width="12" height="4" rx="1" fill="#273633" />}<path d="M8 3 L15 15 L23 15 L19 3" fill="#2e4a3e" /></g><circle cx="26" cy="40" r="10" fill="#14211d" stroke="#4b806b" /><text x="26" y="44" textAnchor="middle" fill="#7ee1ca" fontSize="11" fontWeight="800">{loadout.patch}</text><text x="90" y="158" textAnchor="middle" fill="#b9d8c8" fontSize="8" fontWeight="800" letterSpacing="1.4">{loadout.operatorName || "OPERADOR"}</text></svg><div className="operator-preview-meta"><span>{loadout.patch}</span><b>{loadout.teamName || "SEU CLÃ"}</b></div></div>;
}

function LeaderboardModal({ profile, loadout, onClose, onChallenge }: { profile: CompetitiveProfile; loadout: Loadout; onClose: () => void; onChallenge: (rival: LeaderboardEntry) => void }) {
  const rows = buildLeaderboard(profile, loadout);
  return <div className="leaderboard-overlay"><section className="leaderboard-modal"><header><div><p className="eyebrow">TEMPORADA / SETOR 07</p><h2>TABELA DE <span>OPERADORES</span></h2></div><button type="button" className="modal-close" onClick={onClose} aria-label="Fechar"><X size={16} /></button></header><div className="leaderboard-head"><span>#</span><span>OPERADOR / EQUIPE</span><span>ARMA / AÇÃO</span></div><div className="leaderboard-list">{rows.map((row) => <div className={`leaderboard-row ${row.isPlayer ? "player-row" : ""}`} key={`${row.operatorName}-${row.teamName}`}><b className="leaderboard-rank">{row.rank <= 3 ? <Medal size={13} /> : row.rank}</b><span><strong>{row.operatorName} <small className="leaderboard-rank-label">{row.rankLabel}</small></strong><small>{row.teamName} · {row.score} PTS</small></span><span className="leaderboard-action"><b className={`weapon-chip weapon-${row.weapon}`}>{row.weapon === "m4" ? "M4" : row.weapon === "sniper" ? "S" : "SMG"}</b>{!row.isPlayer && <button type="button" className="challenge-button" onClick={() => onChallenge(row)}>DESAFIAR</button>}</span></div>)}</div><footer><Trophy size={14} /> PONTUAÇÃO DE TEMPORADA: <b>{profile.seasonScore}</b></footer></section></div>;
}

function Headquarters({ draft, setDraft, profile, onEnter, onChallenge }: { draft: Loadout; setDraft: (loadout: Loadout) => void; profile: CompetitiveProfile; onEnter: () => void; onChallenge: (rival: LeaderboardEntry) => void }) {
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const patchOptions = ["☢", "✦", "⬡", "⚡", "◈"];
  const stats = loadoutStats(draft);
  return <main className="hq-shell"><div className="scanline" /><header className="hq-header"><div className="brand-lockup"><div className="brand-mark"><Shield size={16} /></div><div><p className="eyebrow">AIRSOFT / CQB UNIT</p><h1>QUARTEL-GENERAL</h1></div></div><div className="hq-header-actions"><AudioToggle /><span className="hq-status"><span className="status-dot" /> STANDBY</span></div></header><section className="hq-hero"><div className="hq-hero-copy"><p className="eyebrow">OPERAÇÃO / SETOR 07</p><h2>MONTE SEU <span>OPERADOR</span></h2><p>Configure a célula antes de entrar no galpão. Cada escolha altera PA, alcance e sobrevivência.</p><RankProgress profile={profile} compact /></div><OperatorPreview loadout={draft} /></section><section className="hq-scroll"><div className="hq-section identity-section"><div className="section-heading"><span className="section-index">01</span><div><p className="eyebrow">IDENTIFICAÇÃO</p><h3>REGISTRO DO OPERADOR</h3></div></div><div className="field-grid"><label className="hq-field"><span>NOME DO OPERADOR</span><input value={draft.operatorName} maxLength={14} onChange={(event) => { tacticalAudio.ui(); setDraft({ ...draft, operatorName: event.target.value.toUpperCase() }); }} placeholder="ALFA-01" /></label><label className="hq-field"><span>TIME / CLÃ DE AIRSOFT</span><input value={draft.teamName} maxLength={16} onChange={(event) => { tacticalAudio.ui(); setDraft({ ...draft, teamName: event.target.value.toUpperCase() }); }} placeholder="NIGHTFALL" /></label></div><div className="patch-row"><span className="choice-label">PATCH / BRASÃO</span>{patchOptions.map((patch) => <button type="button" key={patch} className={`patch-choice ${draft.patch === patch ? "selected" : ""}`} onClick={() => { tacticalAudio.select(); setDraft({ ...draft, patch }); }}>{patch}</button>)}</div></div><div className="hq-section"><div className="section-heading"><span className="section-index">02</span><div><p className="eyebrow">APARÊNCIA</p><h3>FARDAMENTO</h3></div></div><div className="loadout-grid uniform-grid">{uniformOptions.map((option) => <LoadoutCard key={option.id} active={draft.uniform === option.id} onClick={() => setDraft({ ...draft, uniform: option.id })}><span className={`uniform-swatch ${option.swatch}`} /><span className="card-copy"><b>{option.label}</b><small>{option.note}</small></span></LoadoutCard>)}</div></div><div className="hq-section"><div className="section-heading"><span className="section-index">03</span><div><p className="eyebrow">PROTEÇÃO</p><h3>COLETE TÁTICO</h3></div><span className="impact-chip">PA {stats.maxPa}</span></div><div className="loadout-grid vest-grid"><LoadoutCard active={draft.vest === "light"} onClick={() => setDraft({ ...draft, vest: "light" })}><span className="gear-icon">6</span><span className="card-copy"><b>PLATE CARRIER LEVE</b><small>6 PA / turno • alta mobilidade</small></span></LoadoutCard><LoadoutCard active={draft.vest === "heavy"} onClick={() => setDraft({ ...draft, vest: "heavy" })}><span className="gear-icon heavy">5</span><span className="card-copy"><b>COLETE TÁTICO PESADO</b><small>5 PA / turno • +4% estabilidade</small></span></LoadoutCard></div></div><div className="hq-section weapon-section"><div className="section-heading"><span className="section-index">04</span><div><p className="eyebrow">ARMAMENTO PRINCIPAL</p><h3>RÉPLICA PRIMÁRIA</h3></div></div><div className="loadout-grid weapon-grid">{weaponOptions.map((option) => <LoadoutCard key={option.id} active={draft.weapon === option.id} onClick={() => setDraft({ ...draft, weapon: option.id })}><span className="weapon-icon">{option.icon}</span><span className="card-copy"><b>{option.label}</b><small>{option.note}</small></span></LoadoutCard>)}</div></div></section><footer className="hq-footer"><button type="button" className="leaderboard-button" onClick={() => { tacticalAudio.ui(); setLeaderboardOpen(true); }}><Trophy size={13} /> TABELA DE OPERADORES</button><button type="button" className="enter-operation" onClick={() => { tacticalAudio.ui(); onEnter(); }} disabled={!draft.operatorName.trim() || !draft.teamName.trim()}><span>DESLOCAR PARA O COMBATE</span><b>(CQB) ↗</b></button></footer>{leaderboardOpen && <LeaderboardModal profile={profile} loadout={draft} onClose={() => { tacticalAudio.ui(); setLeaderboardOpen(false); }} onChallenge={(rival) => { tacticalAudio.ui(); setLeaderboardOpen(false); onChallenge(rival); }} />}</main>;
}

function ShotReadout({ shot }: { shot: GameState["lastShot"] }) { if (!shot) return <span className="muted-readout">Aguardando comando de fogo</span>; return <span className={shot.hit ? "shot-hit" : "shot-miss"}>{shot.hit ? "HIT CONFIRMADO" : shot.pathBlocked ? "LINHA BLOQUEADA" : "DISPARO DESVIADO"} · {shot.chance}% precisão</span>; }

function AfterActionReport({ report, onReplay, onHQ }: { report: MatchReport; onReplay: () => void; onHQ: () => void }) {
  const victory = report.outcome === "victory";
  return <div className="result-overlay"><div className={`result-modal aar-modal ${victory ? "victory" : "defeat"}`}><div className="result-kicker"><BadgeCheck size={16} /> AFTER ACTION REPORT</div><div className="result-stamp">{victory ? "AAR" : "HIT"}</div><h2>{report.title}</h2><p>{victory ? "Rival fora de combate. Setor assegurado." : "Operador atingido. Reorganize a equipe e tente novamente."}</p><div className="aar-metrics"><span><b>{report.shots}</b><small>DISPAROS</small></span><span><b>{report.accuracy}%</b><small>PRECISÃO FINAL</small></span><span><b>{report.rounds}</b><small>RODADAS</small></span><span><b>+{report.tacticalBonus}</b><small>BÔNUS TÁTICO</small></span></div><div className="aar-rewards"><span><Crown size={14} /> XP RECEBIDO <b>+{report.xp}</b></span><span><Medal size={14} /> CRÉDITOS TÁTICOS <b>+{report.credits}</b></span></div><div className="aar-actions"><button className="restart-button" onClick={onReplay}><RotateCcw size={15} /> JOGAR NOVAMENTE</button><button className="hq-return-button" onClick={onHQ}><ChevronLeft size={15} /> VOLTAR AO QUARTEL-GENERAL</button></div></div></div>;
}

function ArenaView({ state, setState, profile, setProfile, onBack }: { state: GameState; setState: React.Dispatch<React.SetStateAction<GameState>>; profile: CompetitiveProfile; setProfile: React.Dispatch<React.SetStateAction<CompetitiveProfile>>; onBack: () => void }) {
  const [report, setReport] = useState<MatchReport | null>(null);
  const rank = rankProgress(profile.xp);
  const rival = state.enemyLoadout;
  const handleFinish = (result: RealtimeResult) => {
    tacticalAudio.hit();
    const tacticalBonus = state.isChallenge ? 15 : 5;
    const matchReport: MatchReport = {
      outcome: result.victory ? "victory" : "defeat",
      title: result.victory && state.isChallenge ? `DESAFIO VENCIDO: VOCE ULTRAPASSOU ${rival.operatorName}` : result.victory ? "ELIMINAÇÃO CONFIRMADA (VITÓRIA)" : "OPERADOR ABATIDO (HIT - DERROTA)",
      shots: result.shots,
      accuracy: result.shots ? Math.round((result.hits / result.shots) * 100) : 0,
      rounds: result.rounds,
      tacticalBonus,
      xp: (result.victory ? 120 : 35) + tacticalBonus + Math.min(50, result.seconds),
      credits: (result.victory ? 85 : 25) + tacticalBonus,
      rivalName: rival.operatorName,
      isChallenge: state.isChallenge,
      rivalScore: rival.score,
    };
    setReport(matchReport);
    setProfile((current) => applyMatchResult(current, matchReport));
  };
  const restart = () => { tacticalAudio.ui(); setReport(null); setState(initialGameState(state.wins, state.losses, state.loadout, state.enemyLoadout)); };
  return <main className="game-shell immersive-arena"><div className="scanline" /><div className="immersive-topbar"><div className="immersive-identity"><span className="live-dot" /> <b>LIVE CQB</b><span>{state.loadout.operatorName} / {rival.operatorName}</span></div><div className="immersive-actions"><AudioToggle /><button type="button" className="immersive-exit" aria-label="Voltar ao Quartel-General" onClick={() => { tacticalAudio.ui(); onBack(); }}>×</button></div></div><RealtimeArenaCanvas key={`${state.enemyLoadout.operatorName}-${report ? "ended" : "live"}`} loadout={state.loadout} rival={rival} onFinish={handleFinish} onExit={onBack} /><div className="immersive-status"><span>{state.loadout.weapon.toUpperCase()} / 360°</span><span className="immersive-rival">HOSTIL: {rival.operatorName}</span></div>{report && <AfterActionReport report={report} onReplay={restart} onHQ={() => { tacticalAudio.ui(); onBack(); }} />}</main>;

}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("hq");
  const [draft, setDraft] = useState<Loadout>(() => readSavedLoadout());
  const [profile, setProfile] = useState<CompetitiveProfile>(() => readProfile());
  const [state, setState] = useState<GameState>(() => initialGameState(0, 0, readSavedLoadout()));
  useEffect(() => { window.localStorage.setItem(LOADOUT_STORAGE_KEY, JSON.stringify(draft)); }, [draft]);
  useEffect(() => { window.localStorage.setItem("airsoft-tactical-arena.profile.v1", JSON.stringify(profile)); }, [profile]);
  const enterArena = () => { const next = { ...draft, operatorName: draft.operatorName.trim().toUpperCase(), teamName: draft.teamName.trim().toUpperCase() }; setDraft(next); setState((current) => initialGameState(current.wins, current.losses, next)); setScreen("arena"); };
  const challengeRival = (rival: LeaderboardEntry) => { const next = { ...draft, operatorName: draft.operatorName.trim().toUpperCase(), teamName: draft.teamName.trim().toUpperCase() }; setDraft(next); setState((current) => initialGameState(current.wins, current.losses, next, rival)); setScreen("arena"); };
  if (screen === "hq") return <Headquarters draft={draft} setDraft={setDraft} profile={profile} onEnter={enterArena} onChallenge={challengeRival} />;
  return <ArenaView state={state} setState={setState} profile={profile} setProfile={setProfile} onBack={() => setScreen("hq")} />;
}
