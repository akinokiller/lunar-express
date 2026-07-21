// 真实地形坑壁上机动复现
import { PHYSICS_DT } from '../src/game/constants';
import { LEVELS } from '../src/game/levels';
import { createRover, stepRover, wrapAngle, type PhysicsEvent } from '../src/game/physics';

const level = LEVELS[1];
const terrain = level.terrain;

function scenario(name: string, startX: number, inputs: (t: number) => { throttle: boolean; brake: boolean; tilt: number }) {
  const rover = createRover(startX, terrain.groundY(startX) + 1.2);
  const events: PhysicsEvent[] = [];
  let maxDev = 0;
  let t = 0;
  let minX = startX;
  let maxX = startX;
  for (let i = 0; i < 120 * 12; i++) {
    stepRover(rover, terrain, inputs(t), PHYSICS_DT, events);
    t += PHYSICS_DT;
    minX = Math.min(minX, rover.x);
    maxX = Math.max(maxX, rover.x);
    const dev = wrapAngle(rover.angle - Math.atan(terrain.slope(rover.x)));
    if (t > 1) maxDev = Math.max(maxDev, Math.abs(dev));
  }
  console.log(
    `${name}: maxDev=${(maxDev * 57.3).toFixed(0)}° roofEvents=${events.filter((e) => e.type === 'roof').length} x范围=[${minX.toFixed(1)}, ${maxX.toFixed(1)}] slopeAt312=${terrain.slope(312).toFixed(2)}`,
  );
}

scenario('x=312 持续全油门', 312, () => ({ throttle: true, brake: false, tilt: 0 }));
scenario('x=312 油门/刹车交替', 312, (t) => ({
  throttle: Math.floor(t) % 2 === 0,
  brake: Math.floor(t) % 2 === 1,
  tilt: 0,
}));
scenario('x=308 油门/刹车交替', 308, (t) => ({
  throttle: Math.floor(t) % 2 === 0,
  brake: Math.floor(t) % 2 === 1,
  tilt: 0,
}));
