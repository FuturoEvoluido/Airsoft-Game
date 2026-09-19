import type { ActionId, Coord, GameState, Loadout, Obstacle, ShotResult } from "./types";

export const GRID_SIZE = 8;
export const MAX_PA = 5;
export const DEFAULT_LOADOUT: Loadout = { operatorName: "ALFA-01", teamName: "NIGHTFALL", patch: "☢", uniform: "multicam", vest: "heavy", weapon: "m4" };

export const loadoutStats = (loadout: Loadout) => {
  const maxPa = loadout.vest === "light" ? 6 : 5;
  if (loadout.weapon === "sniper") return { maxPa, semiCost: 3, burstCost: Infinity, baseAccuracy: 95, rangePenalty: 0, burstAvailable: false };
  if (loadout.weapon === "smg") return { maxPa, semiCost: 1, burstCost: 2, baseAccuracy: 76, rangePenalty: 7, burstAvailable: true };
  return { maxPa, semiCost: 2, burstCost: 3, baseAccuracy: 80, rangePenalty: 4, burstAvailable: true };
};

export const OBSTACLES: Obstacle[] = [
  { id: "barricade-a", x: 3, y: 2, type: "half", label: "BARRICADA" },
  { id: "barricade-b", x: 4, y: 5, type: "half", label: "BARRICADA" },
  { id: "drum-a", x: 5, y: 3, type: "full", label: "TAMBOR" },
  { id: "drum-b", x: 2, y: 4, type: "full", label: "TAMBOR" },
];

const key = (point: Coord) => `${point.x},${point.y}`;
const samePoint = (a: Coord, b: Coord) => a.x === b.x && a.y === b.y;
const isInside = (point: Coord) => point.x >= 0 && point.x < GRID_SIZE && point.y >= 0 && point.y < GRID_SIZE;
const neighbors = (point: Coord): Coord[] => [
  { x: point.x + 1, y: point.y },
  { x: point.x - 1, y: point.y },
  { x: point.x, y: point.y + 1 },
  { x: point.x, y: point.y - 1 },
].filter(isInside);

export const obstacleAt = (point: Coord) => OBSTACLES.find((obstacle) => obstacle.x === point.x && obstacle.y === point.y);
export const coverPenaltyAt = (point: Coord) => {
  const obstacle = obstacleAt(point);
  return obstacle?.type === "full" ? 70 : obstacle?.type === "half" ? 40 : 0;
};

const walkable = (point: Coord, state: GameState, allow: Coord) => {
  if (!isInside(point) || obstacleAt(point)) return false;
  const occupiedByActor = samePoint(point, { x: state.enemy.x, y: state.enemy.y }) || samePoint(point, { x: state.player.x, y: state.player.y });
  return !occupiedByActor || samePoint(point, allow);
};

export const findPath = (from: Coord, to: Coord, state: GameState): Coord[] => {
  if (!isInside(to) || obstacleAt(to) || samePoint(to, { x: state.enemy.x, y: state.enemy.y })) return [];
  const queue: Coord[] = [from];
  const previous = new Map<string, Coord | null>([[key(from), null]]);
  while (queue.length) {
    const current = queue.shift()!;
    if (samePoint(current, to)) break;
    for (const next of neighbors(current)) {
      if (!walkable(next, state, to) || previous.has(key(next))) continue;
      previous.set(key(next), current);
      queue.push(next);
    }
  }
  if (!previous.has(key(to))) return [];
  const path: Coord[] = [];
  let cursor: Coord | null = to;
  while (cursor && !samePoint(cursor, from)) {
    path.unshift(cursor);
    cursor = previous.get(key(cursor)) ?? null;
  }
  return path;
};

const lineCells = (from: Coord, to: Coord): Coord[] => {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) * 2;
  const cells: Coord[] = [];
  for (let index = 1; index < steps; index += 1) {
    const ratio = index / steps;
    const point = { x: Math.round(from.x + (to.x - from.x) * ratio), y: Math.round(from.y + (to.y - from.y) * ratio) };
    if (!cells.some((cell) => samePoint(cell, point)) && !samePoint(point, from) && !samePoint(point, to)) cells.push(point);
  }
  return cells;
};

export const hasLineOfSight = (from: Coord, to: Coord) => lineCells(from, to).every((point) => !obstacleAt(point));
export const distanceBetween = (from: Coord, to: Coord) => Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));

