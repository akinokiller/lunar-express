// Canvas 渲染:复古科幻海报 × 现代扁平插画
import { CARGO_MAX, ENERGY } from './constants';
import { LEVELS, obstaclePosition, type LevelDef } from './levels';
import { wheelWorld, type RoverState } from './physics';
import type { Particles } from './particles';
import type { RunState, FailReason } from './run';
import type { ScoreBreakdown } from './scoring';
import type { SaveData } from './storage';

export type Screen =
  | 'title'
  | 'tutorial'
  | 'playing'
  | 'paused'
  | 'failed'
  | 'complete'
  | 'final';

export type ButtonVariant = 'primary' | 'ghost' | 'disabled';

export interface View {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  /** px / 米 */
  scale: number;
  camX: number;
  camY: number;
  screen: Screen;
  run: RunState | null;
  level: LevelDef;
  save: SaveData;
  time: number;
  particles: Particles;
  tutorialStep: number;
  lastScore: ScoreBreakdown | null;
  liveScore: number;
  portrait: boolean;
  button(x: number, y: number, w: number, h: number, label: string, action: string, variant?: ButtonVariant): void;
}

const C = {
  sky0: '#16122e',
  sky1: '#2a1b4a',
  sky2: '#4a2560',
  star: '#ffe9c9',
  planet: '#e2703a',
  planetDark: '#b5552f',
  ring: '#f6c453',
  farMountain: '#241a44',
  nearHill: '#342457',
  ground0: '#e6d7b2',
  ground1: '#c9a97e',
  groundLine: '#241a38',
  crater: '#b8956e',
  orange: '#e2703a',
  orangeDark: '#b5552f',
  cream: '#ffe9c9',
  cyan: '#3ec6c6',
  cyanDark: '#25999c',
  dark: '#241a38',
  red: '#e2483d',
  yellow: '#f6c453',
  purple: '#b565d8',
};

const FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif';

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

// ---------- 背景 ----------

