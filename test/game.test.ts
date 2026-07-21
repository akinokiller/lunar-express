// 《月面快递》核心逻辑测试(node + tsx 直接运行,无浏览器依赖)
// 运行:npm run test

import assert from 'node:assert/strict';
import { DAMAGE, ENERGY, GRAVITY, PHYSICS_DT, SCORING } from '../src/game/constants';
import { LEVELS, obstaclePosition } from '../src/game/levels';
import { buildTerrain } from '../src/game/terrain';
import {
  createRover,
  impactDamage,
  isHeavyImpact,
  roverSpeed,
  stepRover,
  wrapAngle,
  type PhysicsEvent,
} from '../src/game/physics';
import { createRun, respawnAtCheckpoint, stepRun } from '../src/game/run';
import { applyLevelComplete, computeScore, totalRating } from '../src/game/scoring';
import { defaultSave, loadSave, writeSave, SAVE_KEY, type StorageLike } from '../src/game/storage';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push(name);
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** 创建一块平坦地形 */
function flatTerrain(y = 0, min = -50, max = 500) {
  return buildTerrain([
    { x: min, y },
    { x: max, y },
  ]);
}

/** 模拟 rover 自由落体并着陆,返回过程中最大冲击法向速度 */
function dropTest(dropHeight: number): { maxVn: number; settled: boolean } {
  const terrain = flatTerrain(0);
  const rover = createRover(0, dropHeight + 1);
  const events: PhysicsEvent[] = [];
  let maxVn = 0;
  const dt = PHYSICS_DT;
  for (let i = 0; i < 120 * 20; i++) {
    stepRover(rover, terrain, { throttle: false, brake: false, tilt: 0 }, dt, events);
    for (const ev of events) if (ev.type === 'impact') maxVn = Math.max(maxVn, ev.vn);
    events.length = 0;
  }
  const settled = Math.abs(rover.vy) < 0.5 && rover.y < 2;
  return { maxVn, settled };
}

console.log('\n■ 物理:重力与落地冲击');

test('重力加速度:自由落体 1 秒后 vy ≈ -G', () => {
  const terrain = flatTerrain(-1000);
  const rover = createRover(0, 0);
  const events: PhysicsEvent[] = [];
  for (let i = 0; i < 120; i++) {
    stepRover(rover, terrain, { throttle: false, brake: false, tilt: 0 }, PHYSICS_DT, events);
  }
  assert.ok(Math.abs(rover.vy - -GRAVITY) < 0.05, `vy=${rover.vy}`);
  assert.equal(events.length, 0);
});

test('小落差(2m)着陆:稳定在地面且冲击速度低于无伤阈值', () => {
  const { maxVn, settled } = dropTest(2);
  assert.ok(settled, 'rover 应稳定落地');
  assert.ok(maxVn < DAMAGE.safeImpact, `maxVn=${maxVn.toFixed(2)} 应 < ${DAMAGE.safeImpact}`);
});

test('大落差(8m)着陆:冲击速度超过无伤阈值', () => {
  const { maxVn } = dropTest(8);
  assert.ok(maxVn > DAMAGE.safeImpact, `maxVn=${maxVn.toFixed(2)} 应 > ${DAMAGE.safeImpact}`);
});

test('冲击伤害公式:阈值边界与封顶', () => {
  assert.equal(impactDamage(4.99), 0);
  assert.equal(impactDamage(DAMAGE.safeImpact), 0);
  // safeImpact=5, heavyImpact=9 → 6.5 对应 (1.5/4)*25 = 9.375
  assert.ok(Math.abs(impactDamage(6.5) - 9.375) < 1e-9);
  assert.ok(Math.abs(impactDamage(9) - DAMAGE.midMaxDamage) < 1e-9);
  assert.ok(impactDamage(12) > DAMAGE.midMaxDamage);
  assert.equal(impactDamage(50), DAMAGE.heavyCap);
  assert.equal(isHeavyImpact(9.5), true);
  assert.equal(isHeavyImpact(8), false);
});

test('空中姿态:tilt 输入改变角速度', () => {
  const terrain = flatTerrain(-1000);
  const rover = createRover(0, 0);
  const events: PhysicsEvent[] = [];
  for (let i = 0; i < 60; i++) {
    stepRover(rover, terrain, { throttle: false, brake: false, tilt: 1 }, PHYSICS_DT, events);
  }
  assert.ok(rover.av > 0.5, `av=${rover.av}`);
});

