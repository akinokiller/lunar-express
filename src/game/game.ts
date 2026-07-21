// 游戏主控:状态机、固定步长主循环、摄像机、UI 交互、触控按钮

import { AudioEngine } from './audio';
import { PHYSICS_DT } from './constants';
import { InputManager, type TouchKey } from './input';
import { LEVELS, type LevelDef } from './levels';
import { Particles } from './particles';
import { render, type ButtonVariant, type Screen, type View } from './render';
import {
  createRun,
  respawnAtCheckpoint,
  stepRun,
  type FailReason,
  type RunEvent,
  type RunState,
} from './run';
import {
  applyLevelComplete,
  computeScore,
  totalRating,
  type ScoreBreakdown,
} from './scoring';
import { loadSave, writeSave, type SaveData } from './storage';

interface UiButton {
  x: number;
  y: number;
  w: number;
  h: number;
  action: string;
}

const TUTORIAL_STEPS = 4;

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private touchRoot: HTMLElement;
  private input = new InputManager();
  private audio = new AudioEngine();
  private particles = new Particles();
  private save: SaveData;

  private screen: Screen = 'title';
  private run: RunState | null = null;
  private level: LevelDef = LEVELS[0];
  private levelIndex = 0;
  private tutorialStep = 0;
  private tutorialReturn: Screen = 'playing';
  private lastScore: ScoreBreakdown | null = null;
  private failReason: FailReason | null = null;

  private camX = 40;
  private camY = 0;
  private shakeT = 0;
  private shakeMag = 0;
  private time = 0;

  private W = 0;
  private H = 0;
  private scale = 40;
  private portrait = false;

  private uiButtons: UiButton[] = [];
  private touchButtons: HTMLElement[] = [];
  private touchMode = false;

  private rafId = 0;
  private last = 0;
  private acc = 0;
  private destroyed = false;
  private dustTimer = 0;

  constructor(canvas: HTMLCanvasElement, touchRoot: HTMLElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建 Canvas 2D 上下文');
    this.ctx = ctx;
    this.touchRoot = touchRoot;
    this.save = loadSave();
    this.audio.enabled = this.save.soundOn;
  }

  start(): void {
    this.input.attach();
    this.input.onPause = () => this.togglePause();
    this.input.onConfirm = () => this.onConfirm();
    this.input.onAny = () => this.audio.unlock();
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.onResize();
    this.setupTouchControls();
    this.last = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.rafId);
    this.input.detach();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    for (const el of this.touchButtons) el.remove();
    this.audio.dispose();
  }

  // ---------- 布局 ----------

  private onResize = (): void => {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = w;
    this.H = h;
    this.portrait = h > w;
    this.scale = Math.max(20, Math.min(56, Math.min(h / 13, w / 16)));
  };

  private onVisibility = (): void => {
    if (document.hidden && this.screen === 'playing') this.screen = 'paused';
  };

  // ---------- 触控按钮 ----------

  private setupTouchControls(): void {
    this.touchMode =
      window.matchMedia('(pointer: coarse)').matches ||
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0;
    if (!this.touchMode) return;
    const mk = (label: string, key: TouchKey, side: 'left' | 'right', slot: number): void => {
      const el = document.createElement('div');
      el.textContent = label;
      const size = slot === 0 ? 72 : 60;
      const bottom = slot === 0 ? 18 : 100;
      Object.assign(el.style, {
        position: 'absolute',
        [side]: '16px',
        bottom: `${bottom}px`,
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: 'rgba(255,233,201,0.16)',
        border: '2px solid rgba(255,233,201,0.5)',
        color: '#ffe9c9',
        fontSize: slot === 0 ? '17px' : '14px',
        fontWeight: '700',
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        backdropFilter: 'blur(2px)',
      } as Partial<CSSStyleDeclaration>);
      this.touchRoot.appendChild(el);
      this.input.bindButton(el, key);
      this.touchButtons.push(el);
    };
    mk('刹车', 'brake', 'left', 0);
    mk('◀ 倾', 'tiltL', 'left', 1);
    mk('油门', 'throttle', 'right', 0);
    mk('倾 ▶', 'tiltR', 'right', 1);
  }

  private updateTouchVisibility(): void {
    if (!this.touchMode) return;
    const show = this.screen === 'playing';
    for (const el of this.touchButtons) {
      el.style.display = show ? 'flex' : 'none';
    }
  }

  // ---------- 指针 / UI 按钮 ----------

  private onPointerDown = (e: PointerEvent): void => {
    this.audio.unlock();
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // 先命中按钮
    for (let i = this.uiButtons.length - 1; i >= 0; i--) {
      const b = this.uiButtons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        this.audio.click();
        this.handleAction(b.action);
        return;
      }
    }
    // 引导界面点击任意处推进
    if (this.screen === 'tutorial') this.advanceTutorial();
  };

  private button(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    action: string,
    variant: ButtonVariant = 'primary',
  ): void {
    this.uiButtons.push({ x, y, w, h, action });
    if (!label) return; // 纯热区(如关卡卡片)
    const ctx = this.ctx;
    if (variant === 'disabled') {
      ctx.fillStyle = 'rgba(90,74,110,0.6)';
      rrPath(ctx, x, y, w, h, 10);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,233,201,0.4)';
    } else if (variant === 'ghost') {
      ctx.fillStyle = 'rgba(255,233,201,0.12)';
      rrPath(ctx, x, y, w, h, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,233,201,0.5)';
      ctx.lineWidth = 2;
      rrPath(ctx, x, y, w, h, 10);
      ctx.stroke();
      ctx.fillStyle = '#ffe9c9';
    } else {
      ctx.fillStyle = '#ffe9c9';
      rrPath(ctx, x, y, w, h, 10);
      ctx.fill();
      ctx.strokeStyle = '#241a38';
      ctx.lineWidth = 2.5;
      rrPath(ctx, x, y, w, h, 10);
      ctx.stroke();
      ctx.fillStyle = '#241a38';
    }
    ctx.font = `bold ${Math.min(17, h * 0.4)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }

  // ---------- 动作分发 ----------

  private handleAction(action: string): void {
    if (action.startsWith('level:')) {
      this.startLevel(Number(action.split(':')[1]));
      return;
    }
    switch (action) {
      case 'pause':
        this.togglePause();
        break;
      case 'resume':
        if (this.screen === 'paused') this.screen = 'playing';
        break;
      case 'restart':
        this.startLevel(this.levelIndex, true);
        break;
      case 'quit':
        this.run = null;
        this.level = LEVELS[0];
        this.screen = 'title';
        this.audio.setEngine(false, 0, 0);
        break;
      case 'respawn':
        if (this.run && respawnAtCheckpoint(this.run, this.level)) {
          this.screen = 'playing';
        }
        break;
      case 'next':
        if (this.levelIndex < LEVELS.length - 1) this.startLevel(this.levelIndex + 1, true);
        else this.screen = 'final';
        break;
      case 'sound':
        this.save = { ...this.save, soundOn: !this.save.soundOn };
        writeSave(this.save);
        this.audio.setEnabled(this.save.soundOn);
        break;
      case 'howto':
        this.tutorialStep = 0;
        this.tutorialReturn = 'title';
        this.screen = 'tutorial';
        break;
      case 'tutorial:next':
        this.advanceTutorial();
        break;
      case 'tutorial:skip':
        this.finishTutorial();
        break;
    }
  }

  private togglePause(): void {
    if (this.screen === 'playing') this.screen = 'paused';
    else if (this.screen === 'paused') this.screen = 'playing';
    else if (this.screen === 'failed' || this.screen === 'complete') this.handleAction('quit');
  }

  private onConfirm(): void {
    switch (this.screen) {
      case 'title':
        this.startLevel(Math.min(this.save.unlocked, LEVELS.length) - 1);
        break;
      case 'paused':
        this.screen = 'playing';
        break;
      case 'failed':
        this.handleAction(this.run?.snapshot ? 'respawn' : 'restart');
        break;
      case 'complete':
        this.handleAction('next');
        break;
      case 'final':
        this.handleAction('quit');
        break;
      case 'tutorial':
        this.advanceTutorial();
        break;
      default:
        break;
    }
  }

  // ---------- 流程 ----------

  private startLevel(index: number, skipTutorial = false): void {
    this.levelIndex = index;
    this.level = LEVELS[index];
    this.run = createRun(index, this.level);
    this.lastScore = null;
    this.failReason = null;
    this.acc = 0;
    this.camX = this.run.rover.x;
    this.camY = this.run.rover.y + 1;
    if (!skipTutorial && index === 0 && !this.save.tutorialSeen) {
      this.tutorialStep = 0;
      this.tutorialReturn = 'playing';
      this.screen = 'tutorial';
    } else {
      this.screen = 'playing';
    }
  }

  private advanceTutorial(): void {
    this.tutorialStep++;
    if (this.tutorialStep >= TUTORIAL_STEPS) this.finishTutorial();
  }

  private finishTutorial(): void {
    if (!this.save.tutorialSeen) {
      this.save = { ...this.save, tutorialSeen: true };
      writeSave(this.save);
    }
    this.screen = this.tutorialReturn;
  }

  private onRunEvents(events: RunEvent[]): void {
    if (!this.run) return;
    for (const ev of events) {
      switch (ev.type) {
        case 'damage': {
          const strength = Math.min(1, ev.amount / 30);
          this.audio.thud(strength);
          this.particles.sparks(ev.x, ev.y, ev.amount * 0.6);
          if (ev.kind === 'impact') this.particles.landingPuff(ev.x, ev.y, ev.amount);
          if (ev.heavy) {
            this.shakeT = 0.4;
            this.shakeMag = Math.min(1, 0.3 + ev.amount / 40);
          }
          break;
        }
        case 'checkpoint':
          this.audio.ding();
          this.particles.checkpointBurst(ev.x, ev.y);
          break;
        case 'battery':
          this.audio.pickup();
          this.particles.checkpointBurst(ev.x, ev.y);
          break;
        case 'win': {
          this.lastScore = computeScore({
            time: this.run.time,
            cargo: this.run.cargo,
            energy: this.run.energy,
            respawns: this.run.respawns,
            parTime: this.level.parTime,
          });
          this.save = applyLevelComplete(this.save, this.levelIndex, this.lastScore.total, LEVELS.length);
          writeSave(this.save);
          this.audio.win();
          this.audio.setEngine(false, 0, 0);
          this.particles.confetti(this.run.rover.x, this.run.rover.y + 1);
          this.screen = 'complete';
          break;
        }
        case 'fail':
          this.failReason = ev.reason;
          this.audio.fail();
          this.audio.setEngine(false, 0, 0);
          this.shakeT = 0.5;
          this.shakeMag = 0.8;
          this.screen = 'failed';
          break;
      }
    }
  }

  // ---------- 主循环 ----------

  private tick = (now: number): void => {
    if (this.destroyed) return;
    const frameMs = now - this.last;
    this.last = now;
    const dt = Math.min(0.05, frameMs / 1000);
    this.time += dt;
    this.particles.adapt(frameMs);

    if (this.screen === 'playing' && this.run) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= PHYSICS_DT && steps < 24) {
        const events = stepRun(this.run, this.level, this.level.terrain, this.input.getState(), PHYSICS_DT);
        this.onRunEvents(events);
        this.acc -= PHYSICS_DT;
        steps++;
        if (this.screen !== 'playing') {
          this.acc = 0;
          break;
        }
      }
      // 连续效果:引擎声与车轮扬尘
      if (this.screen === 'playing') {
        const st = this.input.getState();
        this.audio.setEngine(true, st.throttle ? 1 : 0, Math.min(1, this.run.speed / 20));
        const grounded = this.run.rover.wheelGrounded[0] || this.run.rover.wheelGrounded[1];
        this.dustTimer -= dt;
        if (grounded && this.run.speed > 3 && this.dustTimer <= 0) {
          this.particles.dust(this.run.rover.x - 1, this.run.rover.y - 0.6, Math.sign(this.run.rover.vx), 2);
          this.dustTimer = 0.06;
        }
      }
    }

    this.updateCamera(dt);
    this.particles.update(dt);
    this.updateTouchVisibility();
    this.renderFrame();
    this.rafId = requestAnimationFrame(this.tick);
  };

  private updateCamera(dt: number): void {
    let tx: number;
    let ty: number;
    if (this.run) {
      const vx = this.run.rover.vx;
      tx = this.run.rover.x + Math.max(-3, Math.min(6, vx * 0.35));
      ty = this.run.rover.y + 1.2;
    } else {
      // 标题界面缓慢巡游
      tx = 40 + ((this.time * 3) % (this.level.lengthX - 100));
      ty = this.level.terrain.groundY(tx) + 2.5;
    }
    const k = Math.min(1, dt * 5);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
  }

  private renderFrame(): void {
    this.uiButtons = [];
    const shakeX = this.shakeT > 0 ? (Math.random() - 0.5) * 14 * this.shakeMag * this.shakeT : 0;
    const shakeY = this.shakeT > 0 ? (Math.random() - 0.5) * 10 * this.shakeMag * this.shakeT : 0;
    const liveScore = this.run
      ? computeScore({
          time: this.run.time,
          cargo: this.run.cargo,
          energy: this.run.energy,
          respawns: this.run.respawns,
          parTime: this.level.parTime,
        }).total
      : 0;
    const total = this.save.highScores.reduce((a, b) => a + b, 0);
    const view: View = {
      ctx: this.ctx,
      W: this.W,
      H: this.H,
      scale: this.scale,
      camX: this.camX + shakeX,
      camY: this.camY + shakeY,
      screen: this.screen,
      run: this.run,
      level: this.level,
      save: this.save,
      time: this.time,
      particles: this.particles,
      tutorialStep: this.tutorialStep,
      lastScore: this.lastScore,
      liveScore,
      portrait: this.portrait,
      button: (x, y, w, h, label, action, variant) =>
        this.button(x, y, w, h, label, action, variant),
    };
    render(view, total, totalRating(total, LEVELS.length), this.failReason);
  }
}

function rrPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
