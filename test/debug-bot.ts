// 调试:记录 AI 驾驶过程中的伤害事件
import { PHYSICS_DT } from '../src/game/constants';
import { LEVELS, obstaclePosition } from '../src/game/levels';
import { roverSpeed, wrapAngle } from '../src/game/physics';
import { createRun, stepRun } from '../src/game/run';

const level = LEVELS[Number(process.argv[2] ?? 0)];
const terrain = level.terrain;
const run = createRun(level.index, level);
const dt = PHYSICS_DT;
let t = 0;
while (run.status === 'running' && t < 300) {
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
    // 障碍逼近等待中的车辆:倒车拉开距离
    if (dx > 0 && dx < 5.5) {
      reverseFromObstacle = true;
      break;
    }
    if (dx < -3) continue; // 已经通过
    // 用与游戏一致的碰撞几何模拟冲刺:两种典型速度都安全才通过,
    // 避免"模拟假设的速度"与"实际加速过程"错位导致误判
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
  const evs = stepRun(run, level, terrain, input, dt);
  for (const e of evs) {
    if (e.type === 'damage') {
      console.log(
        `t=${t.toFixed(2)} x=${s.x.toFixed(1)} kind=${e.kind} dmg=${e.amount.toFixed(1)} heavy=${e.heavy} speed=${speed.toFixed(1)} vy=${s.vy.toFixed(1)} angle=${(wrapAngle(s.angle) * 57.3).toFixed(0)}° cargo=${run.cargo.toFixed(0)}`,
      );
    } else {
      console.log(`t=${t.toFixed(2)} x=${s.x.toFixed(1)} EVENT ${e.type}`);
    }
  }
  t += dt;
}
console.log(`end: status=${run.status} x=${run.rover.x.toFixed(1)} t=${t.toFixed(1)} cargo=${run.cargo.toFixed(0)}`);
