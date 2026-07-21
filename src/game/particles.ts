// 粒子系统:扬尘/尘雾/火花/检查点闪光/过关彩带,数量随帧率自适应

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
}

const DUST_COLORS = ['#c9b18a', '#b39b77', '#a08868'];
const SPARK_COLORS = ['#ffd166', '#ff8c42', '#ffe9c9'];
const CONFETTI_COLORS = ['#e2703a', '#3ec6c6', '#ffe9c9', '#f6c453', '#b565d8'];

export class Particles {
  list: Particle[] = [];
  private cap = 400;
  private slowFrames = 0;

  /** 根据帧耗时自适应粒子上限 */
  adapt(frameMs: number): void {
    if (frameMs > 24) {
      this.slowFrames++;
      if (this.slowFrames > 30) {
        this.cap = Math.max(120, this.cap - 60);
        this.slowFrames = 0;
      }
    } else if (frameMs < 17 && this.cap < 400) {
      this.cap = Math.min(400, this.cap + 10);
      this.slowFrames = 0;
    }
  }

  private add(p: Particle): void {
    if (this.list.length >= this.cap) this.list.shift();
    this.list.push(p);
  }

  /** 车轮扬尘 */
  dust(x: number, y: number, dirX: number, n = 2): void {
    for (let i = 0; i < n; i++) {
      this.add({
        x: x + (Math.random() - 0.5) * 0.5,
        y: y + Math.random() * 0.2,
        vx: -dirX * (1 + Math.random() * 2) + (Math.random() - 0.5),
        vy: 1 + Math.random() * 1.6,
        life: 0,
        maxLife: 0.5 + Math.random() * 0.5,
        size: 0.08 + Math.random() * 0.16,
        color: DUST_COLORS[(Math.random() * DUST_COLORS.length) | 0],
        gravity: 1.2,
      });
    }
  }

  /** 着陆尘雾 */
  landingPuff(x: number, y: number, strength: number): void {
    const n = Math.min(24, Math.floor(6 + strength * 2));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI;
      const sp = 1 + Math.random() * (2 + strength * 0.4);
      this.add({
        x,
        y: y + 0.1,
        vx: Math.cos(a) * sp * (Math.random() < 0.5 ? -1 : 1),
        vy: Math.abs(Math.sin(a)) * sp * 0.6,
        life: 0,
        maxLife: 0.6 + Math.random() * 0.6,
        size: 0.14 + Math.random() * 0.24,
        color: DUST_COLORS[(Math.random() * DUST_COLORS.length) | 0],
        gravity: 0.9,
      });
    }
  }

  /** 碰撞火花 */
  sparks(x: number, y: number, strength: number): void {
    const n = Math.min(30, Math.floor(8 + strength));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 5;
      this.add({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0,
        maxLife: 0.3 + Math.random() * 0.4,
        size: 0.05 + Math.random() * 0.09,
        color: SPARK_COLORS[(Math.random() * SPARK_COLORS.length) | 0],
        gravity: 3.5,
      });
    }
  }

  /** 检查点光环 */
  checkpointBurst(x: number, y: number): void {
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      this.add({
        x,
        y: y + 1,
        vx: Math.cos(a) * 3,
        vy: Math.sin(a) * 3 + 1,
        life: 0,
        maxLife: 0.7,
        size: 0.09,
        color: '#3ec6c6',
        gravity: 0.4,
      });
    }
  }

  /** 过关彩带 */
  confetti(x: number, y: number): void {
    for (let i = 0; i < 80; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const sp = 4 + Math.random() * 7;
      this.add({
        x: x + (Math.random() - 0.5) * 2,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0,
        maxLife: 1.2 + Math.random() * 1.2,
        size: 0.09 + Math.random() * 0.12,
        color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
        gravity: 2.2,
      });
    }
  }

  update(dt: number): void {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        list.splice(i, 1);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }
}
