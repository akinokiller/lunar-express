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
  safeImpact: 5,
  /** 超过此值判定为重击(屏幕震动) */
  heavyImpact: 9,
  /** 恰好达到 heavyImpact 时的伤害 */
  midMaxDamage: 25,
  heavyExtraPerMS: 8,
  heavyCap: 60,
  /** 翻车(车顶着地)基础伤害 */
  roofBase: 14,
  roofMinImpact: 2.0,
  /** 移动障碍 */
  obstacleBase: 8,
  obstaclePerMS: 1.6,
  obstacleCap: 24,
  /** 高速冲入终点 */
  finishSpeedLimit: 5.5,
  finishDamage: 12,
} as const;

export const ENERGY = {
  max: 100,
  throttlePerSec: 1.9,
  coastRegenPerSec: 1.1,
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
