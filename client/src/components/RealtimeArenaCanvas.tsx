import { useEffect, useRef, useState } from "react";
import type { Loadout, RivalProfile, UniformId, WeaponId } from "../game/types";
import { tacticalAudio } from "../lib/tacticalAudio";


export interface RealtimeResult { victory: boolean; shots: number; hits: number; seconds: number; rounds: number; }
interface Props { loadout: Loadout; rival: RivalProfile; onFinish: (result: RealtimeResult) => void; onExit: () => void; }
type Vec = { x: number; y: number };
type Viewport = { viewW: number; viewH: number; dpr: number; scale: number; offsetX: number; offsetY: number };
type Bullet = { id: number; position: Vec; velocity: Vec; team: "player" | "enemy"; damage: number; ttl: number; sourceId: string; };
type Enemy = { id: string; position: Vec; aim: Vec; patrol: Vec[]; patrolIndex: number; alerted: boolean; cooldown: number; uniform: UniformId; weapon: WeaponId; name: string; hp: number; armor: number; };
type LootType = "ammo" | "armor" | "med";
type LootItem = { id: number; type: LootType; position: Vec; value: number; active: boolean };
type Runtime = { player: Vec; aim: Vec; joystick: Vec; bullets: Bullet[]; enemies: Enemy[]; loot: LootItem[]; hp: number; armor: number; shots: number; hits: number; started: number; running: boolean; nextBulletId: number; };

const LOGICAL_WIDTH = 1800;
const LOGICAL_HEIGHT = 1400;
const WORLD = { w: LOGICAL_WIDTH, h: LOGICAL_HEIGHT };
const VISION_RADIUS = 260;
const NEAR_VISION_RADIUS = 90;
const HEARING_RADIUS = 320;
const ENEMY_ALERT_RADIUS = 480;
const ENEMY_SIGHT_RADIUS = 680;
const PLAYER_R = 17;

const obstacles = [
  { x: 200, y: 150, w: 400, h: 50, kind: "concrete", label: "BLOCO A" },
  { x: 750, y: 120, w: 60, h: 350, kind: "concrete", label: "MURO NORTE" },
  { x: 920, y: 200, w: 450, h: 50, kind: "wood", label: "ESTande" },
  { x: 1100, y: 380, w: 60, h: 320, kind: "concrete", label: "PAREDE LESTE" },
  { x: 300, y: 600, w: 350, h: 50, kind: "wood", label: "DEPÓSITO" },
  { x: 800, y: 800, w: 500, h: 60, kind: "concrete", label: "BLOCO CENTRAL" },
  { x: 150, y: 900, w: 60, h: 300, kind: "concrete", label: "CORREDOR OESTE" },
  { x: 1300, y: 950, w: 380, h: 50, kind: "wood", label: "SUL SETOR" },
];

const patrolRoutes: Vec[][] = [
  [{ x: 520, y: 390 }, { x: 1217, y: 726 }, { x: 809, y: 530 }, { x: 1151, y: 102 }],
  [{ x: 760, y: 260 }, { x: 525, y: 414 }, { x: 510, y: 762 }, { x: 772, y: 820 }],
  [{ x: 820, y: 560 }, { x: 1283, y: 284 }, { x: 1072, y: 269 }, { x: 809, y: 131 }],
  [{ x: 1060, y: 390 }, { x: 597, y: 798 }, { x: 597, y: 435 }, { x: 1192, y: 568 }],
];

const enemySpawn: Vec[] = [
  { x: 520, y: 390 },
  { x: 760, y: 260 },
  { x: 820, y: 560 },
  { x: 1060, y: 390 },
];