const nextRandom = (state: GameState) => {
  const rng = (state.rng * 9301 + 49297) % 233280;
  return { rng, roll: rng / 233280 };
};

const appendLog = (state: GameState, message: string): string[] => [message, ...state.log].slice(0, 5);
const withTurnIfSpent = (state: GameState) => state.pa <= 0 ? { ...state, turn: "enemy" as const, phase: "resolving" as const, pa: 0 } : state;

export const initialGameState = (wins = 0, losses = 0, loadout: Loadout = DEFAULT_LOADOUT): GameState => ({
  round: 1,
  turn: "player",
  phase: "active",
  winner: null,
  player: { kind: "player", name: loadout.operatorName, x: 1, y: 6 },
  enemy: { kind: "enemy", name: "HOSTIL-07", x: 6, y: 1 },
  loadout,
  pa: loadoutStats(loadout).maxPa,
  maxPa: loadoutStats(loadout).maxPa,
  aimBonus: 0,
  selectedCell: null,
  pathPreview: [],
  log: ["Entrada confirmada. Arena CQB carregada."],
  lastShot: null,
  wins,
  losses,
  rng: 17,
});

export const previewMove = (state: GameState, target: Coord): GameState => ({
  ...state,
  selectedCell: target,
  pathPreview: findPath({ x: state.player.x, y: state.player.y }, target, state),
});

export const movePlayer = (state: GameState, target: Coord): GameState => {
  if (state.turn !== "player" || state.phase !== "active") return state;
  const path = findPath({ x: state.player.x, y: state.player.y }, target, state);
  if (!path.length) return { ...state, selectedCell: target, pathPreview: [], log: appendLog(state, "Rota inválida: cobertura ou operador bloqueando o trajeto.") };
  if (path.length > state.pa) return { ...state, selectedCell: target, pathPreview: path, log: appendLog(state, `Rota excede o PA disponível (${path.length} necessários).`) };
  const destination = path[path.length - 1];
  const next = { ...state, player: { ...state.player, x: destination.x, y: destination.y }, pa: state.pa - path.length, selectedCell: destination, pathPreview: [], aimBonus: 0, log: appendLog(state, `Movimento concluído: ${path.length} casa${path.length > 1 ? "s" : ""}.`) };
  return withTurnIfSpent(next);
};

export const aimPlayer = (state: GameState): GameState => {
  if (state.turn !== "player" || state.phase !== "active" || state.pa < 1) return state;
  return { ...state, pa: state.pa - 1, aimBonus: Math.min(20, state.aimBonus + 20), log: appendLog(state, "Mira estabilizada. Próximo disparo recebe +20%.") };
};

const shoot = (state: GameState, action: Exclude<ActionId, "move">): GameState => {
  const stats = loadoutStats(state.loadout);
  const cost = action === "aim" ? 1 : action === "semi" ? stats.semiCost : stats.burstCost;
  if (action === "aim") return aimPlayer(state);
  if (state.turn !== "player" || state.phase !== "active" || state.pa < cost || (action === "burst" && !stats.burstAvailable)) return state;
  const from = { x: state.player.x, y: state.player.y };
  const to = { x: state.enemy.x, y: state.enemy.y };
  const pathBlocked = !hasLineOfSight(from, to);
  const distance = distanceBetween(from, to);
  const coverPenalty = coverPenaltyAt(to);
  const bullets = action === "burst" ? 3 : 1;
  const vestBonus = state.loadout.vest === "heavy" ? 4 : 0;
  const accuracy = Math.max(5, Math.min(98, stats.baseAccuracy - Math.max(0, distance - 2) * stats.rangePenalty - coverPenalty + state.aimBonus + vestBonus));
  const random = nextRandom(state);
  const hit = !pathBlocked && (action === "burst" ? [random.roll, (random.roll * 1.73) % 1, (random.roll * 2.41) % 1].some((roll) => roll * 100 <= accuracy) : random.roll * 100 <= accuracy);
  const result: ShotResult = { action, chance: accuracy, roll: Math.round(random.roll * 100), hit, pathBlocked, distance, coverPenalty, aimBonus: state.aimBonus, bullets, message: pathBlocked ? "Linha de visão bloqueada." : hit ? "HIT confirmado — operador eliminado." : "BBs desviaram do alvo." };
  if (hit) return { ...state, phase: "ended", winner: "player", pa: state.pa - cost, lastShot: result, wins: state.wins + 1, log: appendLog(state, `HIT! ${action === "burst" ? "Rajada" : "Disparo semi"} conectou.`), rng: random.rng };
  return withTurnIfSpent({ ...state, pa: state.pa - cost, aimBonus: 0, lastShot: result, log: appendLog(state, `${action === "burst" ? "Rajada" : "Disparo semi"}: ${result.message}`), rng: random.rng });
};

