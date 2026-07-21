// 陡坡低速机动复现
import { PHYSICS_DT } from '../src/game/constants';
import { buildTerrain } from '../src/game/terrain';
import { createRover, stepRover, wrapAngle, type PhysicsEvent } from '../src/game/physics';

const slope = 0.6; // 31°
const terrain = buildTerrain([
  { x: -200, y: -120 },
  { x: 200, y: 120 },
]);
const slopeAng = Math.atan(slope);

function scenario(name: string, inputs: (t: number) => { throttle: boolean; brake: boolean; tilt: number }) {
  const rover = createRover(0, terrain.groundY(0) + 1.2);
  const events: PhysicsEvent[] = [];
  let maxDev = 0;
  let t = 0;
  for (let i = 0; i < 120 * 12; i++) {
    stepRover(rover, terrain, inputs(t), PHYSICS_DT, events);
    t += PHYSICS_DT;
    const dev = wrapAngle(rover.angle - slopeAng);
    if (t > 1) maxDev = Math.max(maxDev, Math.abs(dev));
  }
  const finalDev = wrapAngle(rover.angle - slopeAng);
  console.log(
    `${name}: maxDev=${(maxDev * 57.3).toFixed(0)}° finalDev=${(finalDev * 57.3).toFixed(0)}° roofEvents=${events.filter((e) => e.type === 'roof').length} vt=${(rover.vx * Math.cos(slopeAng) + rover.vy * Math.sin(slopeAng)).toFixed(1)}`,
  );
}

scenario('持续全油门', () => ({ throttle: true, brake: false, tilt: 0 }));
scenario('油门/刹车交替(每秒切换)', (t) => ({
  throttle: Math.floor(t) % 2 === 0,
  brake: Math.floor(t) % 2 === 1,
  tilt: 0,
}));
scenario('点踩油门(0.3s on / 0.7s off)', (t) => ({
  throttle: t % 1 < 0.3,
  brake: false,
  tilt: 0,
}));
