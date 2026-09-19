import type { GameState, Loadout } from "./types";

export const PROFILE_STORAGE_KEY = "airsoft-tactical-arena.profile.v1";

export type RankId = "recruit" | "operator" | "veteran" | "master" | "elite";
export interface RankDefinition { id: RankId; label: string; minXp: number; maxXp: number | null; insignia: string; }
export interface CompetitiveProfile { xp: number; credits: number; seasonScore: number; matches: number; wins: number; losses: number; }
export interface MatchReport { outcome: "victory" | "defeat"; title: string; shots: number; accuracy: number; rounds: number; tacticalBonus: number; xp: number; credits: number; }
export interface LeaderboardEntry { rank: number; name: string; team: string; score: number; isPlayer?: boolean; }

export const RANKS: RankDefinition[] = [
  { id: "recruit", label: "RECRUTA", minXp: 0, maxXp: 200, insignia: "I" },
  { id: "operator", label: "OPERADOR", minXp: 201, maxXp: 500, insignia: "II" },
  { id: "veteran", label: "VETERANO", minXp: 501, maxXp: 1000, insignia: "III" },
  { id: "master", label: "MESTRE TÁTICO", minXp: 1001, maxXp: 2000, insignia: "IV" },
  { id: "elite", label: "OPERADOR ELITE", minXp: 2001, maxXp: null, insignia: "V" },
];

export const DEFAULT_PROFILE: CompetitiveProfile = { xp: 0, credits: 0, seasonScore: 0, matches: 0, wins: 0, losses: 0 };

export function readProfile(): CompetitiveProfile {
  try {
    const saved = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!saved) return DEFAULT_PROFILE;
    return { ...DEFAULT_PROFILE, ...(JSON.parse(saved) as Partial<CompetitiveProfile>) };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function getRank(xp: number): RankDefinition {
  return [...RANKS].reverse().find((rank) => xp >= rank.minXp) ?? RANKS[0];
}

export function rankProgress(xp: number) {
  const rank = getRank(xp);
  if (rank.maxXp === null) return { rank, current: xp - rank.minXp, needed: null, percent: 100 };
  const previousFloor = rank.minXp;
  const span = rank.maxXp - previousFloor + 1;
  return { rank, current: Math.max(0, xp - previousFloor), needed: span, percent: Math.min(100, Math.round(((xp - previousFloor) / span) * 100)) };
}

export function tacticalBonusFor(state: GameState) {
  let bonus = 0;
  if (state.loadout.uniform === "all-black") bonus += 10;
  if (state.loadout.uniform === "woodland") bonus += 10;
  if (state.loadout.weapon === "sniper" && state.lastShot?.hit) bonus += 20;
  if (state.loadout.vest === "heavy") bonus += 5;
  return bonus;
}

export function createMatchReport(state: GameState): MatchReport {
  const victory = state.winner === "player";
  const shots = state.shotsFired;
  const accuracy = shots > 0 ? Math.round((state.shotsHit / shots) * 100) : state.lastShot?.chance ?? 0;
  const tacticalBonus = tacticalBonusFor(state);
  const rounds = Math.max(1, state.round);
  const xp = (victory ? 120 : 35) + Math.min(70, rounds * 8) + tacticalBonus;
  const credits = (victory ? 85 : 25) + tacticalBonus * 2;
  return { outcome: victory ? "victory" : "defeat", title: victory ? "ELIMINAÇÃO CONFIRMADA (VITÓRIA)" : "OPERADOR ABATIDO (HIT - DERROTA)", shots, accuracy, rounds, tacticalBonus, xp, credits };
}

export function applyMatchResult(profile: CompetitiveProfile, report: MatchReport): CompetitiveProfile {
  return { ...profile, xp: profile.xp + report.xp, credits: profile.credits + report.credits, seasonScore: profile.seasonScore + (report.outcome === "victory" ? 100 + report.tacticalBonus : 20), matches: profile.matches + 1, wins: profile.wins + (report.outcome === "victory" ? 1 : 0), losses: profile.losses + (report.outcome === "defeat" ? 1 : 0) };
}

const SIMULATED_OPERATORS: Array<[string, string, number]> = [
  ["RANGER-02", "BLACKWATER", 980], ["MAVERICK", "TEAM SIX", 860], ["NOMAD", "GROM AIRSOFT", 740], ["GHOST-11", "RED CELL", 625], ["VULTURE", "WOLFPACK", 540], ["COBRA-9", "DELTA BRAVO", 450], ["SPECTER", "NIGHT RAIDERS", 360], ["BISON", "TASK FORCE 22", 285], ["KRAKEN", "IRON FOX", 190], ["OUTRIDER", "URBAN OPS", 120],
];

export function buildLeaderboard(profile: CompetitiveProfile, loadout: Loadout): LeaderboardEntry[] {
  const entries = SIMULATED_OPERATORS.map(([name, team, score]) => ({ name, team, score: Number(score) }));
  entries.push({ name: loadout.operatorName || "ALFA-01", team: loadout.teamName || "NIGHTFALL", score: profile.seasonScore });
  return entries.sort((a, b) => b.score - a.score).slice(0, 10).map((entry, index) => ({ ...entry, rank: index + 1, isPlayer: entry.name === loadout.operatorName && entry.team === loadout.teamName }));
}
