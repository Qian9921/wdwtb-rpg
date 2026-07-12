import Phaser from 'phaser';
import { AudioSystem } from '../systems/AudioSystem.js';
import { Juice } from '../systems/JuiceKit.js';
import { resolveWorkGameFlavor, pickSequencePool } from '../systems/MinigameFlavor.js';

// SequenceGameScene：第二种工作小游戏「顺序重组」。
// 打乱的步骤卡,按正确顺序依次点击还原——考"流程感"而非"找茬眼力"。
// flavor: 'dev'=代码执行顺序 / 'test'=测试流程顺序(题库真分叉,不只换皮)。
// 接口与 DebugGameScene 一致: init({difficulty, flavor, onComplete}) → onComplete({correct,total,ratio})
export class SequenceGameScene extends Phaser.Scene {
  constructor() { super('SequenceGameScene'); }

  init(data) {
    this.difficulty = data?.difficulty || null;
    this.chrome = data?.chrome || resolveWorkGameFlavor(data?.career, data?.subRole || data?.flavor);
    if (data?.flavor === 'test' || data?.flavor === 'dev') {
      this.chrome = resolveWorkGameFlavor('programmer', data.flavor);
    }
    this.flavor = this.chrome.sequenceKey || this.chrome.key;
    this.onComplete = data?.onComplete || null;
    this.skillBonus = data?.skillBonus || 0; // 技能→时限加成（秒）
    this.puzzles = null;
    this.idx = 0;
    this.solved = 0;
    this.timeLeft = 45;
    this.timerEvent = null;
    this.ui = null;
    this._numKeyHandlers = []; // 当前题目数字键(1-9)绑定，对应显示顺序的卡片
    this._advanceKeyHandler = null;
  }

  _shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  create() {
    this.cameras.main.setBackgroundColor('#10141c');
    this.cameras.main.setZoom(2);
    this.cameras.main.centerOn(480, 270);
    this.titleText = this.add.text(480, 20, this.chrome.sequenceTitle, { fontSize: '17px', color: '#58a6ff', fontStyle: 'bold' }).setOrigin(0.5, 0);
    this.progressText = this.add.text(30, 18, '', { fontSize: '15px', color: '#8b949e' });
    this.timerText = this.add.text(930, 18, '', { fontSize: '15px', color: '#e6e6e6' }).setOrigin(1, 0);
    if (this.skillBonus > 0) {
      this.add.text(930, 38, `技能加成 +${this.skillBonus}s`, { fontSize: '11px', color: '#3fb950' }).setOrigin(1, 0);
    }
    this._loadPuzzles();
    this.events.once('shutdown', () => this._clearUI()); // 场景切换时解绑键盘，防泄漏
  }

