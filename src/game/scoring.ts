// 计分与关卡解锁 —— 纯模块

import { SCORING } from './constants';
import type { SaveData } from './storage';

export interface ScoreInput {
  time: number;
  cargo: number;
  energy: number;
  respawns: number;
  parTime: number;
}

export interface ScoreBreakdown {
  base: number;
  timeBonus: number;
  cargoBonus: number;
  energyBonus: number;
  penalty: number;
  total: number;
}

export function computeScore(s: ScoreInput): ScoreBreakdown {
  const base = SCORING.base;
  const timeBonus = Math.max(0, Math.round((s.parTime - s.time) * SCORING.timeBonusPerSec));
  const cargoBonus = Math.round(Math.max(0, s.cargo) * SCORING.cargoPerPoint);
  const energyBonus = Math.round(Math.max(0, s.energy) * SCORING.energyPerPoint);
  const penalty = s.respawns * SCORING.respawnPenalty;
  const total = Math.max(0, base + timeBonus + cargoBonus + energyBonus - penalty);
  return { base, timeBonus, cargoBonus, energyBonus, penalty, total };
}

/**
 * 过关后更新存档:刷新单关最高分并解锁下一关。返回新对象(不修改入参)。
 */
export function applyLevelComplete(
  save: SaveData,
  levelIndex: number,
  score: number,
  totalLevels: number,
): SaveData {
  const highScores = [...save.highScores];
  while (highScores.length < totalLevels) highScores.push(0);
  if (score > (highScores[levelIndex] ?? 0)) highScores[levelIndex] = score;
  const unlocked = Math.max(
    save.unlocked,
    Math.min(totalLevels, levelIndex + 2),
  );
  return { ...save, highScores, unlocked };
}

/** 总评价 */
export function totalRating(totalScore: number, totalLevels: number): string {
  const per = totalScore / Math.max(1, totalLevels);
  if (per >= 2400) return 'S · 传奇月面快递员';
  if (per >= 2000) return 'A · 王牌驾驶员';
  if (per >= 1500) return 'B · 可靠运输员';
  return 'C · 见习快递员';
}
