// 月面地形:线段序列 + 高度/法线采样 —— 纯模块

export interface TerrainPoint {
  x: number;
  y: number;
}

export interface Terrain {
  points: TerrainPoint[];
  minX: number;
  maxX: number;
  /** 世界坐标 y 向上 */
  groundY(x: number): number;
  /** dy/dx */
  slope(x: number): number;
  /** 单位法线(指向地面上方) */
  normal(x: number): { x: number; y: number };
}

export function buildTerrain(points: TerrainPoint[]): Terrain {
  if (points.length < 2) throw new Error('terrain needs >= 2 points');
  const pts = [...points].sort((a, b) => a.x - b.x);
  const minX = pts[0].x;
  const maxX = pts[pts.length - 1].x;

  function segIndex(x: number): number {
    if (x <= pts[0].x) return 0;
    if (x >= pts[pts.length - 1].x) return pts.length - 2;
    let lo = 0;
    let hi = pts.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pts[mid].x <= x) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  function groundY(x: number): number {
    const i = segIndex(x);
    const a = pts[i];
    const b = pts[i + 1];
    const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
    const tc = Math.max(0, Math.min(1, t));
    return a.y + (b.y - a.y) * tc;
  }

  function slope(x: number): number {
    const i = segIndex(x);
    const a = pts[i];
    const b = pts[i + 1];
    return b.x === a.x ? 0 : (b.y - a.y) / (b.x - a.x);
  }

  function normal(x: number): { x: number; y: number } {
    const s = slope(x);
    const len = Math.hypot(s, 1);
    return { x: -s / len, y: 1 / len };
  }

  return { points: pts, minX, maxX, groundY, slope, normal };
}