  _loadPuzzles() {
    const loading = this.add.text(480, 270, '加载题目…', { fontSize: '16px', color: '#8b949e' }).setOrigin(0.5);
    fetch('./data/sequence_puzzles.json')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        const all = pickSequencePool(data, this.flavor);
        const rounds = { easy: 2, mid: 2, hard: 3 }[this.difficulty] || 2;
        let pool = this.difficulty ? all.filter(p => p.difficulty === this.difficulty) : all;
        if (pool.length < rounds) pool = all;
        this.puzzles = this._shuffle(pool).slice(0, rounds);
        loading.destroy();
        this._showPuzzle();
      })
      .catch(err => {
        console.warn('[SequenceGame] 题目加载失败:', err.message);
        this._finish();
      });
  }

  _showPuzzle() {
    this._clearUI();
    this.ui = this.add.container(0, 0);
    const c = this.ui;
    const pz = this.puzzles[this.idx];
    this.correctOrder = pz.lines;           // 正确顺序
    this.nextExpect = 0;                     // 期望点第几步
    this.misses = 0;                         // 本题点错次数(影响判定)
    this.progressText.setText(`第 ${this.idx + 1}/${this.puzzles.length} 题`);
    this.timeLeft = ({ easy: 40, mid: 45, hard: 55 }[pz.difficulty] || 45) + this.skillBonus;
    this._updateTimer();

    c.add(this.add.text(480, 52, pz.title, { fontSize: '16px', color: '#c9d1d9' }).setOrigin(0.5, 0));
    c.add(this.add.text(480, 76, `${this.chrome.sequenceHint}（数字键1-9可选）`, { fontSize: '13px', color: '#8b949e' }).setOrigin(0.5, 0));

    // 打乱展示(保证不等于原序)
    let display = this._shuffle(pz.lines);
    if (display.join() === pz.lines.join() && display.length > 1) {
      [display[0], display[1]] = [display[1], display[0]];
    }
    const rowH = 44, top = 116;
    this.cards = display.map((line, i) => {
      const ry = top + i * (rowH + 8);
      const bg = this.add.rectangle(480, ry, 680, rowH, 0x1b2330).setStrokeStyle(2, 0x2c3a50)
        .setInteractive({ useHandCursor: true });
      // 选前显示按键提示数字(1-9)；选中后 _pick 会覆盖为完成顺序号
      const num = this.add.text(160, ry, i < 9 ? String(i + 1) : '·', { fontSize: '16px', color: '#484f58', fontStyle: 'bold' }).setOrigin(0.5);
      const txt = this.add.text(190, ry, line, { fontSize: '15px', color: '#c9d1d9' }).setOrigin(0, 0.5);
      const card = { bg, num, txt, line, done: false };
      bg.on('pointerover', () => { if (!card.done) bg.setFillStyle(0x243044); });
      bg.on('pointerout', () => { if (!card.done) bg.setFillStyle(0x1b2330); });
      bg.on('pointerdown', () => this._pick(card));
      c.add(bg); c.add(num); c.add(txt);
      return card;
    });
    this._bindCardKeys(); // 数字键 1-9 对应显示顺序的卡片，键鼠都可点

    this._clearTimer();
    this.timerEvent = this.time.addEvent({
      delay: 1000, repeat: this.timeLeft - 1,
      callback: () => { this.timeLeft--; this._updateTimer(); if (this.timeLeft <= 0) this._timeout(); },
    });
  }

  // 数字键 1-9 = 点选对应显示位置的卡片
  _bindCardKeys() {
    this._unbindCardKeys();
    const kb = this.input.keyboard;
    const NUMS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
    this.cards.forEach((card, i) => {
      if (i >= NUMS.length) return;
      const handler = () => this._pick(card);
      kb.on(`keydown-${NUMS[i]}`, handler);
      this._numKeyHandlers.push({ key: NUMS[i], handler });
    });
  }

  _unbindCardKeys() {
    const kb = this.input.keyboard;
    for (const { key, handler } of this._numKeyHandlers) kb.off(`keydown-${key}`, handler);
    this._numKeyHandlers = [];
  }

  _pick(card) {
    if (card.done || this._explaining) return;
    if (card.line === this.correctOrder[this.nextExpect]) {
      card.done = true;
      this.nextExpect++;
      card.bg.setFillStyle(0x14301c).setStrokeStyle(2, 0x2ea043);
      card.num.setText(String(this.nextExpect)).setColor('#3fb950');
      card.txt.setColor('#7ee29a');
      AudioSystem.success();
      if (this.nextExpect >= this.correctOrder.length) {
        this._clearTimer();
        // 点错≤1 次算解出(容错但不放水)
        const ok = this.misses <= 1;
        if (ok) this.solved++;
        const pz = this.puzzles[this.idx];
        Juice.burst(this, 480, 300, 0x3fb950, 16);
        this._showExplain(ok, pz.explain);
      }
    } else {
      this.misses++;
      card.bg.setFillStyle(0x3a1a1a);
      this.time.delayedCall(280, () => { if (!card.done) card.bg.setFillStyle(0x1b2330); });
      Juice.shake(this, 0.008, 160);
      AudioSystem.error();
      this.timeLeft = Math.max(1, this.timeLeft - 6);
      this._updateTimer();
    }
  }

  _timeout() {
    if (this._explaining) return;
    this._clearTimer();
    const pz = this.puzzles[this.idx];
    this._showExplain(false, '⏰ 时间到！\n' + pz.explain);
  }

  // C8 修复：卡片列表最多 6 行(rowH=44+gap8, top=116) → 最后一行底边≈398，
  // icon 固定上锚点 418（与列表留足净空），ex 紧跟 icon 之下，"点击继续"紧跟 ex 之下、
  // clamp ≤510，任意长度解释文案（含"⏰ 时间到！"两行前缀）都不会顶穿 540 底边。
  _showExplain(solved, explain) {
    this._explaining = true;
    this._unbindCardKeys(); // 解释页不再需要选卡片的数字键(P9键盘)
    const iconTopY = 418; // P4防溢出:icon上锚点,exY 依赖它
    const icon = this.add.text(480, iconTopY, solved ? '✓ 流程正确' : '✗ 顺序乱了', {
      fontSize: '18px', color: solved ? '#3fb950' : '#f85149', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this.ui.add(icon);
    Juice.pop(this, icon, 1);
    const exY = iconTopY + icon.height + 12;
    const ex = this.add.text(480, exY, explain, {
      fontSize: '13px', color: '#8b949e', wordWrap: { width: 700, useAdvancedWrap: true }, align: 'center', lineSpacing: 3,
    }).setOrigin(0.5, 0);
    this.ui.add(ex);
    const contY = Math.min(510, exY + ex.height + 30); // P4防溢出:continue clamp到≤510
    this.ui.add(this.add.text(480, contY, '点击继续 · 空格/回车', { fontSize: '12px', color: '#484f58' }).setOrigin(0.5));
    const kb = this.input.keyboard;
    const advance = () => {
      this.input.off('pointerdown', advance);
      kb.off('keydown-SPACE', advance);
      kb.off('keydown-ENTER', advance);
      this._advanceKeyHandler = null;
      this._explaining = false;
      this.idx++;
      if (this.idx < this.puzzles.length) this._showPuzzle();
      else this._finish();
    };
    this._advanceKeyHandler = advance;
    this.time.delayedCall(150, () => {
      this.input.on('pointerdown', advance);
      kb.on('keydown-SPACE', advance);
      kb.on('keydown-ENTER', advance);
    });
  }

  _updateTimer() {
    this.timerText.setText(`⏱ ${this.timeLeft}s`);
    this.timerText.setColor(this.timeLeft <= 10 ? '#f85149' : '#e6e6e6');
  }

  _finish() {
    this._clearUI();
    this._clearTimer();
    const total = this.puzzles ? this.puzzles.length : 0;
    const result = { correct: this.solved, total, ratio: total ? this.solved / total : 0 };
    if (this.onComplete) this.onComplete(result);
  }

  _clearUI() {
    this._unbindCardKeys();
    if (this._advanceKeyHandler) {
      const kb = this.input.keyboard;
      kb.off('keydown-SPACE', this._advanceKeyHandler);
      kb.off('keydown-ENTER', this._advanceKeyHandler);
      this._advanceKeyHandler = null;
    }
    if (this.ui) { this.ui.destroy(true); this.ui = null; }
  }
  _clearTimer() { if (this.timerEvent) { this.timerEvent.remove(); this.timerEvent = null; } }
}
