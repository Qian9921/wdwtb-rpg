import Phaser from 'phaser';
import { AudioSystem } from '../systems/AudioSystem.js';
import { Juice } from '../systems/JuiceKit.js';

// ColorMatchScene：设计师工作小游戏「配色整理」——可爱、人人能玩、有设计味,不考专业知识。
// 上方给一块【客户钦定色】,下方一排可爱色卡,玩家把和它一模一样的那张挑出来(点/数字键)。
// 限时,连对涨 Combo,命中星星迸溅。靠审美直觉与眼力,不靠任何设计知识——色弱友好由难度控制色差。
// 每轮换一个"色系"主题(马卡龙 / 莫兰迪 / 果汁 / 复古 / 极简灰),让颜色本身就好看、有设计味。
// 接口与其它工作小游戏一致: init({difficulty, onComplete, skillBonus}) → onComplete({correct,total,ratio,maxCombo})
//
// 设计标准(沿用敲码节奏范本立的 4 条):
//  1) 人人能玩:核心操作就一个——挑出和目标一样的色卡,靠眼睛不靠知识。
//  2) 可爱:圆角柔和色块、命中星星迸溅、Combo 弹跳、色卡悬停微放大。
//  3) 有职业味:色系用真实设计术语(莫兰迪/马卡龙…),配色台的语境,设计师会心一笑。
//  4) 有爽感:限时倒计时、连击 Combo、"对了!"判定、难度越高色差越微妙(眼力挑战)。
export class ColorMatchScene extends Phaser.Scene {
  constructor() { super('ColorMatchScene'); }

  init(data) {
    this.difficulty = data?.difficulty || 'mid';
    this.onComplete = data?.onComplete || null;
    this.skillBonus = data?.skillBonus || 0;

    this.hit = 0;          // 配对正确数
    this.combo = 0;
    this.maxCombo = 0;
    this._roundIndex = 0;
    this._targetTotal = { easy: 8, mid: 10, hard: 14 }[this.difficulty] || 10;
    this._candCount = { easy: 3, mid: 4, hard: 5 }[this.difficulty] || 4;   // 色卡数量
    this._roundTime = { easy: 5200, mid: 4200, hard: 3300 }[this.difficulty] || 4200; // 每轮限时(ms)
    // HSV 扰动幅度:越小 = 干扰色越接近目标 = 越难分辨(难度体现在眼力,不在知识)
    this._delta = {
      easy: { h: 0.05, s: 0.15, v: 0.15 },
      mid:  { h: 0.032, s: 0.095, v: 0.095 },
      hard: { h: 0.02, s: 0.06, v: 0.06 },
    }[this.difficulty] || { h: 0.032, s: 0.095, v: 0.095 };

    // 色系主题:决定本轮颜色的饱和/明度范围,让配色好看、有设计味(纯装饰,不影响判定)
    this._palettes = [
      { name: '马卡龙', s: [0.34, 0.5],  v: [0.9, 1.0] },
      { name: '莫兰迪', s: [0.14, 0.3],  v: [0.6, 0.78] },
      { name: '果汁',   s: [0.62, 0.85], v: [0.86, 1.0] },
      { name: '复古',   s: [0.4, 0.6],   v: [0.55, 0.72] },
      { name: '极简灰', s: [0.05, 0.16], v: [0.76, 0.92] },
    ];

    this._chips = [];       // 当前轮色卡 [{ cont, color, correct }]
    this._transient = [];   // 每轮临时节点(高亮环、判定字…),下一轮开始时清掉
    this._roundActive = false;
    this._timeLeft = 0;
    this._done = false;
    this._doneFired = false; // 结算 onComplete 双发守卫,独立于 _done(游戏循环是否结束)
  }