test('平地油门:车辆向前加速', () => {
  const terrain = flatTerrain(0);
  const rover = createRover(0, 1.2);
  const events: PhysicsEvent[] = [];
  // 先落地
  for (let i = 0; i < 120; i++) stepRover(rover, terrain, { throttle: false, brake: false, tilt: 0 }, PHYSICS_DT, events);
  events.length = 0;
  const x0 = rover.x;
  for (let i = 0; i < 240; i++) stepRover(rover, terrain, { throttle: true, brake: false, tilt: 0 }, PHYSICS_DT, events);
  assert.ok(rover.vx > 5, `vx=${rover.vx.toFixed(2)}`);
  assert.ok(rover.x > x0 + 5);
});

console.log('\n■ 能源与失败判定');

test('踩油门消耗能源,松油门缓慢回充', () => {
  const level = LEVELS[0];
  const run = createRun(0, level);
  const e0 = run.energy;
  for (let i = 0; i < 120; i++) stepRun(run, level, level.terrain, { throttle: true, brake: false, tilt: 0 }, PHYSICS_DT);
  assert.ok(run.energy < e0, `energy=${run.energy}`);
  const e1 = run.energy;
  for (let i = 0; i < 120; i++) stepRun(run, level, level.terrain, { throttle: false, brake: false, tilt: 0 }, PHYSICS_DT);
  assert.ok(run.energy > e1, '回充应生效');
});

test('能源耗尽且低速着地 → 失败(energy)', () => {
  const level = LEVELS[0];
  const run = createRun(0, level);
  run.energy = 0.001;
  // 不踩油门,静止在地面
  for (let i = 0; i < 120 * 5 && run.status === 'running'; i++) {
    stepRun(run, level, level.terrain, { throttle: false, brake: true, tilt: 0 }, PHYSICS_DT);
  }
  assert.equal(run.status, 'failed');
  assert.equal(run.failReason, 'energy');
});

test('货物归零 → 失败(cargo)', () => {
  const level = LEVELS[0];
  const run = createRun(0, level);
  run.cargo = 0.01;
  // 直接施加一次大冲击:从高空摔下
  run.rover.y += 30;
  run.rover.vy = -20;
  let sawFail = false;
  for (let i = 0; i < 120 * 10 && run.status === 'running'; i++) {
    const evs = stepRun(run, level, level.terrain, { throttle: false, brake: false, tilt: 0 }, PHYSICS_DT);
    if (evs.some((e) => e.type === 'fail')) sawFail = true;
  }
  assert.equal(run.status, 'failed');
  assert.equal(run.failReason, 'cargo');
  assert.ok(sawFail, '应产生 fail 事件');
});

console.log('\n■ 终点与过关判定');

test('低速平稳驶入终点 → 过关', () => {
  const level = LEVELS[0];
  const run = createRun(0, level);
  run.rover.x = level.finishX - 0.5;
  run.rover.y = level.terrain.groundY(run.rover.x) + 1.0;
  run.rover.vx = 2;
  let win = false;
  for (let i = 0; i < 120 * 5 && run.status === 'running'; i++) {
    const evs = stepRun(run, level, level.terrain, { throttle: true, brake: false, tilt: 0 }, PHYSICS_DT);
    if (evs.some((e) => e.type === 'win')) win = true;
  }
  assert.equal(run.status, 'complete');
  assert.ok(win);
});

test('高速冲入终点 → 弹回并扣货,不判定过关', () => {
  const level = LEVELS[0];
  const run = createRun(0, level);
  run.rover.x = level.finishX - 1;
  run.rover.y = level.terrain.groundY(run.rover.x) + 1.0;
  run.rover.vx = 15;
  const cargo0 = run.cargo;
  let bounce = false;
  for (let i = 0; i < 60 && run.status === 'running'; i++) {
    const evs = stepRun(run, level, level.terrain, { throttle: false, brake: false, tilt: 0 }, PHYSICS_DT);
    if (evs.some((e) => e.type === 'damage' && e.kind === 'finish')) bounce = true;
  }
  assert.ok(bounce, '应产生 finish 伤害事件');
  assert.ok(run.cargo < cargo0);
  assert.notEqual(run.status, 'complete');
  assert.ok(run.rover.vx <= 0, '应被弹回');
});

