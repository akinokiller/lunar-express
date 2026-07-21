// 单局运行状态:货物、能源、检查点、障碍、胜负判定 —— 纯模块

import { CARGO_MAX, DAMAGE, ENERGY, FINISH_PROTECT_DIST, SCORING } from './constants';
import {
  obstaclePosition,
  type LevelDef,
} from './levels';
import {
  createRover,
  impactDamage,
  isHeavyImpact,
  roverSpeed,
  stepRover,
  type InputState,
  type RoverState,
} from './physics';
import type { Terrain } from './terrain';

export type RunStatus = 'running' | 'failed' | 'complete';
export type FailReason = 'cargo' | 'energy';

export interface CheckpointSnapshot {
  x: number;
  y: number;
  cargo: number;
  energy: number;
  time: number;
}

export interface RunState {
  levelIndex: number;
  rover: RoverState;
  cargo: number;
  energy: number;
  time: number;
  status: RunStatus;
  failReason: FailReason | null;
  /** 已通过的最新检查点下标,-1 = 未通过任何检查点 */
  checkpoint: number;
  snapshot: CheckpointSnapshot | null;
  respawns: number;
  collectedBatteries: number[];
  obstacleCooldowns: number[];
  finishCooldown: number;
  speed: number;
}

export type RunEvent =
  | { type: 'damage'; amount: number; heavy: boolean; x: number; y: number; kind: 'impact' | 'roof' | 'obstacle' | 'finish' }
  | { type: 'checkpoint'; index: number; x: number; y: number }
  | { type: 'battery'; index: number; x: number; y: number }
  | { type: 'win' }
  | { type: 'fail'; reason: FailReason };

export function createRun(levelIndex: number, level: LevelDef): RunState {
  const terrain = level.terrain;
  const rover = createRover(level.startX, terrain.groundY(level.startX) + 1.2);
  return {
    levelIndex,
    rover,
    cargo: CARGO_MAX,
    energy: ENERGY.max,
    time: 0,
    status: 'running',
    failReason: null,
    checkpoint: -1,
    snapshot: null,
    respawns: 0,
    collectedBatteries: [],
    obstacleCooldowns: level.obstacles.map(() => 0),
    finishCooldown: 0,
    speed: 0,
  };
}

function applyDamage(
  run: RunState,
  events: RunEvent[],
  amount: number,
  kind: 'impact' | 'roof' | 'obstacle' | 'finish',
  heavy: boolean,
  x: number,
  y: number,
): void {
  if (amount <= 0.05) return;
  run.cargo = Math.max(0, run.cargo - amount);
  events.push({ type: 'damage', amount, heavy, x, y, kind });
}

