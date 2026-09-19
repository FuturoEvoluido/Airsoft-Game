export type Coord = { x: number; y: number };
export type CoverType = "none" | "half" | "full";
export type ActorKind = "player" | "enemy";
export type ActionId = "move" | "aim" | "semi" | "burst";
export type UniformId = "multicam" | "all-black" | "woodland";
export type VestId = "light" | "heavy";
export type WeaponId = "m4" | "sniper" | "smg";

export interface Loadout {
  operatorName: string;
  teamName: string;
  patch: string;
  uniform: UniformId;
  vest: VestId;
  weapon: WeaponId;
}

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  type: Exclude<CoverType, "none">;
  label: string;
}

export interface Operator {
  kind: ActorKind;
  name: string;
  x: number;
  y: number;
}

export interface ShotResult {
  action: Exclude<ActionId, "move">;
  chance: number;
  roll: number;
  hit: boolean;
  pathBlocked: boolean;
  distance: number;
  coverPenalty: number;
  aimBonus: number;
  bullets: number;
  message: string;
}

export interface GameState {
  round: number;
  turn: ActorKind;
  phase: "active" | "resolving" | "ended";
  winner: ActorKind | null;
  player: Operator;
  enemy: Operator;
  loadout: Loadout;
  pa: number;
  maxPa: number;
  aimBonus: number;
  selectedCell: Coord | null;
  pathPreview: Coord[];
  log: string[];
  lastShot: ShotResult | null;
  shotsFired: number;
  shotsHit: number;
  wins: number;
  losses: number;
  rng: number;
}
