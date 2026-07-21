// 《月面快递》全局调参常量 —— 纯模块,无 DOM 依赖

/** 月面低重力 m/s²(约为地球游戏手感的 1/6) */
export const GRAVITY = 2.6;

/** 固定物理步长 */
export const PHYSICS_DT = 1 / 120;

export const ROVER = {
  /** 轮距一半(车轮采样点相对车心的水平偏移) */
  halfAxle: 1.05,
  /** 车轮悬挂点相对车心的垂直偏移(向下为负) */
  wheelY: -0.4,
  wheelRadius: 0.42,
  /** 车顶采样点(翻车检测) */
  roofHalfWidth: 0.72,
  roofY: 0.48,
  /** 悬挂弹簧/阻尼(作用于单位质量刚体) */
  springK: 62,
  springC: 12.5,
  /** 每个车轮承载的车身质量份额 */
  wheelShare: 0.5,
  engineAccel: 7.6,
  brakeAccel: 11,
  reverseAccel: 2.6,
  /** 空中俯仰力矩 rad/s² */
  airTilt: 6.5,
  /** 踩油门时的轻微抬头力矩(经典手感) */
  throttlePitch: 0.55,
  inertia: 1.35,
  maxDriveSpeed: 24,
  angularDamping: 0.55,
  airDrag: 0.02,
  rollingDrag: 0.12,
} as const;

export const DAMAGE = {
  /** 法向冲击速度低于此值完全无伤 */
  safeImpact: 6,
  /** 超过此值判定为重击(屏幕震动) */
  heavyImpact: 9,
  /** 恰好达到 heavyImpact 时的伤害 */
  midMaxDamage: 18,
  heavyExtraPerMS: 5,
  heavyCap: 45,
  /** 翻车(车顶着地)基础伤害 */
  roofBase: 10,
  roofMinImpact: 2.0,
  /** 移动障碍 */
  obstacleBase: 5.5,
  obstaclePerMS: 0.9,
  obstacleCap: 14,
  /** 高速冲入终点的弹回速度阈值(弹回保留,但终点保护区内不伤货物) */
  finishSpeedLimit: 5.5,
} as const;

/** 终点保护区:距终点此距离内冲击不伤货物(基地磁力软着陆/装卸保护) */
export const FINISH_PROTECT_DIST = 18;

export const ENERGY = {
  max: 100,
  throttlePerSec: 5.7,
  coastRegenPerSec: 0.4,
  /** 仅当滑行速度高于此值才动能回充(静止爬行不回充) */
  regenMinSpeed: 2.5,
  batteryValue: 35,
  /** 能源耗尽判负时的速度阈值 */
  stallSpeed: 1.2,
  /** 低于该值视为能源耗尽 */
  depletedEpsilon: 0.05,
} as const;

export const SCORING = {
  base: 1000,
  timeBonusPerSec: 20,
  cargoPerPoint: 10,
  energyPerPoint: 5,
  respawnPenalty: 150,
  /** 检查点复活的时间惩罚(秒) */
  respawnTimePenalty: 15,
} as const;

export const CARGO_MAX = 100;
