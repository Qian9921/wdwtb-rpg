import Phaser from 'phaser';
import { Juice } from '../systems/JuiceKit.js';
import { AudioSystem } from '../systems/AudioSystem.js';
import { resolveWorkGameFlavor, pickDebugPool } from '../systems/MinigameFlavor.js';

// DebugGameScene：程序员专属动作小游戏「Debug 找茬」。
// 不再是"读代码选ABC"，而是：给一段真实有 bug 的代码，玩家用鼠标/手指
// 在代码上"点出 bug 所在的那一行"——像 code review 时定位问题。
// 找对 → 该行绿色高亮 + 粒子 + 成功音；找错 → 该行红闪 + 屏震 + 扣时间。
//
// 数据来源 public/data/debug_puzzles.json，按 act 抽对应难度关卡。
// 深色 IDE 风格（复用 MinigameScene 的 960×540 + zoom2 坐标策略，1080 屏原生锐利）。
export class DebugGameScene extends Phaser.Scene {
  constructor() { super('DebugGameScene'); }

  init(data) {
    this.act = data?.act || 1;
    this.difficulty = data?.difficulty || null; // 由工单传入,抽对应难度关卡
    // flavor: 显式传入 > career+subRole 解析（10 职业文案分叉）
    this.chrome = data?.chrome || resolveWorkGameFlavor(data?.career, data?.subRole || data?.flavor);
    if (data?.flavor === 'test' || data?.flavor === 'dev') {
      this.chrome = resolveWorkGameFlavor('programmer', data.flavor);
    }
    this.flavor = this.chrome.key;
    this.onComplete = data?.onComplete || null;
    this.fromScene = data?.fromScene || null;
    this.skillBonus = data?.skillBonus || 0; // 技能→时限加成（秒）
    this.puzzles = null;      // 本局关卡（按难度随机抽,每局不同）
    this.idx = 0;
    this.solved = 0;
    this.combo = 0;           // 连续找对连击
    this.maxCombo = 0;
    this.timeLeft = 40;
    this.answered = false;
    this.timerEvent = null;
    this.ui = null;
    this.rowZones = [];
    this._numKeyHandlers = []; // 当前题目数字键(1-9)绑定，_clearUI/_showExplain 切题时精确解绑
    this._advanceKeyHandler = null; // 解释页空格/回车推进，用完即解绑
  }

  // 洗牌（Fisher-Yates），保证每局关卡随机、不重复
  _shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  create() {
    this.cameras.main.setBackgroundColor('#0d1117');
    this.cameras.main.setZoom(2);
    this.cameras.main.centerOn(480, 270);
    this._buildChrome();
    this._loadPuzzles();
    this.events.once('shutdown', () => this._clearUI()); // 场景切换时解绑键盘，防泄漏
  }

  _buildChrome() {
    this.progressText = this.add.text(30, 18, '', { fontSize: '15px', color: '#8b949e' });
    this.timerText = this.add.text(930, 18, '', { fontSize: '15px', color: '#e6e6e6' }).setOrigin(1, 0);
    if (this.skillBonus > 0) {
      this.add.text(930, 38, `技能加成 +${this.skillBonus}s`, { fontSize: '11px', color: '#3fb950' }).setOrigin(1, 0);
    }
    this.titleText = this.add.text(480, 20, this.chrome.debugTitle, { fontSize: '17px', color: '#58a6ff', fontStyle: 'bold' }).setOrigin(0.5, 0);
  }

