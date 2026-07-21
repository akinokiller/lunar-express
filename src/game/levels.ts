// 关卡定义:地形生成、检查点、电池、移动障碍、终点 —— 纯模块

import { buildTerrain, type Terrain, type TerrainPoint } from './terrain';

type Op =
  | { kind: 'flat'; len: number }
  | { kind: 'slope'; len: number; dy: number }
  | { kind: 'pit'; len: number; depth: number };

export type ObstacleKind = 'drone' | 'rock';

export interface ObstacleDef {
  kind: ObstacleKind;
  /** 摆动中心 x */
  x: number;
  /** 水平摆动幅度 */
  range: number;
  /** 水平速度 m/s */
  speed: number;
  /** 碰撞半径 */
  r: number;
  /** 无人机离地高度(岩石忽略) */
  alt?: number;
  phase?: number;
}

export interface LevelDef {
  index: number;
  name: string;
  sub: string;
  parTime: number;
  terrain: Terrain;
  startX: number;
  finishX: number;
  lengthX: number;
  checkpoints: number[];
  batteries: number[];
  obstacles: ObstacleDef[];
}

function buildPoints(ops: Op[], startY = 0, step = 2.5): TerrainPoint[] {
  const pts: TerrainPoint[] = [{ x: 0, y: startY }];
  let x = 0;
  let y = startY;
  const push = (nx: number, ny: number) => {
    pts.push({ x: nx, y: ny });
    x = nx;
    y = ny;
  };
  for (const op of ops) {
    if (op.kind === 'flat') {
      const n = Math.max(1, Math.round(op.len / step));
      for (let i = 0; i < n; i++) push(x + op.len / n, y);
    } else if (op.kind === 'slope') {
      const n = Math.max(2, Math.round(op.len / step));
      for (let i = 0; i < n; i++) push(x + op.len / n, y + op.dy / n);
    } else {
      // 坑洞:下坡 45% / 平底 10% / 上坡 45%
      // 坑沿做圆角处理(坡壁分两段,靠沿处坡度较缓),避免车辆被坑沿弹射
      const d1 = op.len * 0.45;
      const d2 = op.len * 0.1;
      const d3 = op.len * 0.45;
      // 下坡:先缓(35% 深度走 45% 长度)后陡
      const n1a = Math.max(2, Math.round((d1 * 0.45) / step));
      for (let i = 0; i < n1a; i++) push(x + (d1 * 0.45) / n1a, y - (op.depth * 0.35) / n1a);
      const n1b = Math.max(2, Math.round((d1 * 0.55) / step));
      for (let i = 0; i < n1b; i++) push(x + (d1 * 0.55) / n1b, y - (op.depth * 0.65) / n1b);
      const n2 = Math.max(1, Math.round(d2 / step));
      for (let i = 0; i < n2; i++) push(x + d2 / n2, y);
      // 上坡:先陡后缓(出口沿同样圆角)
      const n3a = Math.max(2, Math.round((d3 * 0.55) / step));
      for (let i = 0; i < n3a; i++) push(x + (d3 * 0.55) / n3a, y + (op.depth * 0.65) / n3a);
      const n3b = Math.max(2, Math.round((d3 * 0.45) / step));
      for (let i = 0; i < n3b; i++) push(x + (d3 * 0.45) / n3b, y + (op.depth * 0.35) / n3b);
    }
  }
  return pts;
}

function makeLevel(opts: {
  index: number;
  name: string;
  sub: string;
  parTime: number;
  ops: Op[];
  checkpointFracs: number[];
  batteryFracs: number[];
  obstacles: (Omit<ObstacleDef, 'x'> & { xFrac: number })[];
}): LevelDef {
  const pts = buildPoints(opts.ops);
  // 终点后再延伸一段平地,防止冲出世界
  const tail = pts[pts.length - 1];
  pts.push({ x: tail.x + 30, y: tail.y });
  pts.push({ x: tail.x + 60, y: tail.y });
  const terrain = buildTerrain(pts);
  const lengthX = tail.x;
  const finishX = lengthX - 18;
  return {
    index: opts.index,
    name: opts.name,
    sub: opts.sub,
    parTime: opts.parTime,
    terrain,
    startX: 8,
    finishX,
    lengthX,
    checkpoints: opts.checkpointFracs.map((f) => Math.round(finishX * f)),
    batteries: opts.batteryFracs.map((f) => Math.round(finishX * f)),
    obstacles: opts.obstacles.map((o) => {
      const { xFrac, ...rest } = o;
      return { ...rest, x: Math.round(finishX * xFrac) };
    }),
  };
}

/** 三角波 0→1→0,周期 2 */
function tri(p: number): number {
  const u = ((p % 2) + 2) % 2;
  return u < 1 ? u : 2 - u;
}

/**
 * 障碍在 t 时刻的世界坐标。两种障碍都是"时机闸门":
 * - rock: 弹跳滚石,小范围滚动 + 垂直弹跳,腾空时从下方通过
 * - drone: 水平游弋 + 垂直浮沉,升高时从下方通过
 */