  create() {
    const W = 960, H = 540;
    this.cameras.main.setBackgroundColor('#141018');
    this.cameras.main.setZoom(2);
    this.cameras.main.centerOn(480, 270);

    // 柔和渐层氛围(两块半透明圆角,营造"配色台"的温柔感)
    this.add.rectangle(480, 270, 960, 540, 0x1a1422).setDepth(0);
    const glow = this.add.graphics().setDepth(0);
    glow.fillStyle(0xffffff, 0.03); glow.fillRoundedRect(120, 60, 720, 420, 40);

    // 顶部标题条
    this.add.rectangle(480, 30, 960, 60, 0x141018, 0.92).setDepth(30);
    this.add.text(480, 16, '配色整理 · Color Sorting', { fontSize: '17px', color: '#ffb3d1', fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(31);
    this.add.text(480, 40, '把和【客户钦定色】一模一样的色卡挑出来 · 连对涨 Combo', { fontSize: '12px', color: '#b9a8c4' }).setOrigin(0.5, 0).setDepth(31);

    // 本轮提示 + 色系徽章
    this._familyBadge = this.add.text(480, 78, '', { fontSize: '13px', color: '#141018', fontStyle: 'bold', backgroundColor: '#ffd6e8', padding: { x: 10, y: 3 } }).setOrigin(0.5).setDepth(12);
    this.add.text(480, 104, '客户钦定色 ↓', { fontSize: '12px', color: '#c9b6d4' }).setOrigin(0.5).setDepth(12);

    // 目标色块(容器 + graphics,每轮重绘颜色;容器带轻微呼吸缩放,显得可爱有生命)
    this._targetG = this.add.graphics();
    this._targetCont = this.add.container(480, 178, [this._targetG]).setDepth(11);
    this.tweens.add({ targets: this._targetCont, scale: 1.04, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inout' });

    // 限时倒计时条(可爱粉)
    this.add.rectangle(480, 262, 328, 14, 0x000000, 0.25).setDepth(10);
    this._timerBg = this.add.rectangle(480, 262, 320, 10, 0x3a2f45, 1).setDepth(10);
    this._timerFill = this.add.rectangle(480 - 160, 262, 320, 10, 0xff8fc0, 1).setOrigin(0, 0.5).setDepth(11);

    // HUD:进度 + Combo 大字
    this._progText = this.add.text(30, 18, '', { fontSize: '14px', color: '#c9b6d4' }).setDepth(31);
    this._comboText = this.add.text(480, 300, '', { fontSize: '40px', color: '#ffd24d', fontStyle: 'bold', stroke: '#2a1c30', strokeThickness: 5 }).setOrigin(0.5).setDepth(20).setAlpha(0);
    this._hint = this.add.text(480, 470, '点色卡 或 按数字键 1-' + this._candCount + ' 选色', { fontSize: '12px', color: '#8a7a95' }).setOrigin(0.5).setDepth(12);

    // 键盘:数字键选色卡
    this._onKey = (e) => {
      if (!this._roundActive || this._done) return;
      const n = parseInt(e.key, 10);
      if (!isNaN(n) && n >= 1 && n <= this._chips.length) this._pick(n - 1);
    };
    this.input.keyboard.on('keydown', this._onKey);
    // ESC:以当前成绩提前结算退出
    this._onEsc = () => this._finish();
    this.input.keyboard.on('keydown-ESC', this._onEsc);

    this._updateHud();
    this._startRound();
    this.events.once('shutdown', () => this._cleanup());
  }

  // ---- 颜色工具 ----
  _hsvInt(h, s, v) {
    const c = Phaser.Display.Color.HSVToRGB(((h % 1) + 1) % 1, Phaser.Math.Clamp(s, 0, 1), Phaser.Math.Clamp(v, 0, 1));
    return (c.r << 16) | (c.g << 8) | c.b;
  }
  _rand(a, b) { return a + Math.random() * (b - a); }
  _signed(mag) { return (Math.random() < 0.5 ? -1 : 1) * (mag * 0.55 + Math.random() * mag * 0.45); } // [0.55,1]×mag,带符号,绝不为 0

  _startRound() {
    // 清掉上一轮的临时节点与色卡
    this._transient.forEach(o => o.destroy());
    this._transient = [];
    this._chips.forEach(c => c.cont.destroy());
    this._chips = [];

    const fam = Phaser.Utils.Array.GetRandom(this._palettes);
    this._familyBadge.setText(`本轮色系 · ${fam.name}`);

    // 目标色:在色系范围内取一个好看的基色
    const baseH = Math.random();
    const baseS = this._rand(fam.s[0], fam.s[1]);
    const baseV = this._rand(fam.v[0], fam.v[1]);
    const targetColor = this._hsvInt(baseH, baseS, baseV);

    // 绘制目标色块
    this._drawSwatch(this._targetG, 150, 108, targetColor, 20);
    this._targetCont.setScale(1);

    // 生成色卡:一张=目标色(正确),其余=目标色的微扰(干扰项)
    const N = this._candCount;
    const correctIdx = Phaser.Math.Between(0, N - 1);
    const d = this._delta;
    const chipW = N >= 5 ? 92 : 108, chipH = 92, gap = 24;
    const totalW = N * chipW + (N - 1) * gap;
    const startX = 480 - totalW / 2 + chipW / 2;

    for (let i = 0; i < N; i++) {
      let color;
      if (i === correctIdx) {
        color = targetColor;
      } else {
        color = this._hsvInt(baseH + this._signed(d.h), baseS + this._signed(d.s), baseV + this._signed(d.v));
      }
      const x = startX + i * (chipW + gap);
      const y = 388;
      const g = this.add.graphics();
      this._drawSwatch(g, chipW, chipH, color, 16);
      // 数字徽章(可爱圆点)
      const badge = this.add.graphics();
      badge.fillStyle(0xffffff, 0.9); badge.fillCircle(0, chipH / 2 + 18, 11);
      const num = this.add.text(0, chipH / 2 + 18, String(i + 1), { fontSize: '13px', color: '#3a2f45', fontStyle: 'bold' }).setOrigin(0.5);
      const cont = this.add.container(x, y, [g, badge, num]).setDepth(10);
      cont.setSize(chipW, chipH);
      cont.setInteractive(new Phaser.Geom.Rectangle(-chipW / 2, -chipH / 2, chipW, chipH), Phaser.Geom.Rectangle.Contains);
      const idx = i;
      cont.on('pointerover', () => { if (this._roundActive) this.tweens.add({ targets: cont, scale: 1.08, duration: 120, ease: 'Sine.out' }); });
      cont.on('pointerout', () => { if (this._roundActive) this.tweens.add({ targets: cont, scale: 1, duration: 120, ease: 'Sine.out' }); });
      cont.on('pointerdown', () => this._pick(idx));
      // 入场小弹跳(可爱)
      cont.setScale(0.6);
      this.tweens.add({ targets: cont, scale: 1, duration: 260, delay: i * 45, ease: 'Back.out' });
      this._chips.push({ cont, color, correct: i === correctIdx });
    }

    // 开启限时
    this._timeLeft = this._roundTime;
    this._timerFill.width = 320;
    this._timerFill.setFillStyle(0xff8fc0, 1);
    this._roundActive = true;
    this._updateHud();
  }

  _drawSwatch(g, w, h, color, radius) {
    g.clear();
    g.fillStyle(0x000000, 0.18); g.fillRoundedRect(-w / 2 + 3, -h / 2 + 5, w, h, radius); // 柔和投影
    g.fillStyle(color, 1); g.fillRoundedRect(-w / 2, -h / 2, w, h, radius);
    g.lineStyle(3, 0xffffff, 0.5); g.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
  }

  update(_t, dms) {
    if (this._done || !this._roundActive) return;
    this._timeLeft -= dms;
    const frac = Phaser.Math.Clamp(this._timeLeft / this._roundTime, 0, 1);
    this._timerFill.width = 320 * frac;
    if (frac < 0.3) this._timerFill.setFillStyle(0xff5c7a, 1); // 快没时间变红,催促感
    if (this._timeLeft <= 0) {
      this._roundActive = false;
      this._reveal(-1, false); // 超时=没选对
    }
  }

  // 玩家选了第 i 张色卡
  _pick(i) {
    if (!this._roundActive || this._done) return;
    this._roundActive = false;
    AudioSystem.uiClick && AudioSystem.uiClick();
    const chip = this._chips[i];
    this._reveal(i, chip.correct);
  }

  // 揭晓结果:success=选对了;chosenIdx=-1 表示超时未选
  _reveal(chosenIdx, success) {
    const correctChip = this._chips.find(c => c.correct);
    if (success) {
      this.hit++;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      const chip = this._chips[chosenIdx];
      // 星星迸溅 + 弹一下(爽感)
      Juice.celebrate && Juice.celebrate(this, chip.cont.x, chip.cont.y, chip.color);
      this.tweens.add({ targets: chip.cont, scale: 1.25, duration: 180, yoyo: true, ease: 'Back.out' });
      const grade = this.combo >= 3 ? '完美对色!' : '对了!';
      const j = this.add.text(chip.cont.x, chip.cont.y - 70, grade, { fontSize: '18px', color: '#7bed9f', fontStyle: 'bold', stroke: '#1a2a1e', strokeThickness: 4 }).setOrigin(0.5).setDepth(21);
      this.tweens.add({ targets: j, y: j.y - 26, alpha: 0, duration: 620, onComplete: () => j.destroy() });
      this._transient.push(j);
    } else {
      this.combo = 0;
      AudioSystem.error && AudioSystem.error();
      // 选错/超时:选中的抖一抖,把正确那张高亮出来(告诉玩家答案,不挫败)
      if (chosenIdx >= 0) {
        const wrong = this._chips[chosenIdx].cont;
        this.tweens.add({ targets: wrong, x: wrong.x + 6, duration: 60, yoyo: true, repeat: 3 });
      }
      const ring = this.add.graphics().setDepth(21);
      const cc = correctChip.cont;
      ring.lineStyle(4, 0xffe07a, 0.95);
      ring.strokeRoundedRect(cc.x - 56, cc.y - 56, 112, 112, 18);
      this.tweens.add({ targets: ring, alpha: 0.3, duration: 400, yoyo: true, repeat: 2 });
      const tag = this.add.text(cc.x, cc.y - 70, chosenIdx < 0 ? '时间到 · 这张才对' : '这张才对', { fontSize: '14px', color: '#ffe07a', fontStyle: 'bold', stroke: '#2a2410', strokeThickness: 4 }).setOrigin(0.5).setDepth(21);
      this._transient.push(ring, tag);
    }
    this._flashCombo();
    this._updateHud();

    this._roundIndex++;
    this.time.delayedCall(success ? 620 : 1050, () => {
      if (this._done) return;
      if (this._roundIndex >= this._targetTotal) this._finish();
      else this._startRound();
    });
  }

  _flashCombo() {
    if (this.combo >= 2) {
      this._comboText.setText(`${this.combo} Combo!`).setAlpha(1).setScale(1.3);
      this.tweens.add({ targets: this._comboText, scale: 1, duration: 200, ease: 'Back.out' });
    } else {
      this._comboText.setAlpha(0);
    }
  }

  _updateHud() {
    this._progText.setText(`配对 ${this.hit} / ${this._targetTotal}`);
  }

  _finish() {
    if (this._done) return;
    this._done = true;
    this._roundActive = false;
    const ratio = this._targetTotal ? this.hit / this._targetTotal : 0;

    // 结算页
    this.add.rectangle(480, 270, 960, 540, 0x141018, 0.86).setDepth(50);
    let msg;
    if (ratio >= 0.9) msg = '眼力惊人，配色一眼绝!';
    else if (ratio >= 0.6) msg = '审美在线，色感不错';
    else msg = '慢慢练眼，色彩会越看越准';
    this.add.text(480, 188, `配对 ${this.hit} / ${this._targetTotal}`, { fontSize: '30px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(51);
    this.add.text(480, 233, `最高连击 ${this.maxCombo} Combo`, { fontSize: '20px', color: '#ffd24d' }).setOrigin(0.5).setDepth(51);
    this.add.text(480, 273, msg, { fontSize: '17px', color: '#e6d6ee' }).setOrigin(0.5).setDepth(51);
    const cont = this.add.text(480, 340, '空格 / 回车 / 点击 继续', { fontSize: '13px', color: '#ffb3d1' }).setOrigin(0.5).setDepth(51);
    this.tweens.add({ targets: cont, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });

    // 解绑选色监听,换成"继续"
    this.input.keyboard.off('keydown', this._onKey);
    if (this._onEsc) this.input.keyboard.off('keydown-ESC', this._onEsc);
    const done = () => {
      if (this._doneFired) return; // 防双发:同一帧 space+click 或连按导致 onComplete 重复执行
      this._doneFired = true;
      const result = { correct: this.hit, total: this._targetTotal, ratio: Math.round(ratio * 100) / 100, maxCombo: this.maxCombo };
      if (this.onComplete) this.onComplete(result);
    };
    this._onContinueKey = (e) => { if (e.code === 'Space' || e.code === 'Enter') done(); };
    this._onContinuePointer = () => done();
    this.time.delayedCall(220, () => {
      this.input.keyboard.on('keydown', this._onContinueKey);
      this.input.on('pointerdown', this._onContinuePointer);
    });
  }

  _cleanup() {
    if (this._onKey) this.input.keyboard.off('keydown', this._onKey);
    if (this._onEsc) this.input.keyboard.off('keydown-ESC', this._onEsc);
    if (this._onContinueKey) this.input.keyboard.off('keydown', this._onContinueKey);
    if (this._onContinuePointer) this.input.off('pointerdown', this._onContinuePointer);
  }
}
