import Phaser from 'phaser';
import { AudioSystem } from '../systems/AudioSystem.js';
import { Juice } from '../systems/JuiceKit.js';

// TypingRhythmScene：程序员工作小游戏「敲码节奏」——可爱、人人能玩、有职业味,不考编程知识。
// 代码片段从上往下"掉"到判定线,玩家在对的时机按【空格/回车】敲掉它,连击涨 Combo,有节奏爽感。
// 靠手感与时机(像打节拍),不靠专业知识——迷茫的大学生也能上手,还上瘾。
// 接口与其它工作小游戏一致: init({difficulty, onComplete}) → onComplete({correct,total,ratio,maxCombo})
//
// 设计标准(其它职业新玩法的范本):
//  1) 人人能玩:核心操作就一个键(空格),靠时机不靠知识。
//  2) 可爱:代码片段是彩色圆角胶囊、命中有星星迸溅、Combo 有弹跳数字。
//  3) 有职业味:掉下来的是真的代码词(def/return/import/for…),程序员一看会心一笑。
//  4) 有爽感:连击 Combo、Perfect/Good 判定、节奏渐快。
export class TypingRhythmScene extends Phaser.Scene {
  constructor() { super('TypingRhythmScene'); }

  init(data) {
    this.difficulty = data?.difficulty || 'mid';
    this.onComplete = data?.onComplete || null;
    this.skillBonus = data?.skillBonus || 0;
    // 掉落的"代码片段"——纯装饰性职业味文本,和判定无关(玩家不用懂它)
    this.snippets = [
      'def login():', 'return true', 'import os', 'for i in range(n):', 'if user.ok:',
      'print("hi")', 'git commit', 'npm run dev', 'let x = 0', 'await fetch()',
      'try:', 'except:', 'class App:', 'self.data', 'const btn', '} else {',
      'SELECT * FROM', 'console.log', 'async function', 'x += 1',
    ];
    this.hit = 0;         // 命中数
    this.total = 0;       // 总下落数(判定过的)
    this.combo = 0;
    this.maxCombo = 0;
    this._notes = [];     // 正在下落的音符 { obj, y, speed, judged }
    this._spawnTimer = null;
    this._targetTotal = { easy: 12, mid: 16, hard: 20 }[this.difficulty] || 16;
    this._spawned = 0;
    this._done = false;
    this._doneFired = false; // 结算 onComplete 双发守卫,独立于 _done(游戏循环是否结束)
  }