export function obstaclePosition(
  ob: ObstacleDef,
  terrain: Terrain,
  t: number,
): { x: number; y: number } {
  const k = tri((t * ob.speed) / Math.max(0.001, ob.range) + (ob.phase ?? 0));
  const x = ob.x + (k * 2 - 1) * ob.range;
  if (ob.kind === 'rock') {
    const hop = Math.abs(Math.sin(t * 1.6 + (ob.phase ?? 0) * 2)) * 4.0;
    return { x, y: terrain.groundY(x) + ob.r + hop };
  }
  const bob = Math.sin(t * 1.4 + (ob.phase ?? 0) * 3) * 1.3;
  return { x, y: terrain.groundY(ob.x) + (ob.alt ?? 2.8) + bob };
}

export const LEVELS: LevelDef[] = [
  makeLevel({
    index: 0,
    name: '静海首航',
    sub: '平缓月海 · 熟悉手感',
    parTime: 90,
    ops: [
      { kind: 'flat', len: 30 },
      { kind: 'slope', len: 40, dy: 6 },
      { kind: 'flat', len: 20 },
      { kind: 'slope', len: 30, dy: -8 },
      { kind: 'pit', len: 18, depth: 3 },
      { kind: 'flat', len: 25 },
      { kind: 'slope', len: 50, dy: 10 },
      { kind: 'slope', len: 40, dy: -12 },
      { kind: 'flat', len: 20 },
      { kind: 'pit', len: 24, depth: 4 },
      { kind: 'flat', len: 30 },
      { kind: 'slope', len: 30, dy: 4 },
      { kind: 'flat', len: 55 },
    ],
    checkpointFracs: [0.33, 0.66],
    batteryFracs: [0.55],
    obstacles: [
      { kind: 'drone', xFrac: 0.86, range: 12, speed: 2.2, r: 0.9, alt: 3.2 },
    ],
  }),
  makeLevel({
    index: 1,
    name: '风暴洋裂谷',
    sub: '深坑频现 · 障碍巡逻',
    parTime: 135,
    ops: [
      { kind: 'flat', len: 25 },
      { kind: 'slope', len: 35, dy: 8 },
      { kind: 'pit', len: 22, depth: 4.5 },
      { kind: 'flat', len: 15 },
      { kind: 'slope', len: 45, dy: -12 },
      { kind: 'pit', len: 26, depth: 5.5 },
      { kind: 'flat', len: 20 },
      { kind: 'slope', len: 55, dy: 14 },
      { kind: 'flat', len: 12 },
      { kind: 'slope', len: 35, dy: -16 },
      { kind: 'pit', len: 30, depth: 6 },
      { kind: 'flat', len: 25 },
      { kind: 'slope', len: 40, dy: 9 },
      { kind: 'pit', len: 24, depth: 4.5 },
      { kind: 'flat', len: 20 },
      { kind: 'slope', len: 30, dy: -7 },
      { kind: 'flat', len: 55 },
    ],
    checkpointFracs: [0.25, 0.5, 0.75],
    batteryFracs: [0.35, 0.7],
    obstacles: [
      // 障碍一律放在平坦路段且远离坑沿;无人机浮沉封路,滚石大范围巡逻
      { kind: 'drone', xFrac: 0.5, range: 6, speed: 2.4, r: 0.9, alt: 3.3 },
      { kind: 'rock', xFrac: 0.69, range: 4, speed: 1.8, r: 1.0 },
      { kind: 'drone', xFrac: 0.845, range: 6, speed: 2.8, r: 0.9, alt: 3.4 },
    ],
  }),
  makeLevel({
    index: 2,
    name: '第谷环形山',
    sub: '陡坡深谷 · 能源告急',
    parTime: 175,
    ops: [
      { kind: 'flat', len: 25 },
      { kind: 'slope', len: 45, dy: 14 },
      { kind: 'slope', len: 30, dy: -18 },
      { kind: 'pit', len: 28, depth: 6 },
      { kind: 'flat', len: 15 },
      { kind: 'slope', len: 60, dy: 20 },
      { kind: 'pit', len: 26, depth: 5.5 },
      { kind: 'slope', len: 35, dy: -22 },
      { kind: 'flat', len: 18 },
      { kind: 'pit', len: 34, depth: 7 },
      { kind: 'slope', len: 50, dy: 16 },
      { kind: 'flat', len: 12 },
      { kind: 'slope', len: 40, dy: -20 },
      { kind: 'pit', len: 30, depth: 6.5 },
      { kind: 'flat', len: 20 },
      { kind: 'slope', len: 45, dy: 12 },
      { kind: 'pit', len: 24, depth: 5.5 },
      { kind: 'slope', len: 30, dy: -8 },
      { kind: 'flat', len: 60 },
    ],
    checkpointFracs: [0.25, 0.5, 0.75],
    batteryFracs: [0.14, 0.3, 0.46, 0.6, 0.68, 0.76],
    obstacles: [
      // 全部位于平坦路段(坑洞/陡坡只考驾驶,障碍只考时机)
      { kind: 'drone', xFrac: 0.28, range: 5, speed: 3.0, r: 0.9, alt: 3.3 },
      { kind: 'drone', xFrac: 0.45, range: 7, speed: 3.2, r: 0.9, alt: 3.3 },
      { kind: 'rock', xFrac: 0.61, range: 4, speed: 1.8, r: 1.1 },
      { kind: 'rock', xFrac: 0.762, range: 4, speed: 2.0, r: 1.0 },
    ],
  }),
];
