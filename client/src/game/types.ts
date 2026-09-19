export type Coord = { x: number; y: number };
export type CoverType = "none" | "half" | "full";
export type ActorKind = "player" | "enemy";
export type ActionId = "move" | "aim" | "semi" | "burst";

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
  pa: number;
  maxPa: number;
  aimBonus: number;
  selectedCell: Coord | null;
  pathPreview: Coord[];
  log: string[];
  lastShot: ShotResult | null;
  wins: number;
  losses: number;
  rng: number;
}
