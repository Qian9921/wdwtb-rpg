import Phaser from 'phaser';
import { Juice } from '../systems/JuiceKit.js';
import { AudioSystem } from '../systems/AudioSystem.js';

// CodeReviewScene：开发工程师专属「代码评审」小游戏（真实职业模拟）。
// 玩法两步——先在一段 PR diff 里点出「有问题的那一处改动」，再选「问题类型」(空指针/边界/
// 命名/重复/安全)。教的是 review 判断力：不是找 bug 行，而是审"这次改动对不对"。
// 数据 public/data/code_review_puzzles.json。深色 IDE 风，960×540 逻辑坐标（zoom2）。
export class CodeReviewScene extends Phaser.Scene {
  constructor() { super('CodeReviewScene'); }

  init(data) {
    this.act = data?.act || 1;
    this.difficulty = data?.difficulty || null;
    this.onComplete = data?.onComplete || null;
    this.fromScene = data?.fromScene || null;
    this.skillBonus = data?.skillBonus || 0;
    this.puzzles = null;
    this.idx = 0;
    this.solved = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.timeLeft = 40;
    this.answered = false;
    this.stage = 'locate'; // locate → categorize
    this.timerEvent = null;
    this.ui = null;
    this.rowZones = [];
    this._timeUsed = 0;
    this._numKeyHandlers = []; // 当前阶段数字键(1-9)绑定：locate=选行，categorize=选类型
    this._advanceKeyHandler = null; // 解释页空格/回车推进
  }

  _shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  create() {
    this.cameras.main.setBackgroundColor('#0d1117');
    this.cameras.main.setZoom(2);
    this.cameras.main.centerOn(480, 270);
    this.progressText = this.add.text(30, 18, '', { fontSize: '15px', color: '#8b949e' });
    this.timerText = this.add.text(930, 18, '', { fontSize: '15px', color: '#e6e6e6' }).setOrigin(1, 0);
    if (this.skillBonus > 0) this.add.text(930, 38, `技能加成 +${this.skillBonus}s`, { fontSize: '11px', color: '#3fb950' }).setOrigin(1, 0);
    this.add.text(480, 20, '🔍 代码评审 · Code Review', { fontSize: '17px', color: '#58a6ff', fontStyle: 'bold' }).setOrigin(0.5, 0);
    this._load();
    this.events.once('shutdown', () => this._clearUI()); // 场景切换时解绑键盘，防泄漏
  }

  _load() {
    const loading = this.add.text(480, 270, '拉取 PR…', { fontSize: '16px', color: '#8b949e' }).setOrigin(0.5);
    fetch('./data/code_review_puzzles.json')
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(data => {
        const all = Array.isArray(data) ? data : (data.puzzles || []);
        const rounds = { easy: 2, mid: 3, hard: 3 }[this.difficulty] || 3;
        let pool = this.difficulty ? all.filter(p => p.difficulty === this.difficulty) : [];
        if (pool.length < rounds) pool = all.filter(p => Math.abs((p.act || 1) - this.act) <= 1);
        if (pool.length < rounds) pool = all;
        this.puzzles = this._shuffle(pool).slice(0, rounds);
        loading.destroy();
        if (!this.puzzles.length) return this._finish();
        this._show();
      })
      .catch(err => { console.warn('[CodeReview] 加载失败:', err.message); this._finish(); });
  }

