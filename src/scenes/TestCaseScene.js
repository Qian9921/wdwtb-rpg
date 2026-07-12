import Phaser from 'phaser';
import { Juice } from '../systems/JuiceKit.js';
import { AudioSystem } from '../systems/AudioSystem.js';

// TestCaseScene：测试工程师专属「写测试用例」小游戏（真实职业模拟）。
// 玩法——给一条需求规格，列出一批候选用例，玩家勾选「必须覆盖」的边界场景后提交。
// 教的是测试思维：想全边界(空值/非法/过期/重复/并发)，别漏也别堆无用例。
// 评分＝正确勾中的 must - 错勾的非 must（precision×recall 味）。
// 数据 public/data/test_case_puzzles.json。清爽用例清单风，960×540（zoom2）。
export class TestCaseScene extends Phaser.Scene {
  constructor() { super('TestCaseScene'); }

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
    this.timeLeft = 45;
    this.answered = false;
    this.timerEvent = null;
    this.ui = null;
    this.selected = new Set();
    this._timeUsed = 0;
    this._numKeyHandlers = []; // 数字键 1-9 = 勾选/取消对应用例
    this._submitKeyHandler = null; // 空格/回车 = 提交
    this._advanceKeyHandler = null; // 解释页空格/回车推进
  }

  _shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  create() {
    this.cameras.main.setBackgroundColor('#0e1a14');
    this.cameras.main.setZoom(2);
    this.cameras.main.centerOn(480, 270);
    this.progressText = this.add.text(30, 18, '', { fontSize: '15px', color: '#8fbfa8' });
    this.timerText = this.add.text(930, 18, '', { fontSize: '15px', color: '#e6e6e6' }).setOrigin(1, 0);
    if (this.skillBonus > 0) this.add.text(930, 38, `技能加成 +${this.skillBonus}s`, { fontSize: '11px', color: '#3fb950' }).setOrigin(1, 0);
    this.add.text(480, 20, '🧪 写测试用例 · Test Design', { fontSize: '17px', color: '#4ec9b0', fontStyle: 'bold' }).setOrigin(0.5, 0);
    this._load();
    this.events.once('shutdown', () => this._clearUI()); // 场景切换时解绑键盘，防泄漏
  }

  _load() {
    const loading = this.add.text(480, 270, '读取需求…', { fontSize: '16px', color: '#8fbfa8' }).setOrigin(0.5);
    fetch('./data/test_case_puzzles.json')
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
      .catch(err => { console.warn('[TestCase] 加载失败:', err.message); this._finish(); });
  }

  _show() {
    this._clearUI();
    this.ui = this.add.container(0, 0);
    const pz = this.puzzles[this.idx];
    this.answered = false;
    this.selected = new Set();
    this.timeLeft = ({ easy: 48, mid: 40, hard: 34 }[pz.difficulty] || 42) + this.skillBonus;
    this.rowZones = [];

    const comboStr = this.combo >= 2 ? `　🔥连击 ${this.combo}` : '';
    this.progressText.setText(`第 ${this.idx + 1}/${this.puzzles.length} 条需求${comboStr}`);
    this._updateTimer();

    // 需求规格框
    this.ui.add(this.add.rectangle(480, 62, 800, 44, 0x14261d).setStrokeStyle(2, 0x2f5a45));
    this.ui.add(this.add.text(480, 62, `需求：${pz.spec || pz.title || ''}`, { fontSize: '14px', color: '#cfe8dc', wordWrap: { width: 760 }, align: 'center' }).setOrigin(0.5));
    this.ui.add(this.add.text(480, 96, '勾选「必须覆盖」的用例（数字键1-9勾选/空格提交，漏测和堆无用例都会扣分）', { fontSize: '13px', color: '#8fbfa8' }).setOrigin(0.5, 0));

    // 候选用例（可勾选）
    const cases = this._shuffle(pz.cases || []);
    this._cases = cases;
    const top = 124, rowH = 34, w = 800;
    const NUMS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
    cases.forEach((cs, i) => {
      const ry = top + i * rowH;
      const bg = this.add.rectangle(480, ry + rowH / 2, w, rowH - 4, 0x13201a).setStrokeStyle(1, 0x2a4636).setInteractive({ useHandCursor: true });
      const box = this.add.rectangle(120, ry + rowH / 2, 18, 18, 0x0e1a14).setStrokeStyle(2, 0x4ec9b0);
      const check = this.add.text(120, ry + rowH / 2, '', { fontSize: '15px', color: '#4ec9b0' }).setOrigin(0.5);
      const numLabel = i < NUMS.length
        ? this.add.text(96, ry + rowH / 2, String(i + 1), { fontSize: '12px', color: '#4a6a5a' }).setOrigin(0.5)
        : null;
      const txt = this.add.text(142, ry + rowH / 2, cs.text || '', { fontSize: '14px', color: '#cfe8dc', wordWrap: { width: 700 } }).setOrigin(0, 0.5);
      const toggle = () => {
        if (this.answered) return;
        if (this.selected.has(i)) { this.selected.delete(i); check.setText(''); box.setFillStyle(0x0e1a14); }
        else { this.selected.add(i); check.setText('✓'); box.setFillStyle(0x1a3a2a); }
        AudioSystem.uiClick && AudioSystem.uiClick();
      };
      bg.on('pointerdown', toggle); box.on('pointerdown', toggle);
      this.ui.add(bg); this.ui.add(box); this.ui.add(check); this.ui.add(txt);
      if (numLabel) this.ui.add(numLabel);
      if (i < NUMS.length) {
        const handler = () => toggle();
        this.input.keyboard.on(`keydown-${NUMS[i]}`, handler);
        this._numKeyHandlers.push({ key: NUMS[i], handler });
      }
    });

    // 提交按钮
    const submit = this.add.rectangle(480, top + cases.length * rowH + 24, 200, 40, 0x1f6f4a).setStrokeStyle(2, 0x3fb98a).setInteractive({ useHandCursor: true });
    const st = this.add.text(480, top + cases.length * rowH + 24, '提交用例 · 空格/回车', { fontSize: '15px', color: '#eafff4', fontStyle: 'bold' }).setOrigin(0.5);
    submit.on('pointerover', () => submit.setFillStyle(0x2a8a5e));
    submit.on('pointerout', () => submit.setFillStyle(0x1f6f4a));
    submit.on('pointerdown', () => this._submit(pz));
    this.ui.add(submit); this.ui.add(st);
    this._bindSubmitKeys(pz);

    this._clearTimer();
    this.timerEvent = this.time.addEvent({ delay: 1000, repeat: this.timeLeft - 1, callback: () => { this.timeLeft--; this._timeUsed++; this._updateTimer(); if (this.timeLeft <= 0) this._submit(pz, true); } });
  }

  _updateTimer() {
    this.timerText.setText(`⏱ ${this.timeLeft}s`);
    this.timerText.setColor(this.timeLeft <= 10 ? '#f85149' : '#e6e6e6');
  }

  // 空格/回车 = 提交
  _bindSubmitKeys(pz) {
    this._unbindSubmitKeys();
    const handler = () => this._submit(pz);
    const kb = this.input.keyboard;
    kb.on('keydown-SPACE', handler);
    kb.on('keydown-ENTER', handler);
    this._submitKeyHandler = handler;
  }

  _unbindSubmitKeys() {
    if (!this._submitKeyHandler) return;
    const kb = this.input.keyboard;
    kb.off('keydown-SPACE', this._submitKeyHandler);
    kb.off('keydown-ENTER', this._submitKeyHandler);
    this._submitKeyHandler = null;
  }

  _unbindNumKeys() {
    const kb = this.input.keyboard;
    for (const { key, handler } of this._numKeyHandlers) kb.off(`keydown-${key}`, handler);
    this._numKeyHandlers = [];
  }

  _submit(pz, timeout = false) {
    if (this.answered) return;
    this.answered = true; this._clearTimer();
    this._unbindNumKeys(); this._unbindSubmitKeys();
    const cases = this._cases || [];
    let must = 0, hitMust = 0, wrong = 0;
    cases.forEach((cs, i) => {
      if (cs.mustCover) { must++; if (this.selected.has(i)) hitMust++; }
      else if (this.selected.has(i)) wrong++;
    });
    // 通过判定：覆盖全部必测 且 误选不超过1
    const passed = !timeout && hitMust === must && wrong <= 1;
    if (passed) {
      this.solved++; this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo);
      AudioSystem.success && AudioSystem.success();
      if (this.combo >= 2) this._flash(`🔥 连击 ${this.combo}！覆盖到位`);
    } else { this.combo = 0; AudioSystem.error && AudioSystem.error(); }
    // 结算解释：漏了哪些必测
    const missed = cases.filter((cs, i) => cs.mustCover && !this.selected.has(i)).map(cs => cs.text);
    let ex = pz.explain || '';
    if (timeout) ex = '⏰ 时间到！\n' + ex;
    if (missed.length) ex += `\n漏测：${missed.join('、')}`;
    this._explain(passed, ex);
  }

  _flash(msg) {
    const t = this.add.text(480, 512, msg, { fontSize: '13px', color: '#4ec9b0', backgroundColor: '#00000099', padding: { x: 8, y: 4 }, wordWrap: { width: 720 }, align: 'center' }).setOrigin(0.5).setDepth(50);
    this.time.delayedCall(1500, () => t.destroy());
  }

  // C8 修复：explain 文案在这里可能拼接"超时前缀 + pz.explain + 漏测清单"三段，最长可达
  // 近百字、换行 3 行（实测 height≈50）。原来"点击继续"写死 y=400，本身有余量，但为防
  // 未来题库/漏测清单变长后仍顶穿底边，统一改为：icon 固定上锚点(y=200)，ex 紧跟其下，
  // "点击继续"紧跟 ex 之下、clamp ≤510，任意长度都安全。
  // 附带修复：原半透明遮罩(0x000000, 0.55)不够暗，题目条数少、解释文案短时，"点击继续"
  // 的计算位置会落在底下"提交用例"按钮原位置上——半透明底色仍让亮色按钮文字透出，与
  // "点击继续"字迹重叠、糊成一团（实测可复现）。改用与场景背景同色(#0e1a14)的**不透明**
  // 遮罩矩形，彻底盖住第一阶段候选清单/按钮，杜绝任何残留像素透出。
  _explain(solved, explain) {
    // 不透明遮罩（场景底色，彻底盖住候选清单与提交按钮）+ 结算
    this.ui.add(this.add.rectangle(480, 270, 960, 540, 0x0e1a14, 1));
    const iconTopY = 200;
    const icon = this.add.text(480, iconTopY, solved ? '✅ 覆盖充分' : '🔍 还有遗漏', { fontSize: '20px', color: solved ? '#4ec9b0' : '#f0883e', fontStyle: 'bold' }).setOrigin(0.5, 0);
    this.ui.add(icon); Juice.pop && Juice.pop(this, icon, 1);
    const exY = iconTopY + icon.height + 14;
    const ex = this.add.text(480, exY, explain || '', { fontSize: '13px', color: '#cfe8dc', wordWrap: { width: 720, useAdvancedWrap: true }, align: 'center', lineSpacing: 4 }).setOrigin(0.5, 0);
    this.ui.add(ex);
    const contY = Math.min(510, exY + ex.height + 30); // P4防溢出:continue clamp到≤510
    const cont = this.add.text(480, contY, '点击继续 · 空格/回车', { fontSize: '12px', color: '#7fae98' }).setOrigin(0.5);
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
    this._unbindSubmitKeys();
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