export const fireSemi = (state: GameState) => shoot(state, "semi");
export const fireBurst = (state: GameState) => shoot(state, "burst");

export const endPlayerTurn = (state: GameState): GameState => {
  if (state.turn !== "player" || state.phase !== "active") return state;
  return { ...state, turn: "enemy", phase: "resolving", pa: 0, selectedCell: null, pathPreview: [], log: appendLog(state, "Turno encerrado. Hostil está calculando rota...") };
};

const coverCellsNear = (state: GameState): Coord[] => {
  const candidates: Coord[] = [];
  for (const obstacle of OBSTACLES) {
    for (const candidate of neighbors({ x: obstacle.x, y: obstacle.y })) {
      if (walkable(candidate, state, { x: state.enemy.x, y: state.enemy.y }) && !candidates.some((cell) => samePoint(cell, candidate))) candidates.push(candidate);
    }
  }
  return candidates;
};

export const runEnemyTurn = (state: GameState): GameState => {
  if (state.phase !== "resolving" || state.turn !== "enemy") return state;
  let enemy = { ...state.enemy };
  let pa = state.maxPa;
  let log = state.log;
  const canShootNow = hasLineOfSight({ x: enemy.x, y: enemy.y }, { x: state.player.x, y: state.player.y });
  if (!canShootNow) {
    const coverTarget = coverCellsNear({ ...state, enemy })
      .map((target) => ({ target, path: findPath({ x: enemy.x, y: enemy.y }, target, { ...state, enemy }) }))
      .filter((entry) => entry.path.length > 0)
      .sort((a, b) => a.path.length - b.path.length)[0];
    if (coverTarget) {
      const steps = Math.min(2, pa, coverTarget.path.length);
      const destination = coverTarget.path[steps - 1];
      enemy = { ...enemy, x: destination.x, y: destination.y };
      pa -= steps;
      log = appendLog({ ...state, log }, `HOSTIL avançou ${steps} casa${steps > 1 ? "s" : ""} buscando cobertura.`);
    }
  }
  const hasShot = hasLineOfSight({ x: enemy.x, y: enemy.y }, { x: state.player.x, y: state.player.y });
  if (hasShot && pa >= 2) {
    const distance = distanceBetween({ x: enemy.x, y: enemy.y }, { x: state.player.x, y: state.player.y });
    const coverPenalty = coverPenaltyAt({ x: state.player.x, y: state.player.y });
    const stealthPenalty = state.loadout.uniform === "all-black" ? 10 : 0;
    const woodlandProtection = state.loadout.uniform === "woodland" && distance >= 4 ? 10 : 0;
    const accuracy = Math.max(5, Math.min(95, 80 - Math.max(0, distance - 2) * 4 - coverPenalty - stealthPenalty - woodlandProtection));
    const random = nextRandom({ ...state, rng: state.rng + 31 });
    const hit = random.roll * 100 <= accuracy;
    const result: ShotResult = { action: "semi", chance: accuracy, roll: Math.round(random.roll * 100), hit, pathBlocked: false, distance, coverPenalty, aimBonus: 0, bullets: 1, message: hit ? "Hostil conectou um disparo." : "Hostil errou o disparo." };
    if (hit) {
      return { ...state, enemy, pa: pa - 2, phase: "ended", winner: "enemy", losses: state.losses + 1, lastShot: result, rng: random.rng, log: appendLog({ ...state, log }, "HIT recebido. Operador ALFA-01 eliminado.") };
    }
    log = appendLog({ ...state, log }, `Hostil disparou e errou (${accuracy}% de chance).`);
  } else {
    log = appendLog({ ...state, log }, "Hostil sem linha de visão — manteve posição.");
  }
  return { ...state, enemy, turn: "player", phase: "active", pa: state.maxPa, aimBonus: 0, selectedCell: null, pathPreview: [], round: state.round + 1, lastShot: null, rng: state.rng, log: appendLog({ ...state, log }, "Seu turno. Escolha uma ação.") };
};