  create() {
    const W = 960, H = 540;
    this.cameras.main.setBackgroundColor('#0e1420');
    this.cameras.main.setZoom(2);
    this.cameras.main.centerOn(480, 270);

    // 顶部标题条(深色底衬,depth 高于下落音符,不被掉落的代码胶囊盖住)
    this.add.rectangle(480, 30, 960, 60, 0x0e1420, 0.92).setDepth(30);
    this.add.text(480, 16, '敲码节奏 · Coding Flow', { fontSize: '17px', color: '#7ee0ff', fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(31);
    this.add.text(480, 40, '代码掉到亮线上时，按【空格】敲掉它 · 连击涨 Combo', { fontSize: '12px', color: '#8b9bb0' }).setOrigin(0.5, 0).setDepth(31);

    // 判定线(亮青色)——代码掉到这条线附近按键=命中
    this._hitY = 430;
    this.add.rectangle(480, this._hitY, 900, 4, 0x7ee0ff, 0.9).setDepth(5);
    this.add.rectangle(480, this._hitY, 900, 44, 0x7ee0ff, 0.06).setDepth(4); // 命中带
    this.add.text(70, this._hitY, '▶', { fontSize: '20px', color: '#7ee0ff' }).setOrigin(0.5);
    this.add.text(890, this._hitY, '◀', { fontSize: '20px', color: '#7ee0ff' }).setOrigin(0.5);

    // HUD:Combo + 进度
    this._comboText = this.add.text(480, 200, '', { fontSize: '48px', color: '#ffd24d', fontStyle: 'bold', stroke: '#0a0a14', strokeThickness: 5 }).setOrigin(0.5).setAlpha(0);
    this._progText = this.add.text(30, 18, '', { fontSize: '14px', color: '#8b949e' }).setDepth(31);
    this._hint = this.add.text(480, this._hitY + 40, '空格 / 回车 = 敲', { fontSize: '12px', color: '#5a6a7e' }).setOrigin(0.5);

    // 输入:空格/回车=敲
    const kb = this.input.keyboard;
    this._onBeat = () => this._beat();
    kb.on('keydown-SPACE', this._onBeat);
    kb.on('keydown-ENTER', this._onBeat);
    // 也支持鼠标点(全键盘+鼠标都可)
    this.input.on('pointerdown', this._onBeat);
    // ESC:以当前成绩提前结算退出(游戏中途放弃也要让工单/任务链正常推进)
    this._onEsc = () => this._finish();
    kb.on('keydown-ESC', this._onEsc);

    // 掉落节奏:难度越高越快、间隔越短
    const gap = { easy: 900, mid: 750, hard: 600 }[this.difficulty] || 750;
    this._speed = { easy: 2.2, mid: 2.8, hard: 3.4 }[this.difficulty] || 2.8;
    this._spawnTimer = this.time.addEvent({ delay: gap, loop: true, callback: () => this._spawn() });
    this._spawn(); // 立刻来第一个

    this._updateHud();
    this.events.once('shutdown', () => this._cleanup());
  }

  _spawn() {
    if (this._spawned >= this._targetTotal) { return; }
    this._spawned++;
    const text = Phaser.Utils.Array.GetRandom(this.snippets);
    const tone = [0x6fb2e8, 0x7bd88f, 0xe8a86f, 0xc79ae8, 0xe89ac0][this._spawned % 5];
    const x = Phaser.Math.Between(180, 780);
    // 可爱圆角胶囊 + 代码文字
    const g = this.add.graphics();
    const label = this.add.text(0, 0, text, { fontSize: '15px', color: '#0e1420', fontStyle: 'bold' }).setOrigin(0.5);
    const w = label.width + 28, h = 30;
    g.fillStyle(tone, 1); g.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    g.lineStyle(2, 0xffffff, 0.4); g.strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    const cont = this.add.container(x, -20, [g, label]).setDepth(10);
    this._notes.push({ obj: cont, speed: this._speed, judged: false });
  }

  update(_t, dms) {
    if (this._done) return;
    const dt = Math.min(dms, 50) / 16.67; // 归一化到 ~60fps,封顶 50ms 防切标签页/卡顿导致音符瞬移跳过判定线
    for (const n of this._notes) {
      if (n.judged) continue;
      n.obj.y += n.speed * dt;
      // 掉过判定线太多(miss)
      if (n.obj.y > this._hitY + 60) {
        n.judged = true;
        this._miss(n);
      }
    }
    // 全部下落完 + 无未判定 → 结算
    if (this._spawned >= this._targetTotal && this._notes.every(n => n.judged)) {
      this._finish();
    }
  }

  // 按键:找最接近判定线的未判定音符,按距离给 Perfect/Good/Miss
  _beat() {
    if (this._done) return;
    let best = null, bestDist = 999;
    for (const n of this._notes) {
      if (n.judged) continue;
      const d = Math.abs(n.obj.y - this._hitY);
      if (d < bestDist) { bestDist = d; best = n; }
    }
    if (!best || bestDist > 55) {
      // 空敲(没有音符在命中带)——轻微断连击,不算总数
      if (this.combo > 0) { this.combo = 0; this._flashCombo(); }
      return;
    }
    best.judged = true;
    this.total++;
    if (bestDist <= 22) { this._hitNote(best, 'Perfect', 0x7ee0ff); }
    else { this._hitNote(best, 'Good', 0x7bd88f); }
  }

  _hitNote(n, grade, color) {
    this.hit++;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    AudioSystem.uiClick && AudioSystem.uiClick();
    // 命中特效:星星迸溅 + 判定字
    Juice.celebrate && Juice.celebrate(this, n.obj.x, this._hitY, color);
    const j = this.add.text(n.obj.x, this._hitY - 20, grade, { fontSize: '16px', color: grade === 'Perfect' ? '#7ee0ff' : '#7bd88f', fontStyle: 'bold' }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: j, y: j.y - 30, alpha: 0, duration: 500, onComplete: () => j.destroy() });
    // 音符弹掉
    this.tweens.add({ targets: n.obj, scale: 1.4, alpha: 0, duration: 200, ease: 'Back.in', onComplete: () => n.obj.destroy() });
    this._flashCombo();
    this._updateHud();
  }

  _miss(n) {
    this.total++;
    this.combo = 0;
    // 音符变灰坠落
    this.tweens.add({ targets: n.obj, alpha: 0, y: n.obj.y + 40, duration: 300, onComplete: () => n.obj.destroy() });
    this._flashCombo();
    this._updateHud();
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
    this._progText.setText(`敲对 ${this.hit} / ${this._targetTotal}`);
  }

  _finish() {
    if (this._done) return;
    this._done = true;
    if (this._spawnTimer) this._spawnTimer.remove();
    const ratio = this._targetTotal ? this.hit / this._targetTotal : 0;
    // 结算页
    const mask = this.add.rectangle(480, 270, 960, 540, 0x0e1420, 0.85).setDepth(50);
    let msg;
    if (ratio >= 0.9) msg = '手感爆棚，代码如流水！';
    else if (ratio >= 0.6) msg = '不错，节奏抓住了';
    else msg = '慢慢来，找到你的节奏';
    this.add.text(480, 190, `敲对 ${this.hit} / ${this._targetTotal}`, { fontSize: '30px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(51);
    this.add.text(480, 235, `最高连击 ${this.maxCombo} Combo`, { fontSize: '20px', color: '#ffd24d' }).setOrigin(0.5).setDepth(51);
    this.add.text(480, 275, msg, { fontSize: '17px', color: '#c9d1d9' }).setOrigin(0.5).setDepth(51);
    const cont = this.add.text(480, 340, '空格 / 回车 / 点击 继续', { fontSize: '13px', color: '#7ee0ff' }).setOrigin(0.5).setDepth(51);
    this.tweens.add({ targets: cont, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });
    // 清掉敲的监听,换成继续
    const kb = this.input.keyboard;
    kb.off('keydown-SPACE', this._onBeat);
    kb.off('keydown-ENTER', this._onBeat);
    this.input.off('pointerdown', this._onBeat);
    kb.off('keydown-ESC', this._onEsc);
    const done = () => {
      if (this._doneFired) return; // 防双发:同一帧 space+click 或连按导致 onComplete 重复执行
      this._doneFired = true;
      const result = { correct: this.hit, total: this._targetTotal, ratio: Math.round(ratio * 100) / 100, maxCombo: this.maxCombo };
      if (this.onComplete) this.onComplete(result);
    };
    this._onDone = done;
    this.time.delayedCall(200, () => {
      kb.on('keydown-SPACE', done);
      kb.on('keydown-ENTER', done);
      this.input.on('pointerdown', done);
    });
  }

  _cleanup() {
    if (this._spawnTimer) this._spawnTimer.remove();
    const kb = this.input.keyboard;
    if (this._onBeat) { kb.off('keydown-SPACE', this._onBeat); kb.off('keydown-ENTER', this._onBeat); this.input.off('pointerdown', this._onBeat); }
    if (this._onEsc) kb.off('keydown-ESC', this._onEsc);
    if (this._onDone) { kb.off('keydown-SPACE', this._onDone); kb.off('keydown-ENTER', this._onDone); this.input.off('pointerdown', this._onDone); }
  }
}
