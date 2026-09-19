import type { GameState, Loadout, RivalProfile } from "./types";

export const PROFILE_STORAGE_KEY = "airsoft-tactical-arena.profile.v1";

export type RankId = "recruit" | "operator" | "veteran" | "master" | "elite";
export interface RankDefinition { id: RankId; label: string; minXp: number; maxXp: number | null; insignia: string; }
export interface CompetitiveProfile { xp: number; credits: number; seasonScore: number; matches: number; wins: number; losses: number; }
export interface MatchReport { outcome: "victory" | "defeat"; title: string; shots: number; accuracy: number; rounds: number; tacticalBonus: number; xp: number; credits: number; rivalName?: string; isChallenge?: boolean; rivalScore?: number; }
export interface LeaderboardEntry extends RivalProfile { rank: number; isPlayer?: boolean; }

export const RANKS: RankDefinition[] = [
  { id: "recruit", label: "RECRUTA", minXp: 0, maxXp: 200, insignia: "I" },
  { id: "operator", label: "OPERADOR", minXp: 201, maxXp: 500, insignia: "II" },
  { id: "veteran", label: "VETERANO", minXp: 501, maxXp: 1000, insignia: "III" },
  { id: "master", label: "MESTRE TÁTICO", minXp: 1001, maxXp: 2000, insignia: "IV" },
  { id: "elite", label: "OPERADOR ELITE", minXp: 2001, maxXp: null, insignia: "V" },
];

export const DEFAULT_PROFILE: CompetitiveProfile = { xp: 0, credits: 0, seasonScore: 0, matches: 0, wins: 0, losses: 0 };
export function readProfile(): CompetitiveProfile { try { const saved = window.localStorage.getItem(PROFILE_STORAGE_KEY); return saved ? { ...DEFAULT_PROFILE, ...(JSON.parse(saved) as Partial<CompetitiveProfile>) } : DEFAULT_PROFILE; } catch { return DEFAULT_PROFILE; } }
export function getRank(xp: number): RankDefinition { return [...RANKS].reverse().find((rank) => xp >= rank.minXp) ?? RANKS[0]; }
export function rankProgress(xp: number) { const rank = getRank(xp); if (rank.maxXp === null) return { rank, current: xp - rank.minXp, needed: null, percent: 100 }; const span = rank.maxXp - rank.minXp + 1; return { rank, current: Math.max(0, xp - rank.minXp), needed: span, percent: Math.min(100, Math.round(((xp - rank.minXp) / span) * 100)) }; }
export function tacticalBonusFor(state: GameState) { let bonus = 0; if (state.loadout.uniform === "all-black") bonus += 10; if (state.loadout.uniform === "woodland") bonus += 10; if (state.loadout.weapon === "sniper" && state.lastShot?.hit) bonus += 20; if (state.loadout.vest === "heavy") bonus += 5; if (state.isChallenge) bonus += 15; return bonus; }
export function createMatchReport(state: GameState): MatchReport { const victory = state.winner === "player"; const shots = state.shotsFired; const accuracy = shots > 0 ? Math.round((state.shotsHit / shots) * 100) : state.lastShot?.chance ?? 0; const tacticalBonus = tacticalBonusFor(state); const rounds = Math.max(1, state.round); const xp = (victory ? 120 : 35) + Math.min(70, rounds * 8) + tacticalBonus; const credits = (victory ? 85 : 25) + tacticalBonus * 2; return { outcome: victory ? "victory" : "defeat", title: victory && state.isChallenge ? `DESAFIO VENCIDO: VOCE ULTRAPASSOU ${state.enemyLoadout.operatorName}` : victory ? "ELIMINAÇÃO CONFIRMADA (VITÓRIA)" : "OPERADOR ABATIDO (HIT - DERROTA)", shots, accuracy, rounds, tacticalBonus, xp, credits, rivalName: state.enemyLoadout.operatorName, isChallenge: state.isChallenge, rivalScore: state.enemyLoadout.score }; }
export function applyMatchResult(profile: CompetitiveProfile, report: MatchReport): CompetitiveProfile { const earnedScore = report.outcome === "victory" ? 100 + report.tacticalBonus : 20; const challengeScore = report.outcome === "victory" && report.isChallenge ? Math.max(0, report.rivalScore ?? 0) : 0; return { ...profile, xp: profile.xp + report.xp, credits: profile.credits + report.credits, seasonScore: Math.max(profile.seasonScore + earnedScore, challengeScore), matches: profile.matches + 1, wins: profile.wins + (report.outcome === "victory" ? 1 : 0), losses: profile.losses + (report.outcome === "defeat" ? 1 : 0) }; }

const SIMULATED_OPERATORS: RivalProfile[] = [
  { operatorName: "RANGER-02", teamName: "BLACKWATER", patch: "◈", uniform: "woodland", vest: "heavy", weapon: "m4", rankLabel: "VETERANO", score: 980 },
  { operatorName: "MAVERICK", teamName: "TEAM SIX", patch: "✦", uniform: "all-black", vest: "heavy", weapon: "sniper", rankLabel: "VETERANO", score: 860 },
  { operatorName: "NOMAD", teamName: "GROM AIRSOFT", patch: "⬡", uniform: "multicam", vest: "light", weapon: "smg", rankLabel: "OPERADOR", score: 740 },
  { operatorName: "GHOST-11", teamName: "RED CELL", patch: "⚡", uniform: "all-black", vest: "heavy", weapon: "sniper", rankLabel: "OPERADOR", score: 625 },
  { operatorName: "VULTURE", teamName: "WOLFPACK", patch: "☢", uniform: "woodland", vest: "heavy", weapon: "m4", rankLabel: "OPERADOR", score: 540 },
  { operatorName: "COBRA-9", teamName: "DELTA BRAVO", patch: "✦", uniform: "multicam", vest: "light", weapon: "smg", rankLabel: "OPERADOR", score: 450 },
  { operatorName: "SPECTER", teamName: "NIGHT RAIDERS", patch: "◈", uniform: "all-black", vest: "heavy", weapon: "sniper", rankLabel: "RECRUTA", score: 360 },
  { operatorName: "BISON", teamName: "TASK FORCE 22", patch: "⬡", uniform: "woodland", vest: "heavy", weapon: "m4", rankLabel: "RECRUTA", score: 285 },
  { operatorName: "KRAKEN", teamName: "IRON FOX", patch: "⚡", uniform: "multicam", vest: "light", weapon: "smg", rankLabel: "RECRUTA", score: 190 },
  { operatorName: "OUTRIDER", teamName: "URBAN OPS", patch: "☢", uniform: "all-black", vest: "heavy", weapon: "m4", rankLabel: "RECRUTA", score: 120 },
];

export function buildLeaderboard(profile: CompetitiveProfile, loadout: Loadout): LeaderboardEntry[] { const entries: RivalProfile[] = [...SIMULATED_OPERATORS, { operatorName: loadout.operatorName || "ALFA-01", teamName: loadout.teamName || "NIGHTFALL", patch: loadout.patch, uniform: loadout.uniform, vest: loadout.vest, weapon: loadout.weapon, rankLabel: getRank(profile.xp).label, score: profile.seasonScore }]; return entries.sort((a, b) => b.score - a.score).slice(0, 10).map((entry, index) => ({ ...entry, rank: index + 1, isPlayer: entry.operatorName === loadout.operatorName && entry.teamName === loadout.teamName })); }
