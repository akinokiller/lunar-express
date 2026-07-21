// Web Audio 程序化音效:引擎轰鸣/碰撞/检查点/拾取/过关/失败
// 注意:AudioContext 必须在用户首次交互后创建(unlock 由输入事件触发)

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private noiseGain: GainNode | null = null;
  enabled = true;

  /** 首次用户交互时调用 */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC =
      typeof window !== 'undefined'
        ? window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.85 : 0;
    this.master.connect(ctx.destination);

    // 引擎:锯齿波 + 低通噪声
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 50;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(engineFilter).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(ctx, 1.2);
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 300;
    noiseFilter.Q.value = 0.8;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    noise.connect(noiseFilter).connect(this.noiseGain).connect(this.master);
    noise.start();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? 0.85 : 0, this.ctx.currentTime, 0.03);
    }
  }

  /** 每帧更新引擎声:active 是否在游戏中,throttle 0-1,speedNorm 0-1 */
  setEngine(active: boolean, throttle: number, speedNorm: number): void {
    if (!this.ctx || !this.engineGain || !this.engineOsc || !this.noiseGain) return;
    const t = this.ctx.currentTime;
    const g = active ? 0.045 + throttle * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(g, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(42 + speedNorm * 85 + throttle * 28, t, 0.1);
    this.noiseGain.gain.setTargetAtTime(active ? 0.02 + throttle * 0.05 : 0, t, 0.1);
  }

  private noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** 碰撞闷响,strength 0-1 */
  thud(strength: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5 * Math.min(1, strength), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.3);

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(ctx, 0.15);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.35 * Math.min(1, strength), t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    noise.connect(f).connect(ng).connect(this.master);
    noise.start(t);
  }

  private beep(freq: number, start: number, dur: number, vol = 0.22, type: OscillatorType = 'sine'): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(vol, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(gain).connect(this.master);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  /** 检查点叮声 */
  ding(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.beep(880, t, 0.18);
    this.beep(1318, t + 0.09, 0.25);
  }

  /** 电池拾取 */
  pickup(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.beep(660, t, 0.1, 0.18, 'square');
    this.beep(990, t + 0.06, 0.14, 0.15, 'square');
  }

  /** 过关旋律 */
  win(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [523, 659, 784, 1046, 1318];
    notes.forEach((f, i) => this.beep(f, t + i * 0.11, 0.3, 0.22, 'triangle'));
  }

  /** 失败音 */
  fail(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [392, 311, 233, 155];
    notes.forEach((f, i) => this.beep(f, t + i * 0.16, 0.32, 0.22, 'sawtooth'));
  }

  /** UI 点击 */
  click(): void {
    if (!this.ctx) return;
    this.beep(700, this.ctx.currentTime, 0.06, 0.12, 'square');
  }

  dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.engineOsc = null;
    this.engineGain = null;
    this.noiseGain = null;
    this.master = null;
  }
}