  _show() {
    this._clearUI();
    this.ui = this.add.container(0, 0);
    const pz = this.puzzles[this.idx];
    this.answered = false;
    this.stage = 'locate';
    this.timeLeft = ({ easy: 42, mid: 34, hard: 28 }[pz.difficulty] || 36) + this.skillBonus;
    this._roundTime = this.timeLeft;
    this.rowZones = [];

    const comboStr = this.combo >= 2 ? `　🔥连击 ${this.combo}` : '';
    this.progressText.setText(`第 ${this.idx + 1}/${this.puzzles.length} 个 PR${comboStr}`);
    this._updateTimer();

    this.ui.add(this.add.text(480, 50, pz.title || '评审这次改动', { fontSize: '16px', color: '#c9d1d9' }).setOrigin(0.5, 0));
    this.ui.add(this.add.text(480, 74, '这次改动里有一处问题——点出有问题的那一行（数字键1-9可选）', { fontSize: '13px', color: '#8b949e' }).setOrigin(0.5, 0));

    const lines = pz.diff || [];
    const top = 102, rowH = 26, codeW = 760;
    lines.forEach((ln, i) => {
      const ry = top + i * rowH;
      const added = !!ln.added;
      const bg = this.add.rectangle(480, ry + rowH / 2, codeW, rowH - 2, added ? 0x12261a : 0x161b22)
        .setInteractive({ useHandCursor: true });
      const sign = this.add.text(96, ry + 4, added ? '+' : ' ', { fontFamily: 'monospace', fontSize: '14px', color: '#3fb950' });
      const code = this.add.text(120, ry + 4, ln.text || ' ', { fontFamily: 'monospace', fontSize: '14px', color: added ? '#c9d1d9' : '#6e7681' });
      if (i < 9) this.ui.add(this.add.text(76, ry + 4, String(i + 1), { fontFamily: 'monospace', fontSize: '11px', color: '#4a4a5a' }));
      bg.on('pointerover', () => { if (!this.answered && this.stage === 'locate') bg.setFillStyle(0x1f2733); });
      bg.on('pointerout', () => { if (!this.answered && this.stage === 'locate') bg.setFillStyle(added ? 0x12261a : 0x161b22); });
      bg.on('pointerdown', () => this._pickLine(i, bg));
      this.ui.add(bg); this.ui.add(sign); this.ui.add(code);
      this.rowZones.push({ bg, index: i, y: ry + rowH / 2, added });
    });
    this._bindNumKeys(this.rowZones.map((wz) => () => this._pickLine(wz.index, wz.bg))); // 数字键选行

    this._clearTimer();
    this.timerEvent = this.time.addEvent({ delay: 1000, repeat: this.timeLeft - 1, callback: () => { this.timeLeft--; this._timeUsed++; this._updateTimer(); if (this.timeLeft <= 0) this._timeout(); } });
  }

  _updateTimer() {
    this.timerText.setText(`⏱ ${this.timeLeft}s`);
    this.timerText.setColor(this.timeLeft <= 10 ? '#f85149' : '#e6e6e6');
  }

  // 通用数字键(1-9)绑定：传入按显示顺序排列的 handler 数组
  _bindNumKeys(handlers) {
    this._unbindNumKeys();
    const kb = this.input.keyboard;
    const NUMS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
    handlers.forEach((fn, i) => {
      if (i >= NUMS.length) return;
      kb.on(`keydown-${NUMS[i]}`, fn);
      this._numKeyHandlers.push({ key: NUMS[i], handler: fn });
    });
  }

  _unbindNumKeys() {
    const kb = this.input.keyboard;
    for (const { key, handler } of this._numKeyHandlers) kb.off(`keydown-${key}`, handler);
    this._numKeyHandlers = [];
  }

  _pickLine(index, bg) {
    if (this.answered || this.stage !== 'locate') return;
    const pz = this.puzzles[this.idx];
    if (index === pz.badIndex) {
      this._unbindNumKeys(); // 定位阶段的数字键(选行)失效，等分类阶段重绑
      bg.setFillStyle(0x1a3a1a);
      const wz = this.rowZones[index];
      Juice.burst(this, 480, wz.y, 0x3fb950, 12);
      AudioSystem.success && AudioSystem.success();
      this.stage = 'categorize';
      this._askCategory(pz);
    } else {
      bg.setFillStyle(0x3a1a1a);
      this.time.delayedCall(300, () => { if (!this.answered) bg.setFillStyle(this.rowZones[index].added ? 0x12261a : 0x161b22); });
      Juice.shake && Juice.shake(this, 0.01, 160);
      AudioSystem.error && AudioSystem.error();
      this.combo = 0;
      this.timeLeft = Math.max(1, this.timeLeft - 8); this._updateTimer();
      this._flash(pz.hint || '再看看别的改动……');
    }
  }

  _askCategory(pz) {
    // 第二步：这处问题属于哪类？
    const label = this.add.text(480, 372, '这处问题属于哪一类？（数字键选择）', { fontSize: '14px', color: '#f0c060' }).setOrigin(0.5);
    this.ui.add(label);
    const opts = this._shuffle(pz.options || ['空指针', '边界处理', '命名风格', '重复代码', '安全隐患']);
    const bw = 210, gap = 16, perRow = 3;
    const handlers = [];
    opts.slice(0, 6).forEach((opt, i) => {
      const col = i % perRow, row = Math.floor(i / perRow);
      const x = 480 + (col - (perRow - 1) / 2) * (bw + gap);
      const y = 404 + row * 46;
      const btn = this.add.rectangle(x, y, bw, 38, 0x21262d).setStrokeStyle(2, 0x30363d).setInteractive({ useHandCursor: true });
      const t = this.add.text(x, y, `${i + 1}. ${opt}`, { fontSize: '14px', color: '#c9d1d9' }).setOrigin(0.5);
      btn.on('pointerover', () => btn.setFillStyle(0x30363d));
      btn.on('pointerout', () => btn.setFillStyle(0x21262d));
      const pick = () => this._pickCategory(opt === pz.category, pz);
      btn.on('pointerdown', pick);
      handlers.push(pick);
      this.ui.add(btn); this.ui.add(t);
    });
    this._bindNumKeys(handlers); // 分类阶段的数字键
  }

