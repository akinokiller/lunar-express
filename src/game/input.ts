// 键盘 + 触控输入
import type { InputState } from './physics';

export type TouchKey = 'throttle' | 'brake' | 'tiltL' | 'tiltR';

const THROTTLE_KEYS = new Set(['ArrowRight', 'KeyD', 'ArrowUp', 'KeyW']);
const BRAKE_KEYS = new Set(['ArrowLeft', 'KeyA', 'ArrowDown', 'KeyS']);

export class InputManager {
  private keys = new Set<string>();
  private touch: Record<TouchKey, boolean> = {
    throttle: false,
    brake: false,
    tiltL: false,
    tiltR: false,
  };
  onPause: (() => void) | null = null;
  onConfirm: (() => void) | null = null;
  /** 任意输入(用于解锁 AudioContext、推进引导) */
  onAny: (() => void) | null = null;

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === 'Escape' || e.code === 'KeyP') this.onPause?.();
    if (e.code === 'Enter' || e.code === 'Space') this.onConfirm?.();
    this.onAny?.();
    // 防止方向键滚动页面
    if (THROTTLE_KEYS.has(e.code) || BRAKE_KEYS.has(e.code) || e.code === 'Space') {
      e.preventDefault();
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private handleBlur = (): void => {
    this.keys.clear();
    this.touch.throttle = false;
    this.touch.brake = false;
    this.touch.tiltL = false;
    this.touch.tiltR = false;
  };

  attach(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
  }

  detach(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
  }

  /** 绑定触控/鼠标按钮(指针事件,两者通吃) */
  bindButton(el: HTMLElement, key: TouchKey): void {
    const set = (v: boolean) => (ev: PointerEvent) => {
      ev.preventDefault();
      this.touch[key] = v;
      if (v) {
        this.onAny?.();
        try {
          el.setPointerCapture(ev.pointerId);
        } catch {
          /* 某些浏览器不支持 */
        }
      }
    };
    el.addEventListener('pointerdown', set(true));
    el.addEventListener('pointerup', set(false));
    el.addEventListener('pointercancel', set(false));
    el.addEventListener('pointerleave', set(false));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private anyKey(set: Set<string>): boolean {
    for (const k of this.keys) if (set.has(k)) return true;
    return false;
  }

  getState(): InputState {
    const throttle = this.anyKey(THROTTLE_KEYS) || this.touch.throttle;
    const brake = this.anyKey(BRAKE_KEYS) || this.touch.brake;
    const tiltL = this.keys.has('ArrowLeft') || this.keys.has('KeyA') || this.touch.tiltL;
    const tiltR = this.keys.has('ArrowRight') || this.keys.has('KeyD') || this.touch.tiltR;
    return {
      throttle,
      brake,
      tilt: (tiltL ? 1 : 0) + (tiltR ? -1 : 0),
    };
  }
}
