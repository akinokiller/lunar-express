// 月球车 2D 刚体物理:悬挂、驱动、空中姿态、冲击检测 —— 纯模块

import { DAMAGE, GRAVITY, ROVER } from './constants';
import type { Terrain } from './terrain';

export interface InputState {
  throttle: boolean;
  brake: boolean;
  /** -1 = 低头(顺时针),+1 = 抬头(逆时针),仅空中生效 */
  tilt: number;
}

export interface RoverState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 弧度,0 = 水平朝右,正值逆时针(抬头) */
  angle: number;
  av: number;
  wheelGrounded: [boolean, boolean];
  /** 真实接触状态(冲击事件边缘检测用) */
  wheelContact: [boolean, boolean];
  roofContact: boolean;
}

export type PhysicsEvent =
  | { type: 'impact'; vn: number; x: number; y: number }
  | { type: 'roof'; vn: number; x: number; y: number };

export function createRover(x: number, y: number): RoverState {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    angle: 0,
    av: 0,
    wheelGrounded: [false, false],
    wheelContact: [false, false],
    roofContact: false,
  };
}

export function wrapAngle(a: number): number {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
}

export function roverSpeed(s: RoverState): number {
  return Math.hypot(s.vx, s.vy);
}

/** 冲击伤害公式:<4 m/s 无伤;4–9 线性到 25;>9 加重,封顶 60 */
export function impactDamage(vn: number): number {
  if (vn < DAMAGE.safeImpact) return 0;
  if (vn <= DAMAGE.heavyImpact) {
    return (
      ((vn - DAMAGE.safeImpact) / (DAMAGE.heavyImpact - DAMAGE.safeImpact)) *
      DAMAGE.midMaxDamage
    );
  }
  return Math.min(
    DAMAGE.heavyCap,
    DAMAGE.midMaxDamage + (vn - DAMAGE.heavyImpact) * DAMAGE.heavyExtraPerMS,
  );
}

export function isHeavyImpact(vn: number): boolean {
  return vn > DAMAGE.heavyImpact;
}

/** 车轮世界坐标(车身系偏移旋转后平移) */
export function wheelWorld(
  s: RoverState,
  side: 0 | 1,
): { x: number; y: number } {
  const lx = side === 0 ? -ROVER.halfAxle : ROVER.halfAxle;
  const ly = ROVER.wheelY;
  const c = Math.cos(s.angle);
  const si = Math.sin(s.angle);
  return { x: s.x + lx * c - ly * si, y: s.y + lx * si + ly * c };
}

function roofWorld(s: RoverState, side: 0 | 1): { x: number; y: number } {
  const lx = side === 0 ? -ROVER.roofHalfWidth : ROVER.roofHalfWidth;
  const ly = ROVER.roofY;
  const c = Math.cos(s.angle);
  const si = Math.sin(s.angle);
  return { x: s.x + lx * c - ly * si, y: s.y + lx * si + ly * c };
}

/**
 * 推进一个固定步长。events 为输出数组(冲击/翻车事件,由上层换算伤害)。
 */