function drawSky(v: View): void {
  const { ctx, W, H } = v;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C.sky0);
  g.addColorStop(0.55, C.sky1);
  g.addColorStop(1, C.sky2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawStars(v: View): void {
  const { ctx, W, H, camX, time } = v;
  const span = W + 60;
  for (let i = 0; i < 130; i++) {
    const bx = hash(i) * 4000;
    const par = 0.05 + hash(i + 50) * 0.08;
    let sx = (bx - camX * v.scale * par) % span;
    if (sx < -30) sx += span;
    const sy = hash(i + 100) * H * 0.62;
    const tw = 0.5 + 0.5 * Math.sin(time * (1 + hash(i + 200) * 2) + i);
    const r = 0.6 + hash(i + 300) * 1.6;
    ctx.globalAlpha = 0.35 + tw * 0.6;
    ctx.fillStyle = C.star;
    ctx.beginPath();
    ctx.arc(sx - 30, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPlanet(v: View): void {
  const { ctx, W, H, camX, scale } = v;
  // 带环巨行星(海报感)
  const px = W * 0.78 - camX * scale * 0.03;
  const py = H * 0.2;
  const r = Math.min(W, H) * 0.11;
  ctx.save();
  ctx.strokeStyle = C.ring;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = r * 0.1;
  ctx.beginPath();
  ctx.ellipse(px, py, r * 1.7, r * 0.45, -0.35, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.planet;
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.planetDark;
  ctx.beginPath();
  ctx.arc(px - r * 0.25, py + r * 0.2, r * 0.82, 0, Math.PI * 2);
  ctx.fill();
  // 遮出月牙高光
  ctx.fillStyle = C.planet;
  ctx.beginPath();
  ctx.arc(px - r * 0.05, py + r * 0.05, r * 0.68, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 远处太阳光芒
  const sx = W * 0.12 - camX * scale * 0.02;
  const sy = H * 0.3;
  const sr = Math.min(W, H) * 0.045;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.fillStyle = C.yellow;
  for (let i = 0; i < 12; i++) {
    ctx.rotate(Math.PI / 6);
    ctx.globalAlpha = 0.5;
    ctx.fillRect(-sr * 0.08, -sr * 2.1, sr * 0.16, sr * 0.9);
  }
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(0, 0, sr, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function ridgeY(x: number, seed: number): number {
  return (
    Math.sin(x * 0.013 + seed) * 3.2 +
    Math.sin(x * 0.031 + seed * 2.7) * 1.8 +
    Math.sin(x * 0.007 + seed * 1.3) * 5
  );
}

function drawRidge(v: View, par: number, color: string, baseY: number, seed: number): void {
  const { ctx, W, H, camX, scale } = v;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-20, H + 20);
  for (let sx = -20; sx <= W + 20; sx += 14) {
    const wx = camX * par + (sx - W / 2) / scale;
    const y = H * baseY - ridgeY(wx, seed) * scale * 0.9;
    ctx.lineTo(sx, y);
  }
  ctx.lineTo(W + 20, H + 20);
  ctx.closePath();
  ctx.fill();
}

// ---------- 地形与关卡元素 ----------

function worldPath(v: View): void {
  // 可见地形轮廓
  const { ctx, W, H, camX, camY, scale, level } = v;
  const w2sx = (x: number) => (x - camX) * scale + W / 2;
  const w2sy = (y: number) => H * 0.55 - (y - camY) * scale;
  const pts = level.terrain.points;
  const x0 = camX - W / 2 / scale - 4;
  const x1 = camX + W / 2 / scale + 4;

  // 填充
  const g = ctx.createLinearGradient(0, w2sy(camY + 6), 0, H);
  g.addColorStop(0, C.ground0);
  g.addColorStop(1, C.ground1);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(w2sx(x0), H + 40);
  let started = false;
  for (const p of pts) {
    if (p.x < x0) continue;
    if (p.x > x1) break;
    if (!started) {
      ctx.lineTo(w2sx(p.x), w2sy(p.y));
      started = true;
    } else {
      ctx.lineTo(w2sx(p.x), w2sy(p.y));
    }
  }
  ctx.lineTo(w2sx(x1), H + 40);
  ctx.closePath();
  ctx.fill();

  // 装饰陨石坑(确定性)
  ctx.fillStyle = C.crater;
  for (let i = Math.floor(x0 / 26); i < x1 / 26; i++) {
    const cx = i * 26 + hash(i) * 16;
    if (cx < level.startX + 6 || cx > level.finishX - 4) continue;
    const cy = level.terrain.groundY(cx);
    const r = 1 + hash(i + 7) * 2.2;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(w2sx(cx), w2sy(cy) + 2, r * scale * 0.5, r * scale * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // 轮廓线
  ctx.strokeStyle = C.groundLine;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  started = false;
  for (const p of pts) {
    if (p.x < x0) continue;
    if (p.x > x1) break;
    if (!started) {
      ctx.moveTo(w2sx(p.x), w2sy(p.y));
      started = true;
    } else {
      ctx.lineTo(w2sx(p.x), w2sy(p.y));
    }
  }
  ctx.stroke();
}

function drawCheckpoints(v: View): void {
  const { ctx, W, H, camX, camY, scale, level, run, time } = v;
  const w2sx = (x: number) => (x - camX) * scale + W / 2;
  const w2sy = (y: number) => H * 0.55 - (y - camY) * scale;
  level.checkpoints.forEach((cx, i) => {
    const sx = w2sx(cx);
    if (sx < -60 || sx > W + 60) return;
    const gy = level.terrain.groundY(cx);
    const sy = w2sy(gy);
    const passed = run !== null && run.checkpoint >= i;
    const pulse = 0.55 + 0.3 * Math.sin(time * 3 + i * 2);
    // 光柱
    const lg = ctx.createLinearGradient(0, sy - 130, 0, sy);
    lg.addColorStop(0, 'rgba(62,198,198,0)');
    lg.addColorStop(1, passed ? 'rgba(62,198,198,0.10)' : `rgba(62,198,198,${0.35 * pulse})`);
    ctx.fillStyle = lg;
    ctx.fillRect(sx - 8, sy - 130, 16, 130);
    // 旗杆与旗
    ctx.strokeStyle = C.dark;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx, sy - 44);
    ctx.stroke();
    ctx.fillStyle = passed ? C.cyanDark : C.cyan;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 44);
    ctx.lineTo(sx + 22, sy - 37);
    ctx.lineTo(sx, sy - 30);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.dark;
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function drawBatteries(v: View): void {
  const { ctx, W, H, camX, camY, scale, level, run, time } = v;
  const w2sx = (x: number) => (x - camX) * scale + W / 2;
  const w2sy = (y: number) => H * 0.55 - (y - camY) * scale;
  level.batteries.forEach((bx, i) => {
    if (run?.collectedBatteries.includes(i)) return;
    const sx = w2sx(bx);
    if (sx < -40 || sx > W + 40) return;
    const by = level.terrain.groundY(bx) + 1.1 + Math.sin(time * 2.5 + i * 1.7) * 0.18;
    const sy = w2sy(by);
    const w = 0.62 * scale;
    const h = 1.0 * scale;
    ctx.save();
    ctx.shadowColor = C.cyan;
    ctx.shadowBlur = 14;
    ctx.fillStyle = C.cyan;
    rr(ctx, sx - w / 2, sy - h / 2, w, h, w * 0.3);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.cream;
    ctx.fillRect(sx - w * 0.14, sy - h * 0.3, w * 0.28, h * 0.6);
    ctx.fillRect(sx - w * 0.3, sy - h * 0.14, w * 0.6, h * 0.28);
    ctx.fillStyle = C.dark;
    rr(ctx, sx - w * 0.22, sy - h / 2 - 4, w * 0.44, 5, 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawObstacles(v: View): void {
  const { ctx, W, H, camX, camY, scale, level, run, time } = v;
  const w2sx = (x: number) => (x - camX) * scale + W / 2;
  const w2sy = (y: number) => H * 0.55 - (y - camY) * scale;
  const t = run ? run.time : time;
  for (const ob of level.obstacles) {
    const p = obstaclePosition(ob, level.terrain, t);
    const sx = w2sx(p.x);
    if (sx < -80 || sx > W + 80) continue;
    const sy = w2sy(p.y);
    if (ob.kind === 'drone') {
      const rw = ob.r * scale * 1.5;
      // 碟形无人机
      ctx.fillStyle = C.purple;
      ctx.beginPath();
      ctx.ellipse(sx, sy, rw, rw * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.dark;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = C.cyan;
      ctx.beginPath();
      ctx.arc(sx, sy - rw * 0.28, rw * 0.42, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
      // 警示灯
      const blink = Math.sin(time * 8) > 0;
      ctx.fillStyle = blink ? C.red : C.yellow;
      ctx.beginPath();
      ctx.arc(sx - rw * 0.6, sy, 3.2, 0, Math.PI * 2);
      ctx.arc(sx + rw * 0.6, sy, 3.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const r = ob.r * scale;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(t * 1.5);
      ctx.fillStyle = '#5a4a6e';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.dark;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#463a58';
      ctx.beginPath();
      ctx.arc(-r * 0.3, -r * 0.2, r * 0.28, 0, Math.PI * 2);
      ctx.arc(r * 0.35, r * 0.3, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawFinish(v: View): void {
  const { ctx, W, H, camX, camY, scale, level, time } = v;
  const w2sx = (x: number) => (x - camX) * scale + W / 2;
  const w2sy = (y: number) => H * 0.55 - (y - camY) * scale;
  const fx = level.finishX;
  const sx = w2sx(fx);
  if (sx < -300 || sx > W + 300) return;
  const gy = level.terrain.groundY(fx);
  const sy = w2sy(gy);
  // 基地平台
  ctx.fillStyle = C.dark;
  rr(ctx, sx - 10, sy - 6, 7.5 * scale, 10, 3);
  ctx.fill();
  // 穹顶
  const domeR = 1.9 * scale;
  ctx.fillStyle = C.cream;
  ctx.beginPath();
  ctx.arc(sx + 3.2 * scale, sy - 8, domeR, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = C.dark;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = C.cyan;
  ctx.beginPath();
  ctx.arc(sx + 3.2 * scale, sy - 8 - domeR * 0.25, domeR * 0.4, Math.PI, 0);
  ctx.fill();
  ctx.stroke();
  // 信标光柱
  const pulse = 0.5 + 0.35 * Math.sin(time * 4);
  const lg = ctx.createLinearGradient(0, sy - 220, 0, sy);
  lg.addColorStop(0, 'rgba(62,198,198,0)');
  lg.addColorStop(1, `rgba(62,198,198,${0.5 * pulse})`);
  ctx.fillStyle = lg;
  ctx.fillRect(sx + 3.2 * scale - 10, sy - 220, 20, 220 - 8);
  // 标牌
  ctx.fillStyle = C.dark;
  ctx.font = `bold ${Math.round(11 + scale * 0.12)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('BASE', sx + 3.2 * scale, sy + 16);
}

// ---------- 车辆 ----------

function drawRover(v: View, rover: RoverState): void {
  const { ctx, W, H, camX, camY, scale } = v;
  const w2sx = (x: number) => (x - camX) * scale + W / 2;
  const w2sy = (y: number) => H * 0.55 - (y - camY) * scale;

  // 车轮(世界系,带辐条自转)
  for (const side of [0, 1] as const) {
    const w = wheelWorld(rover, side);
    const sx = w2sx(w.x);
    const sy = w2sy(w.y);
    const r = 0.42 * scale;
    const spin = rover.x / 0.42;
    ctx.fillStyle = C.dark;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.cream;
    ctx.lineWidth = 2.5;
    for (let k = 0; k < 3; k++) {
      const a = spin + (k * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(a) * r * 0.75, sy + Math.sin(a) * r * 0.75);
      ctx.stroke();
    }
    ctx.fillStyle = C.cream;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  // 车身(米制坐标绘制)
  const sx = w2sx(rover.x);
  const sy = w2sy(rover.y);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-rover.angle);
  ctx.scale(scale, -scale);
  ctx.lineWidth = 0.07;
  ctx.strokeStyle = C.dark;

  // 悬挂连杆
  ctx.beginPath();
  ctx.moveTo(-1.05, -0.1);
  ctx.lineTo(-1.05, -0.4);
  ctx.moveTo(1.05, -0.1);
  ctx.lineTo(1.05, -0.4);
  ctx.stroke();

  // 主车体
  ctx.fillStyle = C.orange;
  ctx.beginPath();
  ctx.roundRect(-1.35, -0.18, 2.7, 0.68, 0.22);
  ctx.fill();
  ctx.stroke();
  // 车腹深色
  ctx.fillStyle = C.orangeDark;
  ctx.beginPath();
  ctx.roundRect(-1.35, -0.18, 2.7, 0.24, 0.12);
  ctx.fill();

  // 驾驶舱
  ctx.fillStyle = C.cream;
  ctx.beginPath();
  ctx.roundRect(0.1, 0.5, 0.95, 0.62, 0.18);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.cyan;
  ctx.beginPath();
  ctx.roundRect(0.42, 0.62, 0.5, 0.36, 0.1);
  ctx.fill();
  ctx.stroke();

  // 货物:能源核心(发光青晶)
  const glow = 0.75 + 0.25 * Math.sin(v.time * 5);
  ctx.save();
  ctx.shadowColor = C.cyan;
  ctx.shadowBlur = 18 * glow;
  ctx.fillStyle = C.cyan;
  ctx.beginPath();
  ctx.arc(-0.62, 0.78, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = C.dark;
  ctx.beginPath();
  ctx.arc(-0.62, 0.78, 0.3, 0, Math.PI * 2);
  ctx.stroke();
  // 固定架
  ctx.beginPath();
  ctx.moveTo(-1.05, 0.5);
  ctx.lineTo(-0.2, 0.5);
  ctx.stroke();
  ctx.restore();
}

// ---------- 粒子 ----------

function drawParticles(v: View): void {
  const { ctx, W, H, camX, camY, scale, particles } = v;
  const w2sx = (x: number) => (x - camX) * scale + W / 2;
  const w2sy = (y: number) => H * 0.55 - (y - camY) * scale;
  for (const p of particles.list) {
    const k = 1 - p.life / p.maxLife;
    ctx.globalAlpha = Math.max(0, k) * 0.9;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(w2sx(p.x), w2sy(p.y), Math.max(1, p.size * scale * (0.5 + k * 0.5)), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------- HUD ----------

function drawBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  color: string,
  label: string,
): void {
  ctx.fillStyle = 'rgba(20,12,40,0.72)';
  rr(ctx, x, y, w, h, h / 2);
  ctx.fill();
  const r = Math.max(0, Math.min(1, ratio));
  if (r > 0.01) {
    ctx.fillStyle = color;
    rr(ctx, x + 2, y + 2, Math.max(h - 4, (w - 4) * r), h - 4, (h - 4) / 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,233,201,0.55)';
  ctx.lineWidth = 1.5;
  rr(ctx, x, y, w, h, h / 2);
  ctx.stroke();
  ctx.fillStyle = C.cream;
  ctx.font = `bold ${Math.round(h * 0.62)}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 8, y + h / 2 + 0.5);
  ctx.textBaseline = 'alphabetic';
}

function drawHUD(v: View): void {
  const { ctx, W, H, run, level } = v;
  if (!run) return;
  const pad = Math.max(10, W * 0.012);
  const compact = W < 640;

  // 速度
  ctx.fillStyle = 'rgba(20,12,40,0.72)';
  rr(ctx, pad, pad, compact ? 96 : 128, compact ? 46 : 56, 10);
  ctx.fill();
  ctx.fillStyle = C.cream;
  ctx.font = `bold ${compact ? 20 : 26}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(run.speed.toFixed(1), pad + 12, pad + (compact ? 29 : 35));
  ctx.font = `${compact ? 10 : 12}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,233,201,0.7)';
  ctx.fillText('m/s', pad + (compact ? 62 : 82), pad + (compact ? 29 : 35));

  // 能源 / 货物条
  const barW = compact ? W * 0.26 : 190;
  const barH = compact ? 17 : 20;
  const bx = W / 2 - barW - 6;
  drawBar(ctx, bx, pad, barW, barH, run.energy / ENERGY.max, run.energy < 25 ? C.red : C.cyan, '能源');
  drawBar(
    ctx,
    W / 2 + 6,
    pad,
    barW,
    barH,
    run.cargo / CARGO_MAX,
    run.cargo < 30 ? C.red : C.orange,
    '货物',
  );

  // 时间与得分
  ctx.fillStyle = 'rgba(20,12,40,0.72)';
  const tw = compact ? 118 : 150;
  rr(ctx, W - pad - tw - (compact ? 44 : 52), pad, tw, compact ? 46 : 56, 10);
  ctx.fill();
  ctx.fillStyle = C.cream;
  ctx.font = `bold ${compact ? 15 : 17}px ${FONT}`;
  ctx.textAlign = 'center';
  const tx = W - pad - tw / 2 - (compact ? 44 : 52);
  ctx.fillText(formatTime(run.time), tx, pad + (compact ? 19 : 23));
  ctx.font = `${compact ? 11 : 12}px ${FONT}`;
  ctx.fillStyle = C.yellow;
  ctx.fillText(`得分 ${v.liveScore}`, tx, pad + (compact ? 36 : 42));

  // 暂停按钮
  v.button(W - pad - (compact ? 40 : 46), pad, compact ? 40 : 46, compact ? 46 : 56, 'Ⅱ', 'pause', 'ghost');

  // 底部进度条
  const progW = Math.min(W * 0.6, 460);
  const px = W / 2 - progW / 2;
  const py = H - (v.portrait ? 96 : 18);
  const ratio = Math.max(0, Math.min(1, (run.rover.x - level.startX) / (level.finishX - level.startX)));
  ctx.fillStyle = 'rgba(20,12,40,0.6)';
  rr(ctx, px, py, progW, 6, 3);
  ctx.fill();
  ctx.fillStyle = C.orange;
  rr(ctx, px, py, progW * ratio, 6, 3);
  ctx.fill();
  for (const cp of level.checkpoints) {
    const cr = (cp - level.startX) / (level.finishX - level.startX);
    ctx.fillStyle = C.cyan;
    ctx.fillRect(px + progW * cr - 1.5, py - 2, 3, 10);
  }
  ctx.fillStyle = C.cream;
  ctx.beginPath();
  ctx.arc(px + progW * ratio, py + 3, 5, 0, Math.PI * 2);
  ctx.fill();

  // 竖屏提示
  if (v.portrait) {
    ctx.fillStyle = 'rgba(255,233,201,0.75)';
    ctx.font = `12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('竖屏可玩 · 横屏体验更佳', W / 2, H - 8);
  }
}

// ---------- 界面 ----------

function dim(v: View, alpha = 0.72): void {
  v.ctx.fillStyle = `rgba(16,10,34,${alpha})`;
  v.ctx.fillRect(0, 0, v.W, v.H);
}

function panel(v: View, w: number, h: number): { x: number; y: number } {
  const x = v.W / 2 - w / 2;
  const y = v.H / 2 - h / 2;
  v.ctx.fillStyle = 'rgba(36,26,56,0.96)';
  rr(v.ctx, x, y, w, h, 16);
  v.ctx.fill();
  v.ctx.strokeStyle = C.cream;
  v.ctx.lineWidth = 2.5;
  rr(v.ctx, x, y, w, h, 16);
  v.ctx.stroke();
  return { x, y };
}

function bigTitle(v: View, text: string, y: number, size: number, color = C.cream): void {
  const { ctx, W } = v;
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = size * 0.08;
  ctx.fillText(text, W / 2, y);
  ctx.restore();
}

function drawTitle(v: View): void {
  const { ctx, W, H, save } = v;
  dim(v, 0.45);
  const titleY = H * 0.2;
  bigTitle(v, '月面快递', titleY, Math.min(64, W * 0.11));
  ctx.fillStyle = C.yellow;
  ctx.font = `bold ${Math.min(17, W * 0.03)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('LUNAR EXPRESS · 易碎能源核心运输', W / 2, titleY + Math.min(64, W * 0.11) * 0.65);

  // 关卡卡片
  const cw = Math.min(210, (W - 80) / 3 - 12);
  const ch = cw * 0.82;
  const gap = Math.min(20, W * 0.03);
  const totalW = cw * 3 + gap * 2;
  const y0 = H * 0.36;
  for (let i = 0; i < 3; i++) {
    const x = W / 2 - totalW / 2 + i * (cw + gap);
    const locked = i + 1 > save.unlocked;
    ctx.fillStyle = locked ? 'rgba(60,50,80,0.85)' : 'rgba(36,26,56,0.95)';
    rr(ctx, x, y0, cw, ch, 14);
    ctx.fill();
    ctx.strokeStyle = locked ? 'rgba(255,233,201,0.25)' : C.orange;
    ctx.lineWidth = 2.5;
    rr(ctx, x, y0, cw, ch, 14);
    ctx.stroke();

    ctx.textAlign = 'center';
    if (locked) {
      ctx.fillStyle = 'rgba(255,233,201,0.4)';
      ctx.font = `900 ${cw * 0.3}px ${FONT}`;
      ctx.fillText('🔒', x + cw / 2, y0 + ch * 0.5);
      ctx.font = `${cw * 0.09}px ${FONT}`;
      ctx.fillText('通关前一关解锁', x + cw / 2, y0 + ch * 0.72);
    } else {
      const lv = LEVELS[i];
      ctx.fillStyle = C.yellow;
      ctx.font = `bold ${cw * 0.085}px ${FONT}`;
      ctx.fillText(`第 ${i + 1} 关`, x + cw / 2, y0 + ch * 0.2);
      ctx.fillStyle = C.cream;
      ctx.font = `900 ${cw * 0.13}px ${FONT}`;
      ctx.fillText(lv.name, x + cw / 2, y0 + ch * 0.4);
      ctx.fillStyle = 'rgba(255,233,201,0.65)';
      ctx.font = `${cw * 0.075}px ${FONT}`;
      ctx.fillText(lv.sub, x + cw / 2, y0 + ch * 0.56);
      ctx.fillStyle = C.cyan;
      ctx.font = `bold ${cw * 0.08}px ${FONT}`;
      const best = save.highScores[i];
      ctx.fillText(best > 0 ? `最高分 ${best}` : '尚未通关', x + cw / 2, y0 + ch * 0.76);
      v.button(x, y0, cw, ch, '', `level:${i}`, 'ghost');
    }
  }

  // 底部按钮行
  const bw = Math.min(150, W * 0.3);
  const by = Math.min(H - 70, y0 + ch + 36);
  v.button(W / 2 - bw - 10, by, bw, 46, save.soundOn ? '音效:开' : '音效:关', 'sound', 'primary');
  v.button(W / 2 + 10, by, bw, 46, save.tutorialSeen ? '重看引导' : '玩法引导', 'howto', 'primary');

  ctx.fillStyle = 'rgba(255,233,201,0.6)';
  ctx.font = `13px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('→/D 油门 · ←/A 刹车 · 空中 ←/→ 调整姿态 · Esc 暂停', W / 2, H - 18);
}

function drawTutorial(v: View): void {
  const { ctx, W, H, tutorialStep } = v;
  dim(v, 0.6);
  const w = Math.min(520, W - 32);
  const h = Math.min(340, H - 60);
  const { x, y } = panel(v, w, h);

  const steps: { title: string; lines: string[]; keys: string[] }[] = [
    {
      title: '驾驶',
      lines: ['→ / D / ↑ 踩油门加速', '← / A / ↓ 刹车,低速可倒车', '月面重力只有地球的 1/6,车会飞!'],
      keys: ['←', '→'],
    },
    {
      title: '空中姿态',
      lines: ['飞起来以后,← 抬车头 / → 压车头', '尽量双轮同时落地', '车顶着地会严重损坏货物!'],
      keys: ['↻', '↺'],
    },
    {
      title: '货物与能源',
      lines: ['轻柔落地(<5 m/s)不伤货物,重着陆按冲击扣血', '踩油门消耗能源,滑行时缓慢回充', '沿途拾取青色电池补充能源'],
      keys: ['⚡', '📦'],
    },
    {
      title: '检查点与终点',
      lines: ['通过蓝色光柱存档,失败可从检查点复活', '无人机与弹跳滚石:看好节奏再通过', '低速(<5.5 m/s)驶入基地才算送达'],
      keys: ['🚩', '🛸'],
    },
  ];
  const step = steps[Math.min(tutorialStep, steps.length - 1)];

  ctx.textAlign = 'center';
  ctx.fillStyle = C.yellow;
  ctx.font = `bold 15px ${FONT}`;
  ctx.fillText(`新手指引 ${tutorialStep + 1} / ${steps.length}`, W / 2, y + 34);
  ctx.fillStyle = C.cream;
  ctx.font = `900 30px ${FONT}`;
  ctx.fillText(step.title, W / 2, y + 74);

  // 图标键帽
  const keyY = y + 116;
  step.keys.forEach((k, i) => {
    const kx = W / 2 + (i - (step.keys.length - 1) / 2) * 64;
    ctx.fillStyle = C.orange;
    rr(ctx, kx - 24, keyY - 24, 48, 48, 10);
    ctx.fill();
    ctx.strokeStyle = C.dark;
    ctx.lineWidth = 3;
    rr(ctx, kx - 24, keyY - 24, 48, 48, 10);
    ctx.stroke();
    ctx.fillStyle = C.cream;
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillText(k, kx, keyY + 9);
  });

  ctx.fillStyle = 'rgba(255,233,201,0.9)';
  ctx.font = `15px ${FONT}`;
  step.lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, y + 178 + i * 26);
  });

  const bw = 130;
  v.button(W / 2 - bw / 2, y + h - 60, bw, 42, tutorialStep + 1 >= steps.length ? '出发!' : '下一步', 'tutorial:next', 'primary');
  v.button(x + w - 86, y + 12, 74, 30, '跳过', 'tutorial:skip', 'ghost');
}

function drawPaused(v: View): void {
  const { W } = v;
  dim(v);
  bigTitle(v, '已暂停', v.H * 0.26, 44);
  const bw = Math.min(240, W * 0.7);
  const bh = 48;
  const x = W / 2 - bw / 2;
  let y = v.H * 0.36;
  v.button(x, y, bw, bh, '继续', 'resume', 'primary');
  y += bh + 14;
  v.button(x, y, bw, bh, '重开本关', 'restart', 'primary');
  y += bh + 14;
  v.button(x, y, bw, bh, v.save.soundOn ? '音效:开' : '音效:关', 'sound', 'primary');
  y += bh + 14;
  v.button(x, y, bw, bh, '退出到选关', 'quit', 'ghost');
}

function drawFailed(v: View, reason: FailReason | null): void {
  const { ctx, W, run } = v;
  dim(v);
  bigTitle(v, '快递失败', v.H * 0.24, 46, C.red);
  ctx.fillStyle = C.cream;
  ctx.font = `bold 19px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(reason === 'cargo' ? '能源核心彻底损毁…' : '能源耗尽,车辆抛锚…', W / 2, v.H * 0.24 + 44);
  if (run) {
    ctx.fillStyle = 'rgba(255,233,201,0.7)';
    ctx.font = `15px ${FONT}`;
    ctx.fillText(
      `坚持了 ${formatTime(run.time)} · 到达 ${Math.round((run.rover.x / v.level.finishX) * 100)}% 处`,
      W / 2,
      v.H * 0.24 + 72,
    );
  }
  const bw = Math.min(260, W * 0.72);
  const bh = 48;
  const x = W / 2 - bw / 2;
  let y = v.H * 0.42;
  if (run?.snapshot) {
    v.button(x, y, bw, bh, `检查点复活 (+15s · -150分)`, 'respawn', 'primary');
    y += bh + 14;
  }
  v.button(x, y, bw, bh, '重开本关', 'restart', 'primary');
  y += bh + 14;
  v.button(x, y, bw, bh, '退出到选关', 'quit', 'ghost');
}

function drawComplete(v: View): void {
  const { ctx, W, lastScore, level } = v;
  dim(v);
  bigTitle(v, '送达成功!', v.H * 0.2, 46, C.cyan);
  if (lastScore) {
    const rows: [string, string, string][] = [
      ['基础运费', `${lastScore.base}`, C.cream],
      ['时间奖励', `+${lastScore.timeBonus}`, C.cyan],
      ['货物完好加成', `+${lastScore.cargoBonus}`, C.orange],
      ['能源剩余加成', `+${lastScore.energyBonus}`, C.cyan],
      ['复活惩罚', `-${lastScore.penalty}`, C.red],
    ];
    const w = Math.min(320, W - 48);
    const x = W / 2 - w / 2;
    let y = v.H * 0.28;
    ctx.font = `16px ${FONT}`;
    for (const [label, val, color] of rows) {
      ctx.fillStyle = 'rgba(255,233,201,0.75)';
      ctx.textAlign = 'left';
      ctx.fillText(label, x, y);
      ctx.fillStyle = color;
      ctx.textAlign = 'right';
      ctx.fillText(val, x + w, y);
      y += 28;
    }
    ctx.strokeStyle = 'rgba(255,233,201,0.4)';
    ctx.beginPath();
    ctx.moveTo(x, y - 14);
    ctx.lineTo(x + w, y - 14);
    ctx.stroke();
    ctx.fillStyle = C.yellow;
    ctx.font = `900 26px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(`${lastScore.total}`, x + w, y + 14);
    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = 'rgba(255,233,201,0.75)';
    ctx.textAlign = 'left';
    ctx.fillText('本关得分', x, y + 14);
    const best = v.save.highScores[level.index];
    ctx.fillStyle = C.cyan;
    ctx.font = `13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`历史最高 ${best}`, W / 2, y + 42);
  }
  const bw = Math.min(240, W * 0.7);
  const bh = 46;
  const x = W / 2 - bw / 2;
  let y = v.H * 0.68;
  const isLast = level.index >= 2;
  v.button(x, y, bw, bh, isLast ? '查看总评' : '下一关', 'next', 'primary');
  y += bh + 12;
  v.button(x, y, bw, bh, '重玩本关', 'restart', 'primary');
  y += bh + 12;
  v.button(x, y, bw, bh, '退出到选关', 'quit', 'ghost');
}

function drawFinal(v: View, total: number, rating: string): void {
  const { ctx, W } = v;
  dim(v, 0.8);
  bigTitle(v, '全部送达!', v.H * 0.22, 50, C.yellow);
  ctx.fillStyle = C.cream;
  ctx.font = `19px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('月面快递网络全线贯通', W / 2, v.H * 0.22 + 42);
  ctx.font = `900 44px ${FONT}`;
  ctx.fillStyle = C.cyan;
  ctx.fillText(`${total}`, W / 2, v.H * 0.44);
  ctx.font = `15px ${FONT}`;
  ctx.fillStyle = 'rgba(255,233,201,0.7)';
  ctx.fillText('三关最高分合计', W / 2, v.H * 0.44 + 26);
  ctx.font = `bold 24px ${FONT}`;
  ctx.fillStyle = C.orange;
  ctx.fillText(rating, W / 2, v.H * 0.55);
  const bw = Math.min(240, W * 0.7);
  v.button(W / 2 - bw / 2, v.H * 0.66, bw, 48, '回到选关', 'quit', 'primary');
}

// ---------- 主入口 ----------

export function render(v: View, finalTotal: number, finalRating: string, failReason: FailReason | null): void {
  const { ctx, W, H, run } = v;
  ctx.clearRect(0, 0, W, H);
  drawSky(v);
  drawStars(v);
  drawPlanet(v);
  drawRidge(v, 0.22, C.farMountain, 0.66, 1.7);
  drawRidge(v, 0.45, C.nearHill, 0.74, 4.2);
  worldPath(v);
  drawCheckpoints(v);
  drawFinish(v);
  drawBatteries(v);
  drawObstacles(v);
  if (run) drawRover(v, run.rover);
  drawParticles(v);

  if (v.screen === 'playing') drawHUD(v);
  else if (v.screen === 'title') drawTitle(v);
  else if (v.screen === 'tutorial') {
    drawHUD(v);
    drawTutorial(v);
  } else if (v.screen === 'paused') {
    drawHUD(v);
    drawPaused(v);
  } else if (v.screen === 'failed') {
    drawFailed(v, failReason);
  } else if (v.screen === 'complete') {
    drawComplete(v);
  } else if (v.screen === 'final') {
    drawFinal(v, finalTotal, finalRating);
  }
}