console.log('\n■ 检查点与复活');

test('通过检查点保存快照,复活恢复快照并计惩罚', () => {
  const level = LEVELS[0];
  const run = createRun(0, level);
  run.rover.x = level.checkpoints[0] + 0.5;
  run.cargo = 77;
  run.energy = 55;
  stepRun(run, level, level.terrain, { throttle: false, brake: false, tilt: 0 }, PHYSICS_DT);
  assert.equal(run.checkpoint, 0);
  assert.ok(run.snapshot);
  // 模拟翻车失败
  run.status = 'failed';
  run.failReason = 'cargo';
  const t0 = run.time;
  const ok = respawnAtCheckpoint(run, level);
  assert.ok(ok);
  assert.equal(run.status, 'running');
  assert.equal(run.respawns, 1);
  assert.equal(run.rover.x, run.snapshot!.x);
  assert.ok(Math.abs(run.time - (t0 + SCORING.respawnTimePenalty)) < 1e-9);
});

test('无检查点快照时复活返回 false', () => {
  const level = LEVELS[0];
  const run = createRun(0, level);
  assert.equal(respawnAtCheckpoint(run, level), false);
});

console.log('\n■ 计分公式与解锁');

test('计分公式:基准/时间/货物/能源/复活惩罚', () => {
  const s = computeScore({ time: 60, cargo: 80, energy: 40, respawns: 1, parTime: 75 });
  assert.equal(s.base, SCORING.base);
  assert.equal(s.timeBonus, (75 - 60) * SCORING.timeBonusPerSec);
  assert.equal(s.cargoBonus, 80 * SCORING.cargoPerPoint);
  assert.equal(s.energyBonus, 40 * SCORING.energyPerPoint);
  assert.equal(s.penalty, SCORING.respawnPenalty);
  assert.equal(s.total, s.base + s.timeBonus + s.cargoBonus + s.energyBonus - s.penalty);
});

test('超时时间分为 0,总分不为负', () => {
  const s = computeScore({ time: 9999, cargo: 0, energy: 0, respawns: 99, parTime: 75 });
  assert.equal(s.timeBonus, 0);
  assert.equal(s.total, 0);
});

test('过关解锁:第 1 关 → 解锁第 2 关,不重复解锁,封顶总关数', () => {
  let save = defaultSave();
  assert.equal(save.unlocked, 1);
  save = applyLevelComplete(save, 0, 1500, 3);
  assert.equal(save.unlocked, 2);
  assert.equal(save.highScores[0], 1500);
  // 低分不覆盖最高分
  save = applyLevelComplete(save, 0, 800, 3);
  assert.equal(save.highScores[0], 1500);
  save = applyLevelComplete(save, 2, 2000, 3);
  assert.equal(save.unlocked, 3);
  assert.equal(totalRating(7200, 3).startsWith('S'), true);
});

console.log('\n■ 存档(localStorage mock)');