/** 推进一个固定物理步长,返回本步发生的事件 */
export function stepRun(
  run: RunState,
  level: LevelDef,
  terrain: Terrain,
  input: InputState,
  dt: number,
): RunEvent[] {
  const events: RunEvent[] = [];
  if (run.status !== 'running') return events;

  run.time += dt;

  // 能源为 0 时引擎失效(只能滑行)
  const effectiveInput: InputState =
    run.energy > 0 ? input : { ...input, throttle: false };

  // 物理
  const physEvents: Parameters<typeof stepRover>[4] = [];
  stepRover(run.rover, terrain, effectiveInput, dt, physEvents);
  run.speed = roverSpeed(run.rover);

  // 终点保护区(基地磁力软着陆/装卸保护):区内一切冲击不伤货物
  const inFinishSafeZone = run.rover.x >= level.finishX - FINISH_PROTECT_DIST;

  for (const ev of physEvents) {
    if (inFinishSafeZone) break;
    if (ev.type === 'impact') {
      applyDamage(run, events, impactDamage(ev.vn), 'impact', isHeavyImpact(ev.vn), ev.x, ev.y);
    } else {
      const scale = Math.min(2, Math.max(0.8, ev.vn / 3));
      applyDamage(run, events, DAMAGE.roofBase * scale, 'roof', true, ev.x, ev.y);
    }
  }

  // 能源:踩油门消耗;行驶中(速度足够)松油门动能回收,静止/爬行不回充
  if (input.throttle && run.energy > 0) {
    run.energy = Math.max(0, run.energy - ENERGY.throttlePerSec * dt);
  } else if (!input.throttle && run.speed > ENERGY.regenMinSpeed) {
    run.energy = Math.min(ENERGY.max, run.energy + ENERGY.coastRegenPerSec * dt);
  }

  // 检查点
  const nextCp = run.checkpoint + 1;
  if (nextCp < level.checkpoints.length && run.rover.x >= level.checkpoints[nextCp]) {
    run.checkpoint = nextCp;
    const cx = level.checkpoints[nextCp];
    run.snapshot = {
      x: cx,
      y: terrain.groundY(cx) + 1.2,
      cargo: run.cargo,
      energy: run.energy,
      time: run.time,
    };
    events.push({ type: 'checkpoint', index: nextCp, x: cx, y: terrain.groundY(cx) });
  }

  // 电池拾取
  for (let i = 0; i < level.batteries.length; i++) {
    if (run.collectedBatteries.includes(i)) continue;
    const bx = level.batteries[i];
    const by = terrain.groundY(bx) + 1.1;
    if (Math.abs(run.rover.x - bx) < 1.8 && Math.abs(run.rover.y - by) < 2.2) {
      run.collectedBatteries.push(i);
      run.energy = Math.min(ENERGY.max, run.energy + ENERGY.batteryValue);
      events.push({ type: 'battery', index: i, x: bx, y: by });
    }
  }

  // 移动障碍
  for (let i = 0; i < level.obstacles.length; i++) {
    if (run.obstacleCooldowns[i] > 0) run.obstacleCooldowns[i] -= dt;
    const ob = level.obstacles[i];
    const pos = obstaclePosition(ob, terrain, run.time);
    const dx = run.rover.x - pos.x;
    const dy = run.rover.y - pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist < ob.r + 1.15 && run.obstacleCooldowns[i] <= 0 && !inFinishSafeZone) {
      const closing = run.speed + ob.speed * 0.5;
      const dmg = Math.min(
        DAMAGE.obstacleCap,
        DAMAGE.obstacleBase + closing * DAMAGE.obstaclePerMS,
      );
      applyDamage(run, events, dmg, 'obstacle', true, pos.x, pos.y);
      // 弹开(力度克制,避免弹飞翻滚吃连招)
      const dir = dx >= 0 ? 1 : -1;
      run.rover.vx = dir * Math.max(3, Math.abs(run.rover.vx) * 0.4);
      run.rover.vy = Math.max(run.rover.vy, 2.6);
      run.rover.av += dir * 0.35;
      run.obstacleCooldowns[i] = 1.6;
    }
  }

  // 终点:平稳驶入过关;高速冲入弹回(保护区内弹回与落地均不伤货物)
  if (run.finishCooldown > 0) run.finishCooldown -= dt;
  if (run.rover.x >= level.finishX) {
    const grounded = run.rover.wheelGrounded[0] || run.rover.wheelGrounded[1];
    if (run.speed <= DAMAGE.finishSpeedLimit && grounded) {
      run.status = 'complete';
      events.push({ type: 'win' });
      return events;
    }
    if (run.finishCooldown <= 0 && run.rover.x < level.finishX + 8) {
      run.rover.vx = -Math.abs(run.rover.vx) * 0.35;
      run.rover.vy = Math.max(run.rover.vy, 2.5);
      run.finishCooldown = 1.2;
    }
  }

  // 失败判定
  if (run.cargo <= 0) {
    run.status = 'failed';
    run.failReason = 'cargo';
    events.push({ type: 'fail', reason: 'cargo' });
  } else if (
    run.energy <= ENERGY.depletedEpsilon &&
    run.speed < ENERGY.stallSpeed &&
    (run.rover.wheelGrounded[0] || run.rover.wheelGrounded[1])
  ) {
    run.status = 'failed';
    run.failReason = 'energy';
    events.push({ type: 'fail', reason: 'energy' });
  }

  return events;
}

/** 从最近检查点复活:恢复快照 + 时间惩罚。无快照返回 false。 */
export function respawnAtCheckpoint(run: RunState, level: LevelDef): boolean {
  if (!run.snapshot) return false;
  const snap = run.snapshot;
  run.rover = createRover(snap.x, snap.y);
  run.cargo = Math.max(snap.cargo, 25); // 保底一点货物,避免死循环
  run.energy = Math.max(snap.energy, 30);
  run.time = snap.time + SCORING.respawnTimePenalty;
  run.respawns += 1;
  run.status = 'running';
  run.failReason = null;
  run.finishCooldown = 0;
  run.obstacleCooldowns = level.obstacles.map(() => 0.5);
  return true;
}