  _loadPuzzles() {
    this.loadingText = this.add.text(480, 270, this.chrome.loading || '加载中…', { fontSize: '16px', color: '#8b949e' }).setOrigin(0.5);
    fetch('./data/debug_puzzles.json')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        // 按职业 flavor 取池（产品/行政/…不再全是代码找 bug）
        const all = pickDebugPool(data, this.flavor);
        // 按难度抽关卡(工单难度→关卡难度),随机洗牌,每局不同。数量:简单2/中3/困难3。
        const rounds = { easy: 2, mid: 3, hard: 3 }[this.difficulty] || 3;
        let pool = this.difficulty ? all.filter(p => p.difficulty === this.difficulty) : [];
        if (pool.length < rounds) pool = all.filter(p => Math.abs((p.act || 1) - this.act) <= 1);
        if (pool.length < rounds) pool = all;
        this.puzzles = this._shuffle(pool).slice(0, rounds);
        if (this.loadingText) { this.loadingText.destroy(); this.loadingText = null; }
        this._showPuzzle();
      })
      .catch(err => {
        console.warn('[DebugGame] 关卡加载失败:', err.message);
        this._finish(); // 加载失败直接结束，不卡住玩家
      });
  }

  _showPuzzle() {
    this._clearUI();
    this.ui = this.add.container(0, 0);
    const c = this.ui;
    const pz = this.puzzles[this.idx];
    this.answered = false;
    // 难度决定限时：困难题时间更紧,制造紧迫感（技能加成延长时限）
    this.timeLeft = ({ easy: 40, mid: 32, hard: 26 }[pz.difficulty] || 36) + this.skillBonus;
    this._roundTime = this.timeLeft;
    this.rowZones = [];

    const comboStr = this.combo >= 2 ? `　🔥连击 ${this.combo}` : '';
    this.progressText.setText(`第 ${this.idx + 1}/${this.puzzles.length} 段${comboStr}`);
    this._updateTimer();

    // 关卡标题 + 提示"点出有 bug 的那一行"
    c.add(this.add.text(480, 52, pz.title || '找出 bug', { fontSize: '16px', color: '#c9d1d9' }).setOrigin(0.5, 0));
    c.add(this.add.text(480, 76, this.chrome.debugHint, { fontSize: '13px', color: '#8b949e' }).setOrigin(0.5, 0));

    // 代码区：每行一个可点击行（行号 + 代码），点击定位 bug
    const lines = pz.lines || [];
    const codeTop = 104;
    const rowH = 26;
    const codeLeft = 120, codeW = 720;
    lines.forEach((line, i) => {
      const ry = codeTop + i * rowH;
      // 行背景（可点击）
      const rowBg = this.add.rectangle(480, ry + rowH / 2, codeW, rowH - 2, 0x161b22)
        .setInteractive({ useHandCursor: true });
      // 行号
      const numT = this.add.text(codeLeft, ry + 4, String(i + 1).padStart(2, ' '), {
        fontFamily: 'monospace', fontSize: '14px', color: '#484f58',
      });
      // 代码文字
      const codeT = this.add.text(codeLeft + 40, ry + 4, line || ' ', {
        fontFamily: 'monospace', fontSize: '14px', color: '#c9d1d9',
      });
      rowBg.on('pointerover', () => { if (!this.answered) rowBg.setFillStyle(0x1f2733); });
      rowBg.on('pointerout', () => { if (!this.answered) rowBg.setFillStyle(0x161b22); });
      rowBg.on('pointerdown', () => this._pick(i, rowBg));
      c.add(rowBg); c.add(numT); c.add(codeT);
      this.rowZones.push({ bg: rowBg, index: i, y: ry + rowH / 2 });
    });
    this._bindRowKeys(); // 数字键 1-9 对应逐行，键鼠都可选

    // 计时
    this._clearTimer();
    this.timerEvent = this.time.addEvent({
      delay: 1000, repeat: this.timeLeft - 1,
      callback: () => { this.timeLeft--; this._updateTimer(); if (this.timeLeft <= 0) this._timeout(); },
    });
  }

  _updateTimer() {
    this.timerText.setText(`⏱ ${this.timeLeft}s`);
    this.timerText.setColor(this.timeLeft <= 10 ? '#f85149' : '#e6e6e6');
  }

  // 数字键 1-9 = 选中对应行（键盘可玩，不删鼠标）
  _bindRowKeys() {
    this._unbindRowKeys();
    const kb = this.input.keyboard;
    const NUMS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
    this.rowZones.forEach((wz, i) => {
      if (i >= NUMS.length) return;
      const handler = () => this._pick(wz.index, wz.bg);
      kb.on(`keydown-${NUMS[i]}`, handler);
      this._numKeyHandlers.push({ key: NUMS[i], handler });
    });
  }

  _unbindRowKeys() {
    const kb = this.input.keyboard;
    for (const { key, handler } of this._numKeyHandlers) kb.off(`keydown-${key}`, handler);
    this._numKeyHandlers = [];
  }

  // 点击某一行判定
  _pick(index, rowBg) {
    if (this.answered) return;
    const pz = this.puzzles[this.idx];
    if (index === pz.bugLine) {
      // 找对：绿色高亮 + 粒子 + 成功音
      this.answered = true;
      this._clearTimer();
      rowBg.setFillStyle(0x1a3a1a);
      const wz = this.rowZones[index];
      Juice.burst(this, 480, wz.y, 0x3fb950, 14);
      AudioSystem.success();
      this.solved++;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      if (this.combo >= 2) this._flashHint(`🔥 连击 ${this.combo}！手感火热`);
      this._showExplain(true, pz.explain);
    } else {
      // 找错：红闪 + 屏震 + 扣 8 秒（不结束，继续找）
      rowBg.setFillStyle(0x3a1a1a);
      this.time.delayedCall(300, () => { if (!this.answered) rowBg.setFillStyle(0x161b22); });
      Juice.shake(this, 0.01, 180);
      AudioSystem.error();
      this.combo = 0; // 找错断连击
      this.timeLeft = Math.max(1, this.timeLeft - 8);
      this._updateTimer();
      // 冒一句提示
      this._flashHint(pz.hint || '再看看别的行……');
    }
  }

  _timeout() {
    if (this.answered) return;
    this.answered = true;
    this._clearTimer();
    this.combo = 0; // 超时断连击
    const pz = this.puzzles[this.idx];
    // 超时：高亮正确行，算未解出
    const wz = this.rowZones[pz.bugLine];
    if (wz) wz.bg.setFillStyle(0x3a2a1a);
    this._showExplain(false, '⏰ 时间到！\n' + pz.explain);
  }

  _flashHint(msg) {
    const t = this.add.text(480, 470, msg, {
      fontSize: '13px', color: '#f0c060', backgroundColor: '#00000099', padding: { x: 8, y: 4 },
      wordWrap: { width: 700, useAdvancedWrap: true }, align: 'center',
    }).setOrigin(0.5).setDepth(50);
    this.time.delayedCall(1600, () => t.destroy());
  }

  // 解释页（找对/超时后）
  // C8 修复：原来 icon/ex/cont 全部写死 y（430/462/520），长中文解释（如超时前缀+74字 fetch 说明）
  // 会把"点击继续"顶到 540 底边之外。现改为：icon 固定上锚点(top=418，代码区最多 7 行时
  // 底边≈286，留足净空)，ex 紧跟 icon 之下(origin 0.5,0，用实测 icon.height 定位)，
  // "点击继续"再紧跟 ex 之下(用实测 ex.height 定位)、并 clamp 到 ≤510，任何长度解释文案
  // 都不会把继续按钮推出可视区。
  _showExplain(solved, explain) {
    this._unbindRowKeys(); // 解释页不再需要选行的数字键(P9键盘)
    const iconTopY = 418; // P4防溢出:icon固定上锚点,exY 依赖它
    const icon = this.add.text(480, iconTopY, solved ? this.chrome.solvedLabel : this.chrome.failLabel, {
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
    const cont = this.add.text(480, contY, '点击继续 · 空格/回车', { fontSize: '12px', color: '#484f58' }).setOrigin(0.5);
    this.ui.add(cont);
    // 点击/空格/回车推进（一次性，防泄漏：advance 里先 off）
    const kb = this.input.keyboard;
    const advance = () => {
      this.input.off('pointerdown', advance);
      kb.off('keydown-SPACE', advance);
      kb.off('keydown-ENTER', advance);
      this._advanceKeyHandler = null;
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

  _finish() {
    this._clearUI();
    this._clearTimer();
    const total = this.puzzles ? this.puzzles.length : 0;
    const result = { correct: this.solved, total, ratio: total ? this.solved / total : 0, maxCombo: this.maxCombo };
    if (this.onComplete) this.onComplete(result);
    if (this.fromScene) this.scene.start(this.fromScene);
  }

  _clearUI() {
    this._unbindRowKeys();
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
