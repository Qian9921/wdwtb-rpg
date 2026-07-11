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
    this.ui.add(this.add.text(480, 96, '勾选「必须覆盖」的用例（漏测和堆无用例都会扣分）', { fontSize: '13px', color: '#8fbfa8' }).setOrigin(0.5, 0));

    // 候选用例（可勾选）
    const cases = this._shuffle(pz.cases || []);
    this._cases = cases;
    const top = 124, rowH = 34, w = 800;
    cases.forEach((cs, i) => {
      const ry = top + i * rowH;
      const bg = this.add.rectangle(480, ry + rowH / 2, w, rowH - 4, 0x13201a).setStrokeStyle(1, 0x2a4636).setInteractive({ useHandCursor: true });
      const box = this.add.rectangle(120, ry + rowH / 2, 18, 18, 0x0e1a14).setStrokeStyle(2, 0x4ec9b0);
      const check = this.add.text(120, ry + rowH / 2, '', { fontSize: '15px', color: '#4ec9b0' }).setOrigin(0.5);
      const txt = this.add.text(142, ry + rowH / 2, cs.text || '', { fontSize: '14px', color: '#cfe8dc', wordWrap: { width: 700 } }).setOrigin(0, 0.5);
      const toggle = () => {
        if (this.answered) return;
        if (this.selected.has(i)) { this.selected.delete(i); check.setText(''); box.setFillStyle(0x0e1a14); }
        else { this.selected.add(i); check.setText('✓'); box.setFillStyle(0x1a3a2a); }
        AudioSystem.uiClick && AudioSystem.uiClick();
      };
      bg.on('pointerdown', toggle); box.on('pointerdown', toggle);
      this.ui.add(bg); this.ui.add(box); this.ui.add(check); this.ui.add(txt);
    });

    // 提交按钮
    const submit = this.add.rectangle(480, top + cases.length * rowH + 24, 200, 40, 0x1f6f4a).setStrokeStyle(2, 0x3fb98a).setInteractive({ useHandCursor: true });
    const st = this.add.text(480, top + cases.length * rowH + 24, '提交用例', { fontSize: '15px', color: '#eafff4', fontStyle: 'bold' }).setOrigin(0.5);
    submit.on('pointerover', () => submit.setFillStyle(0x2a8a5e));
    submit.on('pointerout', () => submit.setFillStyle(0x1f6f4a));
    submit.on('pointerdown', () => this._submit(pz));
    this.ui.add(submit); this.ui.add(st);

    this._clearTimer();
    this.timerEvent = this.time.addEvent({ delay: 1000, repeat: this.timeLeft - 1, callback: () => { this.timeLeft--; this._timeUsed++; this._updateTimer(); if (this.timeLeft <= 0) this._submit(pz, true); } });
  }

  _updateTimer() {
    this.timerText.setText(`⏱ ${this.timeLeft}s`);
    this.timerText.setColor(this.timeLeft <= 10 ? '#f85149' : '#e6e6e6');
  }

  _submit(pz, timeout = false) {
    if (this.answered) return;
    this.answered = true; this._clearTimer();
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

  _explain(solved, explain) {
    // 半透明遮罩 + 结算
    this.ui.add(this.add.rectangle(480, 270, 960, 540, 0x000000, 0.55));
    const icon = this.add.text(480, 210, solved ? '✅ 覆盖充分' : '🔍 还有遗漏', { fontSize: '20px', color: solved ? '#4ec9b0' : '#f0883e', fontStyle: 'bold' }).setOrigin(0.5);
    this.ui.add(icon); Juice.pop && Juice.pop(this, icon, 1);
    const ex = this.add.text(480, 248, explain || '', { fontSize: '13px', color: '#cfe8dc', wordWrap: { width: 720 }, align: 'center', lineSpacing: 4 }).setOrigin(0.5, 0);
    this.ui.add(ex);
    const cont = this.add.text(480, 400, '点击继续', { fontSize: '12px', color: '#7fae98' }).setOrigin(0.5);
    this.ui.add(cont);
    const advance = () => { this.input.off('pointerdown', advance); this.idx++; if (this.idx < this.puzzles.length) this._show(); else this._finish(); };
    this.time.delayedCall(150, () => this.input.on('pointerdown', advance));
  }

  _finish() {
    this._clearUI(); this._clearTimer();
    const total = this.puzzles ? this.puzzles.length : 0;
    const result = { correct: this.solved, total, ratio: total ? this.solved / total : 0, maxCombo: this.maxCombo, timeUsed: this._timeUsed };
    if (this.onComplete) this.onComplete(result);
    if (this.fromScene) this.scene.start(this.fromScene);
  }

  _clearUI() { if (this.ui) { this.ui.destroy(true); this.ui = null; } }
  _clearTimer() { if (this.timerEvent) { this.timerEvent.remove(); this.timerEvent = null; } }
}