  _pickCategory(correct, pz) {
    if (this.answered) return;
    this.answered = true;
    this._clearTimer();
    this._unbindNumKeys();
    if (correct) {
      this.solved++; this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo);
      AudioSystem.success && AudioSystem.success();
      if (this.combo >= 2) this._flash(`🔥 连击 ${this.combo}！评审老练`);
      this._explain(true, pz.explain);
    } else {
      this.combo = 0;
      AudioSystem.error && AudioSystem.error();
      this._explain(false, '类型判断有偏差。\n' + pz.explain);
    }
  }

  _timeout() {
    if (this.answered) return;
    this.answered = true; this._clearTimer(); this.combo = 0;
    this._unbindNumKeys();
    const pz = this.puzzles[this.idx];
    const wz = this.rowZones[pz.badIndex]; if (wz) wz.bg.setFillStyle(0x3a2a1a);
    this._explain(false, '⏰ 时间到！\n' + pz.explain);
  }

  _flash(msg) {
    const t = this.add.text(480, 500, msg, { fontSize: '13px', color: '#f0c060', backgroundColor: '#00000099', padding: { x: 8, y: 4 }, wordWrap: { width: 720 }, align: 'center' }).setOrigin(0.5).setDepth(50);
    this.time.delayedCall(1500, () => t.destroy());
  }

  // C8 修复（两处）：
  // 1) 原来解释页直接在 diff 行 + "这处问题属于哪一类"分类按钮之上叠加文字，两层内容
  //    互相压字、读不清——现补一层遮罩先盖住第一/二步的残留 UI，再画解释内容，避免叠字。
  //    用与场景背景同色(#0d1117)的**不透明**矩形而非半透明黑：分类按钮底色偏亮、文字
  //    对比度高，半透明遮罩仍会让残留文字透出、和新绘的"点击继续"挤在一起分不清——
  //    不透明遮罩才能让旧内容完全隐没，不留任何可读像素。
  // 2) icon 固定上锚点(y=200，遮罩之上全屏可用，不必再避让 diff/按钮)，ex 紧跟 icon 之下，
  //    "点击继续"紧跟 ex 之下、clamp ≤510，任意长度解释文案都不会顶穿 540 底边。
  _explain(solved, explain) {
    this.ui.add(this.add.rectangle(480, 270, 960, 540, 0x0d1117, 1));
    const iconTopY = 200;
    const icon = this.add.text(480, iconTopY, solved ? '✅ 评审通过' : '📝 还需打磨', { fontSize: '18px', color: solved ? '#3fb950' : '#f0883e', fontStyle: 'bold' }).setOrigin(0.5, 0);
    this.ui.add(icon); Juice.pop && Juice.pop(this, icon, 1);
    const exY = iconTopY + icon.height + 14;
    const ex = this.add.text(480, exY, explain || '', { fontSize: '13px', color: '#8b949e', wordWrap: { width: 720, useAdvancedWrap: true }, align: 'center', lineSpacing: 3 }).setOrigin(0.5, 0);
    this.ui.add(ex);
    const contY = Math.min(510, exY + ex.height + 30); // P4防溢出:continue clamp到≤510
    const cont = this.add.text(480, contY, '点击继续 · 空格/回车', { fontSize: '12px', color: '#484f58' }).setOrigin(0.5);
    this.ui.add(cont);
    const kb = this.input.keyboard;
    const advance = () => {
      this.input.off('pointerdown', advance);
      kb.off('keydown-SPACE', advance);
      kb.off('keydown-ENTER', advance);
      this._advanceKeyHandler = null;
      this.idx++;
      if (this.idx < this.puzzles.length) this._show(); else this._finish();
    };
    this._advanceKeyHandler = advance;
    this.time.delayedCall(150, () => {
      this.input.on('pointerdown', advance);
      kb.on('keydown-SPACE', advance);
      kb.on('keydown-ENTER', advance);
    });
  }

  _finish() {
    this._clearUI(); this._clearTimer();
    const total = this.puzzles ? this.puzzles.length : 0;
    const result = { correct: this.solved, total, ratio: total ? this.solved / total : 0, maxCombo: this.maxCombo, timeUsed: this._timeUsed };
    if (this.onComplete) this.onComplete(result);
    if (this.fromScene) this.scene.start(this.fromScene);
  }

  _clearUI() {
    this._unbindNumKeys();
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