const initialLoot: LootItem[] = [
  { id: 1, type: "ammo", position: { x: 400, y: 280 }, value: 30, active: true },
  { id: 2, type: "armor", position: { x: 880, y: 480 }, value: 50, active: true },
  { id: 3, type: "med", position: { x: 1250, y: 700 }, value: 40, active: true },
  { id: 4, type: "ammo", position: { x: 1550, y: 300 }, value: 30, active: true },
  { id: 5, type: "armor", position: { x: 600, y: 1100 }, value: 50, active: true },
  { id: 6, type: "med", position: { x: 1000, y: 1150 }, value: 50, active: true },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const normalize = (vector: Vec): Vec => { const length = Math.hypot(vector.x, vector.y) || 1; return { x: vector.x / length, y: vector.y / length }; };
const circleHitsRect = (p: Vec, r: number, box: typeof obstacles[number]) => { const x = clamp(p.x, box.x, box.x + box.w); const y = clamp(p.y, box.y, box.y + box.h); return Math.hypot(p.x - x, p.y - y) < r; };
const blocked = (p: Vec, radius = PLAYER_R) => p.x < radius || p.y < radius || p.x > WORLD.w - radius || p.y > WORLD.h - radius || obstacles.some((box) => circleHitsRect(p, radius, box));
const moveWithCollision = (from: Vec, delta: Vec, radius = PLAYER_R) => { const xTry = { x: from.x + delta.x, y: from.y }; const yTry = { x: from.x, y: from.y + delta.y }; const both = { x: from.x + delta.x, y: from.y + delta.y }; if (!blocked(both, radius)) return both; if (!blocked(xTry, radius)) return xTry; if (!blocked(yTry, radius)) return yTry; return from; };
const uniformColor = (uniform: UniformId) => uniform === "all-black" ? "#182323" : uniform === "woodland" ? "#435a3d" : "#657450";

const hasLineOfSight = (from: Vec, to: Vec) => {
  const delta = { x: to.x - from.x, y: to.y - from.y };
  const dist = Math.hypot(delta.x, delta.y);
  if (dist < PLAYER_R + 6) return true;
  const steps = Math.ceil(dist / 14);
  for (let i = 1; i < steps; i += 1) {
    const point = { x: from.x + delta.x * (i / steps), y: from.y + delta.y * (i / steps) };
    if (obstacles.some((box) => circleHitsRect(point, 2, box))) return false;
  }
  return true;
};

const getViewportTransform = (viewW: number, viewH: number, dpr: number, currentScale?: number): Viewport => {
  const scale = currentScale ?? Math.min(viewW / LOGICAL_WIDTH, viewH / LOGICAL_HEIGHT);
  return { viewW, viewH, dpr, scale, offsetX: (viewW - LOGICAL_WIDTH * scale) / 2, offsetY: (viewH - LOGICAL_HEIGHT * scale) / 2 };
};

export default function RealtimeArenaCanvas({ loadout, rival, onFinish, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<Runtime>({
    player: { x: 250, y: 390 },
    aim: { x: 1, y: 0 },
    joystick: { x: 0, y: 0 },
    bullets: [],
    loot: initialLoot,
    enemies: enemySpawn.map((position, index) => ({
      id: `hostile-${index + 1}`,
      position,
      aim: { x: -1, y: 0 },
      patrol: patrolRoutes[index],
      patrolIndex: 0,
      alerted: false,
      cooldown: 1.2 + index * .25,
      uniform: index === 1 ? "all-black" : index === 2 ? "woodland" : rival.uniform,
      weapon: index === 1 ? "smg" : index === 2 ? "sniper" : rival.weapon,
      name: index === 0 ? `HOSTIL-${index + 1}` : `${rival.teamName}-${String(index + 1).padStart(2, "0")}`,
      hp: 100,
      armor: 50,
    })),
    hp: 100,
    armor: 100,
    shots: 0,
    hits: 0,
    started: performance.now(),
    running: true,
    nextBulletId: 1,
  });

  const [fireReady, setFireReady] = useState(true);
  const [hp, setHp] = useState(100);
  const [armor, setArmor] = useState(100);
  const [shotCount, setShotCount] = useState(0);
  const [hostileCount, setHostileCount] = useState(4);

  // Twin-Stick state
  const leftPointerId = useRef<number | null>(null);
  const rightPointerId = useRef<number | null>(null);
  const leftOrigin = useRef<Vec | null>(null);
  const rightOrigin = useRef<Vec | null>(null);

  // Refs for DOM manipulation without React re-renders
  const leftBaseRef = useRef<HTMLDivElement>(null);
  const leftKnobRef = useRef<HTMLDivElement>(null);
  const rightBaseRef = useRef<HTMLDivElement>(null);
  const rightKnobRef = useRef<HTMLDivElement>(null);

  const applyCamera = (ctx: CanvasRenderingContext2D, viewport: Viewport) => {
    ctx.translate(viewport.offsetX, viewport.offsetY);
    ctx.scale(viewport.scale, viewport.scale);
  };

  const visibleToPlayer = (s: Runtime, position: Vec) =>
    distance(s.player, position) <= NEAR_VISION_RADIUS ||
    (distance(s.player, position) <= VISION_RADIUS && Math.abs(Math.atan2(position.y - s.player.y, position.x - s.player.x) - Math.atan2(s.aim.y, s.aim.x)) < .5 && hasLineOfSight(s.player, position));

  const drawScene = (ctx: CanvasRenderingContext2D, s: Runtime, visibleOnly: boolean, viewport: Viewport) => {
    // 1. Limpeza de fundo global (Fora dos limites do mapa)
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, viewport.viewW, viewport.viewH);

    ctx.save(); // INICIA A CÂMERA

    // 2. MATRIZ DE TRANSFORMAÇÃO (ZOOM E TRACKING)
    if (s.player) {
      const p = s.player;
      const cameraZoom = 2.2; // Escala imersiva estilo Bullet Echo
      
      // Centraliza o ponto de âncora no meio da tela
      ctx.translate(viewport.viewW / 2, viewport.viewH / 2);
      // Aplica a escala gráfica
      ctx.scale(cameraZoom, cameraZoom);
      // Move o "mundo" na direção oposta ao jogador para mantê-lo no centro
      ctx.translate(-p.x, -p.y);
    }

    // Fundo Tático Texturizado Estilo Cidade Bullet Echo
    // --- ETAPA 1: PISO E GRID TÁTICO ESTILO BULLET ECHO ---
    // 1. Cor de fundo base (Piso Tático Claro para destacar no facho)
    ctx.fillStyle = "#5A677D";
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);

    // 2. Desenho dos ladrilhos / azulejos do piso
    const tileSize = 60; // Tamanho dos blocos
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.15)"; // Linhas sutis de grade escuras

    ctx.beginPath();
    for (let x = 0; x <= WORLD.w; x += tileSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD.h);
    }
    for (let y = 0; y <= WORLD.h; y += tileSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD.w, y);
    }
    ctx.stroke();

    // 3. Linhas de divisão de zonas/salas (Acentos dourados/amarelados sutis)
    const zoneSize = tileSize * 5; // Divisões maiores de sala
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(235, 175, 40, 0.08)";

    ctx.beginPath();
    for (let x = 0; x <= WORLD.w; x += zoneSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD.h);
    }
    for (let y = 0; y <= WORLD.h; y += zoneSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD.w, y);
    }
    ctx.stroke();


    // --- ETAPA 2: PAREDES E OBSTÁCULOS ESTILO BULLET ECHO ---
    obstacles.forEach((obs) => {
      // 1. Sombra do obstáculo no chão (Profundidade top-down)
      ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
      ctx.fillRect(obs.x + 8, obs.y + 8, obs.w, obs.h);

      // 2. Cor de topo sólida (Bloco sólido)
      ctx.fillStyle = "#263040";
      ctx.fillRect(obs.x, obs.y, obs.w, obs.h);

      // 3. Estrutura metálica interior (Linha interna sutil)
      ctx.strokeStyle = "#38455A";
      ctx.lineWidth = 1;
      ctx.strokeRect(obs.x + 2, obs.y + 2, obs.w - 4, obs.h - 4);

      // 4. Borda principal tática
      ctx.strokeStyle = "#1C2430";
      ctx.lineWidth = 2;
      ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);

      // 5. Bisel de Luz Topo/Esquerda (Efeito de elevação 3D)
      ctx.strokeStyle = "rgba(56, 189, 248, 0.35)"; // Azul ciano tático
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      // Linha superior
      ctx.moveTo(obs.x, obs.y);
      ctx.lineTo(obs.x + obs.w, obs.y);
      // Linha esquerda
      ctx.moveTo(obs.x, obs.y);
      ctx.lineTo(obs.x, obs.y + obs.h);
      ctx.stroke();

      // 6. Detalhes de cantos reforçados (Marcações táticas estilo Bullet Echo)
      ctx.strokeStyle = "#38BDF8";
      ctx.lineWidth = 2;
      const cornerSize = Math.min(6, obs.w / 4, obs.h / 4);

      // Canto Superior Esquerdo
      ctx.beginPath();
      ctx.moveTo(obs.x, obs.y + cornerSize);
      ctx.lineTo(obs.x, obs.y);
      ctx.lineTo(obs.x + cornerSize, obs.y);
      ctx.stroke();

      // Canto Inferior Direito
      ctx.beginPath();
      ctx.moveTo(obs.x + obs.w - cornerSize, obs.y + obs.h);
      ctx.lineTo(obs.x + obs.w, obs.y + obs.h);
      ctx.lineTo(obs.x + obs.w, obs.y + obs.h - cornerSize);
      ctx.stroke();
    });

    // Limites da Arena
    ctx.strokeStyle = "#b59b52";
    ctx.setLineDash([12, 8]);
    ctx.strokeRect(16, 16, WORLD.w - 32, WORLD.h - 32);
    ctx.setLineDash([]);

    // --- 3. MÁSCARA DE ESCURIDÃO (RAYCASTING 360º + EVENODD) ---
    ctx.save();
    ctx.fillStyle = "rgba(12, 16, 24, 0.96)";
    ctx.beginPath();

    // 3.1 Retângulo cobrindo o mundo inteiro
    ctx.rect(0, 0, WORLD.w, WORLD.h);

    // 3.2 Polígono Único de Visão
    if (s.player) {
      const p = s.player;
      const fov = Math.PI / 3; // Abertura de 60 graus
      const viewDist = 400;    // Alcance da lanterna
      const proxDist = 80;     // Círculo de visão base (costas e lados)
      
      const playerAngle = Math.atan2(s.aim.y, s.aim.x); 

      const numRays = 120; // Resolução do contorno da luz
      
      for (let i = 0; i < numRays; i++) {
        const angle = (i / numRays) * Math.PI * 2;
        
        // Normaliza a diferença de ângulo para saber se o raio está dentro da lanterna
        let diff = Math.abs(angle - playerAngle);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        
        // Define a distância máxima do raio: viewDist se na frente, proxDist se atrás
        const maxDist = (diff <= fov / 2) ? viewDist : proxDist;
        
        // Lógica de Oclusão (Raycast Stepping)
        let actualDist = maxDist; 
        const direction = { x: Math.cos(angle), y: Math.sin(angle) };
        for (let step = 12; step <= maxDist; step += 12) {
          const point = { x: p.x + direction.x * step, y: p.y + direction.y * step };
          if (obstacles.some((box) => circleHitsRect(point, 2, box))) {
            actualDist = step;
            break;
          }
        }

        const targetX = p.x + Math.cos(angle) * actualDist;
        const targetY = p.y + Math.sin(angle) * actualDist;

        if (i === 0) {
          ctx.moveTo(targetX, targetY);
        } else {
          ctx.lineTo(targetX, targetY);
        }
      }
      ctx.closePath();
    }

    // O fill evenodd recorta o polígono de visão de dentro do retângulo escuro
    ctx.fill("evenodd");
    ctx.restore();
    // ----------------------------------------------------------------

    // --- ETAPA 3: LOOT EMISSIVO NO CHÃO ESTILO BULLET ECHO ---
    s.loot.forEach((item) => {
      if (!item.active) return;
      if (visibleOnly && !visibleToPlayer(s, item.position)) return;

      const size = 30;
      const x = item.position.x - size / 2;
      const y = item.position.y - size / 2;

      // Configuração de cores por tipo de item
      let primaryColor = "#FF7A00"; // Munição (Laranja Bullet Echo)
      let label = "MUN";

      if (item.type === "armor") {
        primaryColor = "#00A3FF"; // Armadura (Azul elétrico)
        label = "ARM";
      } else if (item.type === "med") {
        primaryColor = "#00E676"; // Vida (Verde neon)
        label = "HP";
      }

      // 1. Glow / Aura de chão emissiva
      ctx.save();
      ctx.shadowColor = primaryColor;
      ctx.shadowBlur = 14;

      // Base da caixa escurecida com contorno brilhante
      ctx.fillStyle = "#0A0E17";
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.roundRect(x, y, size, size, 6);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // 2. Núcleo colorido da caixa
      ctx.fillStyle = primaryColor;
      ctx.beginPath();
      ctx.roundRect(x + 4, y + 4, size - 8, size - 8, 3);
      ctx.fill();

      // 3. Detalhes metálicos internos
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fillRect(x + 6, y + 6, size - 12, 3);

      // 4. Texto/Símbolo central de identificação
      ctx.fillStyle = "#000000";
      ctx.font = "900 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, item.position.x, item.position.y + 2);
    });

    // Projéteis
    s.bullets.forEach((bullet) => {
      if (visibleOnly && bullet.team === "enemy" && !visibleToPlayer(s, bullet.position)) return;
      ctx.fillStyle = bullet.team === "player" ? "#d8fff0" : "#ff9e88";
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(bullet.position.x, bullet.position.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // --- ETAPA 4: OPERADORES, BARRAS DUPLAS, LASER E ANEL ACÚSTICO ---

    // FUNÇÃO AUXILIAR: Desenhar barra dupla e nome do operador estilo Bullet Echo
    const drawOperatorUI = (
      x: number,
      y: number,
      name: string,
      hp: number,
      maxHp: number,
      armor: number,
      maxArmor: number,
      isPlayer: boolean
    ) => {
      const barW = 44;
      const barH = 5;
      const startX = x - barW / 2;
      const startY = y - 38;

      // Nome do Operador [HP] em cima
      ctx.fillStyle = isPlayer ? "#00E676" : "#FF5252";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${name} [${Math.max(0, Math.round(hp))}]`, x, startY - 4);

      // Fundo das barras
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(startX - 1, startY - 1, barW + 2, barH * 2 + 3);

      // Barra de HP (Verde)
      const hpRatio = Math.max(0, Math.min(1, hp / maxHp));
      ctx.fillStyle = "#00E676";
      ctx.fillRect(startX, startY, barW * hpRatio, barH);

      // Barra de Armadura (Azul)
      const armorRatio = Math.max(0, Math.min(1, armor / maxArmor));
      ctx.fillStyle = "#00A3FF";
      ctx.fillRect(startX, startY + barH + 1, barW * armorRatio, barH);
    };

    // 1. LINHA LASER DE MIRA (Do jogador)
    if (s.player) {
      const p = s.player;
      const playerAngle = Math.atan2(s.aim.y, s.aim.x);
      const laserLength = 350;
      const endX = p.x + Math.cos(playerAngle) * laserLength;
      const endY = p.y + Math.sin(playerAngle) * laserLength;

      ctx.save();
      ctx.strokeStyle = "rgba(255, 40, 40, 0.65)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]); // Tracejado tático
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Ponto laser de destino com glow
      ctx.fillStyle = "#FF0000";
      ctx.shadowColor = "#FF0000";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(endX, endY, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 2. RENDERIZAÇÃO DO PLAYER OPERATOR
    if (s.player) {
      const p = s.player;
      const playerAngle = Math.atan2(s.aim.y, s.aim.x);

      // Corpo do Operador Top-Down
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(playerAngle);

      // Sombra no chão
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath();
      ctx.arc(2, 2, 16, 0, Math.PI * 2);
      ctx.fill();

      // Borda Verde Neon de Destaque
      ctx.strokeStyle = "#00E676";
      ctx.lineWidth = 3;
      ctx.fillStyle = "#1E293B";
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Arma/Direção
      ctx.fillStyle = "#00E676";
      ctx.fillRect(10, -3, 10, 6);

      ctx.restore();

      // UI do Player (Nome + HP + ARM)
      drawOperatorUI(
        p.x,
        p.y,
        loadout.operatorName || "OPERADOR",
        s.hp,
        100, // maxHp
        s.armor,
        100, // maxArmor
        true
      );
    }

    // 3. RENDERIZAÇÃO DOS INIMIGOS / HOSTIS
    if (s.enemies) {
      s.enemies.forEach((enemy, idx) => {
        if (enemy.hp <= 0) return;
        const isVisible = visibleToPlayer(s, enemy.position);

        // Se o inimigo estiver visível (no facho do jogador)
        if (!visibleOnly || isVisible) {
          const enemyAim = normalize({ x: s.player.x - enemy.position.x, y: s.player.y - enemy.position.y });
          const enemyAngle = Math.atan2(enemyAim.y, enemyAim.x);

          ctx.save();
          ctx.translate(enemy.position.x, enemy.position.y);
          ctx.rotate(enemyAngle);

          // Sombra
          ctx.fillStyle = "rgba(0,0,0,0.4)";
          ctx.beginPath();
          ctx.arc(2, 2, 16, 0, Math.PI * 2);
          ctx.fill();

          // Borda Vermelha
          ctx.strokeStyle = "#FF3366";
          ctx.lineWidth = 3;
          ctx.fillStyle = "#2D121B";
          ctx.beginPath();
          ctx.arc(0, 0, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Arma
          ctx.fillStyle = "#FF3366";
          ctx.fillRect(10, -3, 10, 6);

          ctx.restore();

          // UI do Inimigo
          drawOperatorUI(
            enemy.position.x,
            enemy.position.y,
            enemy.name || `HOSTIL-${idx + 1}`,
            enemy.hp,
            100, // maxHp
            enemy.armor,
            100, // maxArmor
            false
          );
        }

        // ANEL ACÚSTICO PULSANTE (Som de passos na escuridão)
        const distToPlayer = distance(s.player, enemy.position);
        if (!isVisible && distToPlayer <= HEARING_RADIUS && enemy.alerted) {
          ctx.save();
          ctx.strokeStyle = "rgba(255, 75, 75, 0.75)";
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);

          const time = performance.now() / 200;
          const pulseRadius = 22 + Math.sin(time) * 4;

          ctx.beginPath();
          ctx.arc(enemy.position.x, enemy.position.y, pulseRadius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      });
    }

    // Anel Acústico de Radar ao redor do Jogador (estilo Bullet Echo)
    ctx.strokeStyle = "rgba(89, 221, 199, 0.28)";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(s.player.x, s.player.y, HEARING_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore(); // ENCERRA A CÂMERA (Para não afetar a UI estática)
  };

  const draw = (ctx: CanvasRenderingContext2D, viewport: Viewport) => {
    const s = runtime.current;
    ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    ctx.clearRect(0, 0, viewport.viewW, viewport.viewH);

    // 1. Renderiza o mundo base completo (player, inimigos, loot, projéteis)
    ctx.save();
    drawScene(ctx, s, false, viewport);
    ctx.restore();
  };

  const finish = (victory: boolean) => {
    if (!runtime.current.running) return;
    runtime.current.running = false;
    onFinish({
      victory,
      shots: runtime.current.shots,
      hits: runtime.current.hits,
      seconds: Math.round((performance.now() - runtime.current.started) / 1000),
      rounds: Math.max(1, Math.round((performance.now() - runtime.current.started) / 30000)),
    });
  };

  const fire = () => {
    const s = runtime.current;
    if (!s.running || !fireReady) return;
    setFireReady(false);
    s.shots += 1;
    setShotCount(s.shots);
    const direction = normalize(s.aim);
    s.bullets.push({
      id: s.nextBulletId++,
      position: { x: s.player.x + direction.x * 23, y: s.player.y + direction.y * 23 },
      velocity: { x: direction.x * 650, y: direction.y * 650 },
      team: "player",
      damage: loadout.weapon === "sniper" ? 75 : loadout.weapon === "smg" ? 28 : 45,
      ttl: 1.8,
      sourceId: "player",
    });

    s.enemies.forEach((enemy) => {
      if (distance(enemy.position, s.player) < ENEMY_ALERT_RADIUS) enemy.alerted = true;
    });

    tacticalAudio.fire(loadout.weapon);
    window.setTimeout(() => setFireReady(true), loadout.weapon === "smg" ? 170 : loadout.weapon === "sniper" ? 500 : 300);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    tacticalAudio.startAmbient();
    const context = canvas.getContext("2d");
    if (!context) return;

    let viewport: Viewport = getViewportTransform(1, 1, 1);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const viewW = Math.max(1, rect.width);
      const viewH = Math.max(1, rect.height);
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const bufferW = Math.max(1, Math.round(viewW * dpr));
      const bufferH = Math.max(1, Math.round(viewH * dpr));
      if (canvas.width !== bufferW) canvas.width = bufferW;
      if (canvas.height !== bufferH) canvas.height = bufferH;
      viewport = getViewportTransform(viewW, viewH, dpr, Math.min(viewW / LOGICAL_WIDTH, viewH / LOGICAL_HEIGHT));
    };

    const resizeAfterLayout = () => { window.requestAnimationFrame(resize); };
    resize();
    resizeAfterLayout();
    const observer = new ResizeObserver(resizeAfterLayout);
    observer.observe(canvas);
    window.addEventListener("resize", resizeAfterLayout, { passive: true });

    const frame = { current: 0 };
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(.05, (now - last) / 1000);
      last = now;
      const s = runtime.current;

      if (s.running) {
        const speed = loadout.weapon === "smg" ? 190 : loadout.weapon === "sniper" ? 130 : 160;
        const previousPlayer = s.player;
        s.player = moveWithCollision(s.player, { x: s.joystick.x * speed * dt, y: s.joystick.y * speed * dt });
        if (distance(previousPlayer, s.player) > .3) tacticalAudio.step();

        // Verificação de Coleta de Loot (Itens no Chão)
        s.loot.forEach((item) => {
          if (!item.active) return;
          if (distance(s.player, item.position) < PLAYER_R + 18) {
            item.active = false;
            tacticalAudio.ui();
            if (item.type === "ammo") {
              setShotCount((prev) => prev + item.value);
            } else if (item.type === "armor") {
              s.armor = Math.min(100, s.armor + item.value);
              setArmor(s.armor);
            } else if (item.type === "med") {
              s.hp = Math.min(100, s.hp + item.value);
              setHp(s.hp);
            }
          }
        });

        // IA dos Inimigos
        s.enemies.forEach((enemy) => {
          const toPlayer = { x: s.player.x - enemy.position.x, y: s.player.y - enemy.position.y };
          const dist = Math.hypot(toPlayer.x, toPlayer.y);
          const seesPlayer = dist < ENEMY_SIGHT_RADIUS && hasLineOfSight(enemy.position, s.player);
          if (seesPlayer || dist < HEARING_RADIUS) enemy.alerted = true;

          const target = enemy.patrol[enemy.patrolIndex];
          const patrolDirection = normalize({ x: target.x - enemy.position.x, y: target.y - enemy.position.y });
          const chaseDirection = normalize(toPlayer);
          const direction = enemy.alerted ? chaseDirection : patrolDirection;
          const speedEnemy = enemy.weapon === "smg" ? 95 : enemy.weapon === "sniper" ? 36 : 62;
          const moveDirection = enemy.alerted && enemy.weapon === "sniper" ? { x: -chaseDirection.x, y: -chaseDirection.y } : direction;

          enemy.position = moveWithCollision(enemy.position, { x: moveDirection.x * speedEnemy * dt, y: moveDirection.y * speedEnemy * dt });
          enemy.aim = toPlayer;

          if (!enemy.alerted && distance(enemy.position, target) < 22) {
            enemy.patrolIndex = (enemy.patrolIndex + 1) % enemy.patrol.length;
          }

          enemy.cooldown -= dt;
          if (enemy.alerted && seesPlayer && enemy.cooldown <= 0) {
            enemy.cooldown = enemy.weapon === "smg" ? .72 : enemy.weapon === "sniper" ? 2.1 : 1.25;
            const aim = normalize({ x: s.player.x - enemy.position.x, y: s.player.y - enemy.position.y });
            s.bullets.push({
              id: s.nextBulletId++,
              position: { x: enemy.position.x + aim.x * 23, y: enemy.position.y + aim.y * 23 },
              velocity: { x: aim.x * 420, y: aim.y * 420 },
              team: "enemy",
              damage: enemy.weapon === "sniper" ? 45 : enemy.weapon === "smg" ? 20 : 28,
              ttl: 2.4,
              sourceId: enemy.id,
            });
            tacticalAudio.fire(enemy.weapon);
          }
        });

        // Gestão de Projéteis e Danos
        const nextBullets: Bullet[] = [];
        for (const bullet of s.bullets) {
          let alive = true;
          const steps = Math.max(1, Math.ceil((Math.hypot(bullet.velocity.x, bullet.velocity.y) * dt) / 8));
          const step = { x: bullet.velocity.x * dt / steps, y: bullet.velocity.y * dt / steps };

          for (let i = 0; i < steps && alive; i += 1) {
            bullet.position = { x: bullet.position.x + step.x, y: bullet.position.y + step.y };
            bullet.ttl -= dt / steps;
            if (bullet.ttl <= 0 || blocked(bullet.position, 3)) {
              alive = false;
              continue;
            }

            if (bullet.team === "player") {
              const target = s.enemies.find((enemy) => distance(bullet.position, enemy.position) < PLAYER_R + 6);
              if (target) {
                alive = false;
                s.hits += 1;
                // Aplicação de dano na armadura primeiro, depois no HP do inimigo
                if (target.armor > 0) {
                  target.armor = Math.max(0, target.armor - bullet.damage);
                } else {
                  target.hp = Math.max(0, target.hp - bullet.damage);
                }

                if (target.hp <= 0) {
                  s.enemies = s.enemies.filter((enemy) => enemy.id !== target.id);
                  setHostileCount(s.enemies.length);
                  if (!s.enemies.length) finish(true);
                }
              }
            } else if (distance(bullet.position, s.player) < PLAYER_R + 6) {
              alive = false;
              if (s.armor > 0) {
                s.armor = Math.max(0, s.armor - bullet.damage);
                setArmor(s.armor);
              } else {
                s.hp = Math.max(0, s.hp - bullet.damage);
                setHp(s.hp);
              }
              tacticalAudio.miss();
              if (s.hp <= 0) finish(false);
            }
          }
          if (alive) nextBullets.push(bullet);
        }
        s.bullets = nextBullets;
      }

      draw(context, viewport);
      frame.current = requestAnimationFrame(loop);
    };

    frame.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame.current);
      observer.disconnect();
      window.removeEventListener("resize", resizeAfterLayout);
      tacticalAudio.stopAmbient();
    };
  }, [loadout.weapon]);

  const handleLeftDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    leftPointerId.current = e.pointerId;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    leftOrigin.current = { x, y };

    if (leftBaseRef.current && leftKnobRef.current) {
      leftBaseRef.current.style.display = "block";
      leftBaseRef.current.style.left = `${x}px`;
      leftBaseRef.current.style.top = `${y}px`;
      leftKnobRef.current.style.transform = `translate(-50%, -50%)`;
      leftKnobRef.current.style.background = `rgba(92,215,178,.9)`; // active color
    }
  };

  const handleLeftMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (leftPointerId.current !== e.pointerId || !leftOrigin.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = x - leftOrigin.current.x;
    const dy = y - leftOrigin.current.y;
    const radius = 43; // max radius for knob (86/2)
    const length = Math.min(radius, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    
    runtime.current.joystick = { x: Math.cos(angle) * (length / radius), y: Math.sin(angle) * (length / radius) };

    if (leftKnobRef.current) {
      const knobX = Math.cos(angle) * length;
      const knobY = Math.sin(angle) * length;
      leftKnobRef.current.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
    }
  };

  const handleLeftUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (leftPointerId.current !== e.pointerId) return;
    leftPointerId.current = null;
    leftOrigin.current = null;
    runtime.current.joystick = { x: 0, y: 0 };
    if (leftBaseRef.current) leftBaseRef.current.style.display = "none";
  };

  const handleRightDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    rightPointerId.current = e.pointerId;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    rightOrigin.current = { x, y };

    if (rightBaseRef.current && rightKnobRef.current) {
      rightBaseRef.current.style.display = "block";
      rightBaseRef.current.style.left = `${x}px`;
      rightBaseRef.current.style.top = `${y}px`;
      rightKnobRef.current.style.transform = `translate(-50%, -50%)`;
      rightKnobRef.current.style.background = `rgba(92,215,178,.9)`;
    }
  };

  const handleRightMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (rightPointerId.current !== e.pointerId || !rightOrigin.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = x - rightOrigin.current.x;
    const dy = y - rightOrigin.current.y;
    
    // Altera a mira se o movimento for considerável
    if (Math.hypot(dx, dy) > 5) {
      const angle = Math.atan2(dy, dx);
      runtime.current.aim = { x: Math.cos(angle), y: Math.sin(angle) };
    }
    
    const radius = 43;
    const length = Math.min(radius, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    if (rightKnobRef.current) {
      const knobX = Math.cos(angle) * length;
      const knobY = Math.sin(angle) * length;
      rightKnobRef.current.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
    }
  };

  const handleRightUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (rightPointerId.current !== e.pointerId) return;
    rightPointerId.current = null;
    rightOrigin.current = null;
    if (rightBaseRef.current) rightBaseRef.current.style.display = "none";
  };

  return (
    <div className="realtime-arena">
      <canvas
        ref={canvasRef}
        className="realtime-canvas"
        aria-label="Arena tática estilo Bullet Echo com Loot e Fog of War"
      />
      
      <div className="twin-stick-overlay">
        <div 
          className="touch-zone left-zone" 
          onPointerDown={handleLeftDown} onPointerMove={handleLeftMove} onPointerUp={handleLeftUp} onPointerCancel={handleLeftUp}
        >
          <div className="joystick-base" ref={leftBaseRef} style={{ display: 'none' }}>
             <div className="joystick-knob" ref={leftKnobRef} />
          </div>
        </div>
        <div 
          className="touch-zone right-zone"
          onPointerDown={handleRightDown} onPointerMove={handleRightMove} onPointerUp={handleRightUp} onPointerCancel={handleRightUp}
        >
          <div className="joystick-base" ref={rightBaseRef} style={{ display: 'none' }}>
             <div className="joystick-knob" ref={rightKnobRef} />
          </div>
        </div>
      </div>

      <div className="realtime-hud">
        <span>HP <b>{hp}%</b></span>
        <span>ARM <b>{armor}%</b></span>
        <span>MUNI <b>{shotCount}</b></span>
        <span>HOSTIS <b>{hostileCount}</b></span>
        <button type="button" onClick={() => { tacticalAudio.ui(); onExit(); }}>QG</button>
      </div>

      <button
        type="button"
        className="fire-control"
        onPointerDown={(event) => {
          event.stopPropagation();
          fire();
        }}
      >
        {fireReady ? "FIRE" : "READY"}
      </button>
      <div className="realtime-hint">BULLET ECHO TACTICAL • LOOT ATIVO</div>
    </div>
  );
}