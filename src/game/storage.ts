// localStorage 存档(可注入 mock 便于测试) —— 纯模块

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SaveData {
  /** 每关最高分 */
  highScores: number[];
  /** 已解锁关卡数(初始 1) */
  unlocked: number;
  soundOn: boolean;
  tutorialSeen: boolean;
}

export const SAVE_KEY = 'lunar-express-save-v1';
export const TOTAL_LEVELS = 3;

export function defaultSave(): SaveData {
  return {
    highScores: new Array(TOTAL_LEVELS).fill(0),
    unlocked: 1,
    soundOn: true,
    tutorialSeen: false,
  };
}

function defaultStorage(): StorageLike | undefined {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      return (globalThis as { localStorage: StorageLike }).localStorage;
    }
  } catch {
    /* localStorage 不可用时静默降级 */
  }
  return undefined;
}

export function loadSave(storage?: StorageLike): SaveData {
  const store = storage ?? defaultStorage();
  const fallback = defaultSave();
  if (!store) return fallback;
  try {
    const raw = store.getItem(SAVE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const highScores = new Array(TOTAL_LEVELS).fill(0);
    if (Array.isArray(parsed.highScores)) {
      for (let i = 0; i < TOTAL_LEVELS; i++) {
        const v = parsed.highScores[i];
        highScores[i] = typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
      }
    }
    const unlocked =
      typeof parsed.unlocked === 'number' && Number.isFinite(parsed.unlocked)
        ? Math.max(1, Math.min(TOTAL_LEVELS, Math.round(parsed.unlocked)))
        : 1;
    return {
      highScores,
      unlocked,
      soundOn: typeof parsed.soundOn === 'boolean' ? parsed.soundOn : true,
      tutorialSeen: parsed.tutorialSeen === true,
    };
  } catch {
    return fallback;
  }
}

export function writeSave(data: SaveData, storage?: StorageLike): void {
  const store = storage ?? defaultStorage();
  if (!store) return;
  try {
    store.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* 存储满/隐私模式下静默失败 */
  }
}