export function stepRover(
  s: RoverState,
  terrain: Terrain,
  input: InputState,
  dt: number,
  events: PhysicsEvent[],
): void {
  // 1. 重力
  s.vy -= GRAVITY * dt;

  // 2. 悬挂:对两个车轮采样点做弹簧-阻尼地面修正
  const c = Math.cos(s.angle);
  const si = Math.sin(s.angle);
  let anyGrounded = false;

  for (let i = 0 as 0 | 1; i < 2; i = (i + 1) as 0 | 1) {
    const lx = i === 0 ? -ROVER.halfAxle : ROVER.halfAxle;
    const ly = ROVER.wheelY;
    // 采样点(车轮中心)世界坐标与相对车心的力臂
    const rx = lx * c - ly * si;
    const ry = lx * si + ly * c;
    const px = s.x + rx;
    const py = s.y + ry;

    const h = terrain.groundY(px);
    const penetration = h + ROVER.wheelRadius - py; // >0 表示陷入地面
    const contact = penetration > 0; // 真实接触(用于冲击事件边缘检测)
    const grounded = penetration > -0.06; // 接地判定(驱动/刹车用,带容差)

    if (contact) {
      const n = terrain.normal(px);
      // 该点速度 = 质心速度 + ω × r
      const pvx = s.vx - s.av * ry;
      const pvy = s.vy + s.av * rx;
      const vn = pvx * n.x + pvy * n.y;

      // 新接触瞬间记录法向冲击速度(必须用真实接触边缘,
      // 否则高速落地会先落入接地容差区而吞掉事件)
      if (!s.wheelContact[i] && vn < -0.5) {
        events.push({ type: 'impact', vn: -vn, x: px, y: h });
      }

      let aN = ROVER.springK * penetration - ROVER.springC * vn;
      if (aN < 0) aN = 0;
      const fx = n.x * aN * ROVER.wheelShare;
      const fy = n.y * aN * ROVER.wheelShare;
      s.vx += fx * dt;
      s.vy += fy * dt;
      const torque = rx * fy - ry * fx;
      s.av += (torque / ROVER.inertia) * dt;
    }
    s.wheelContact[i] = contact;
    s.wheelGrounded[i] = grounded;
    if (grounded) anyGrounded = true;
  }

  // 3. 车顶着地(翻车):重伤害 + 弹回
  let roofNow = false;
  for (let i = 0 as 0 | 1; i < 2; i = (i + 1) as 0 | 1) {
    const p = roofWorld(s, i);
    const h = terrain.groundY(p.x);
    if (p.y < h + 0.05) {
      roofNow = true;
      if (!s.roofContact && s.vy < -DAMAGE.roofMinImpact) {
        events.push({ type: 'roof', vn: -s.vy, x: p.x, y: h });
      }
      // 强力弹簧顶出 + 回正力矩
      const pen = h + 0.05 - p.y;
      s.vy += ROVER.springK * pen * 0.8 * dt;
      const kick = wrapAngle(s.angle) > 0 ? -1 : 1;
      s.av += kick * 3.2 * dt + (Math.abs(s.av) < 0.5 ? kick * 1.4 * dt : 0);
      if (s.vy < 0) s.vy = Math.max(s.vy, -0.5);
    }
  }
  s.roofContact = roofNow;

  // 4. 驱动 / 刹车(需着地)
  const slope = terrain.slope(s.x);
  const tLen = Math.hypot(1, slope);
  const tx = 1 / tLen;
  const ty = slope / tLen;
  const vt = s.vx * tx + s.vy * ty;

  if (anyGrounded) {
    if (input.throttle) {
      if (vt < ROVER.maxDriveSpeed) {
        s.vx += tx * ROVER.engineAccel * dt;
        s.vy += ty * ROVER.engineAccel * dt;
      }
      // 仅单轮着地时才有抬头力矩;双轮着地陡坡攀爬不会翻过去
      if (s.wheelGrounded[0] !== s.wheelGrounded[1]) {
        s.av += ROVER.throttlePitch * dt;
      }
    }
    if (input.brake) {
      if (vt > 0.6) {
        s.vx -= tx * ROVER.brakeAccel * dt;
        s.vy -= ty * ROVER.brakeAccel * dt;
      } else if (vt > -3) {
        // 低速允许缓慢倒车
        s.vx -= tx * ROVER.reverseAccel * dt;
        s.vy -= ty * ROVER.reverseAccel * dt;
      }
      s.av -= ROVER.throttlePitch * dt; // 刹车轻微点头
    }
    // 滚动阻力
    s.vx -= tx * vt * ROVER.rollingDrag * dt;
    s.vy -= ty * vt * ROVER.rollingDrag * dt;
    // 悬挂几何稳定:双轮着地时车身趋向与坡度对齐,防止低速爬坡后翻
    if (s.wheelGrounded[0] && s.wheelGrounded[1]) {
      const target = Math.atan(slope);
      s.av += wrapAngle(target - s.angle) * 7 * dt;
    }
  } else {
    // 5. 空中姿态调整
    s.av += input.tilt * ROVER.airTilt * dt;
    if (input.throttle) s.av += ROVER.throttlePitch * 0.6 * dt;
    if (input.brake) s.av -= ROVER.throttlePitch * 0.6 * dt;
  }

  // 6. 阻尼与积分
  s.av -= s.av * ROVER.angularDamping * dt;
  s.vx -= s.vx * ROVER.airDrag * dt;

  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.angle = wrapAngle(s.angle + s.av * dt);

  // 7. 防穿透兜底(极端情况)
  const minY = terrain.groundY(s.x) + 0.15;
  if (s.y < minY) {
    s.y = minY;
    if (s.vy < 0) s.vy = 0;
  }
}