function mockStorage(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

test('存档读写往返一致', () => {
  const store = mockStorage();
  const save = { ...defaultSave(), unlocked: 2, soundOn: false, tutorialSeen: true, highScores: [1234, 0, 0] };
  writeSave(save, store);
  const loaded = loadSave(store);
  assert.deepEqual(loaded, save);
});

test('空存档/损坏存档 → 默认值', () => {
  const store = mockStorage();
  assert.deepEqual(loadSave(store), defaultSave());
  store.setItem(SAVE_KEY, '{broken json');
  assert.deepEqual(loadSave(store), defaultSave());
  store.setItem(SAVE_KEY, JSON.stringify({ unlocked: 99, highScores: 'bad' }));
  const fixed = loadSave(store);
  assert.equal(fixed.unlocked, 3); // 被钳制到总关数
  assert.deepEqual(fixed.highScores, [0, 0, 0]);
});

console.log('\n■ 障碍运动');

test('障碍在设定范围内往复运动', () => {
  const level = LEVELS[1];
  const ob = level.obstacles[0];
  let minX = Infinity;
  let maxX = -Infinity;
  for (let t = 0; t < 30; t += 0.1) {
    const p = obstaclePosition(ob, level.terrain, t);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
  }
  assert.ok(minX >= ob.x - ob.range - 0.01 && maxX <= ob.x + ob.range + 0.01);
  assert.ok(maxX - minX > ob.range, '应有明显摆动');
});

console.log('\n■ 通关冒烟(AI 驾驶员)');

/** 简单策略机器人:验证关卡在物理上可通关 */
function botDrive(levelIndex: number, maxTime: number) {
  const level = LEVELS[levelIndex];
  const terrain = level.terrain;
  const run = createRun(levelIndex, level);
  const dt = PHYSICS_DT;
  let t = 0;
  while (run.status === 'running' && t < maxTime) {
    const s = run.rover;
    const speed = roverSpeed(s);
    // 提前 9m 观察坡度与坡度突变,下坡/坑沿提前减速
    const s1 = terrain.slope(s.x + 2.5);
    const s2 = terrain.slope(s.x + 9);
    const curvature = Math.abs(s2 - s1);
    let vTarget = 10.5 - Math.max(0, -Math.min(s1, s2)) * 8 - curvature * 7;
    vTarget = Math.max(3.5, vTarget);
    // 接近终点提前减速,平稳进站
    if (level.finishX - s.x < 25) vTarget = Math.min(vTarget, 4);
    let reverseFromObstacle = false;
    let holdForObstacle = false;
    let nearObstacle = false;
    for (const ob of level.obstacles) {
      const p = obstaclePosition(ob, terrain, run.time);
      // 以障碍的巡逻中心锚定关卡门,而不是被其瞬时位置牵着走
      const dxGate = ob.x + ob.range - s.x;
      if (dxGate < -6 || dxGate > 14) continue;
      nearObstacle = true;
      const dx = p.x - s.x;
      if (dx > 0 && dx < 5.5) {
        reverseFromObstacle = true;
        break;
      }
      if (dx < -3) continue;
      // 用与游戏一致的碰撞几何模拟冲刺:两种典型速度都安全才通过
      for (const vSim of [8, 12]) {
        const tPass = (dxGate + ob.r + 6) / vSim;
        for (let tau = 0; tau <= tPass; tau += 0.1) {
          const pf = obstaclePosition(ob, terrain, run.time + tau);
          const botX = s.x + vSim * tau;
          const botY = terrain.groundY(botX) + 1.2;
          if (Math.hypot(pf.x - botX, pf.y - botY) < ob.r + 1.3) {
            holdForObstacle = true;
            break;
          }
        }
        if (holdForObstacle) break;
      }
    }
    if (nearObstacle) vTarget = Math.min(vTarget, 10);
    const grounded = s.wheelGrounded[0] || s.wheelGrounded[1];
    const wa = wrapAngle(s.angle);
    // 爬坡时车头抬太高:松油门/轻刹防后翻
    const slopeAng = Math.atan(terrain.slope(s.x));
    const noseHigh = grounded && wa - slopeAng > 0.35;
    const wheelie = grounded && wa - slopeAng > 0.55;
    const input = {
      throttle: !noseHigh && !reverseFromObstacle && !holdForObstacle && speed < vTarget,
      brake: wheelie || reverseFromObstacle || holdForObstacle || speed > vTarget + 1.0,
      tilt: grounded ? 0 : Math.abs(wa) > 0.08 ? (wa > 0 ? -1 : 1) : 0,
    };
    stepRun(run, level, terrain, input, dt);
    t += dt;
  }
  return { run, t };
}

for (let i = 0; i < LEVELS.length; i++) {
  test(`AI 驾驶员可通关第 ${i + 1} 关「${LEVELS[i].name}」且货物完好`, () => {
    const { run, t } = botDrive(i, 300);
    assert.equal(run.status, 'complete', `状态=${run.status}, 进度 x=${run.rover.x.toFixed(1)}/${LEVELS[i].finishX}, 用时=${t.toFixed(1)}s, 货物=${run.cargo.toFixed(0)}, 能源=${run.energy.toFixed(0)}`);
    assert.ok(run.cargo > 0);
  });
}

console.log(`\n结果:${passed} 通过,${failed} 失败`);
if (failed > 0) {
  console.error('失败用例:', failures.join(' | '));
  process.exit(1);
}
