import Phaser from 'phaser';
import { AudioSystem } from '../systems/AudioSystem.js';
import { Juice } from '../systems/JuiceKit.js';

// DiagnoseScene：医生工作小游戏「看诊选择」——可爱、人人能玩、有医护味,不考专业医学知识。
// 病人来了(可爱头像 + 一句主诉:"我头疼三天了"),给四个处置选项:问诊 / 检查 / 安抚 / 开药。
// 玩家按"合理、有同理心"的顺序处理:先了解、慌的人先安抚、别急着开药。做得贴心,病人"安心值"上升,
// 表情从难受 → 安心 → 治愈爱心光效。像分诊经营游戏,靠常识和同理心,不靠医学知识——迷茫的大学生也能上手。
// 接口与其它工作小游戏一致: init({difficulty, onComplete, skillBonus}) → onComplete({correct,total,ratio,maxCombo})
//
// 设计标准(与敲码节奏范本对齐):
//  1) 人人能玩:核心操作就一个动作——给当下病人选"最贴心的下一步",靠直觉不靠专业知识。
//  2) 可爱:圆角病人头像、粉扑腮红、命中星星迸溅、安心时爱心飘起 + 柔光。
//  3) 有职业味:主诉 + 分诊四选项(问诊/检查/安抚/开药),满满医护看诊的味道。
//  4) 有爽感:贴心判定、连击 Combo、安心值涨条、治愈光效。

// 四个处置动作(数字键 1-4 / 点击)
const ACTIONS = [
  { key: '问诊', emoji: '💬', label: '认真问诊', tone: 0x8ecae6 },
  { key: '检查', emoji: '🔍', label: '仔细检查', tone: 0xa0d8b3 },
  { key: '安抚', emoji: '🤗', label: '温柔安抚', tone: 0xffb3c6 },
  { key: '开药', emoji: '💊', label: '对症处置', tone: 0xffd6a5 },
];

// 病人:主诉 + 肢体语言提示(暗示"当下最该做的一步",靠常识与同理心去读)+ 理想处置顺序。
// 理想顺序体现常识:先了解、慌/怕的人先安抚、开药放最后——完全不需要医学知识。
const PATIENTS = [
  { face: 0.30, complaint: '我头疼三天了…',        cue: '眉头紧锁，很想被认真听听', ideal: ['问诊', '检查', '开药'] },
  { face: 0.18, complaint: '孩子一直发烧，我好慌！', cue: '家长快哭了，先让人安下心', ideal: ['安抚', '问诊', '检查'] },
  { face: 0.35, complaint: '体检报告我看不太懂…',   cue: '有点忐忑，需要有人解释',   ideal: ['安抚', '问诊'] },
  { face: 0.28, complaint: '喉咙痛，说话都费劲',    cue: '想快点弄明白怎么办',       ideal: ['问诊', '检查', '开药'] },
  { face: 0.15, complaint: '打针…会很疼吗？',       cue: '小朋友怕得发抖',           ideal: ['安抚', '问诊'] },
  { face: 0.35, complaint: '我最近总是失眠',        cue: '想找人好好聊聊',           ideal: ['问诊', '安抚'] },
  { face: 0.24, complaint: '不小心崴脚了，肿起来了', cue: '疼得直皱眉，想赶紧处理',   ideal: ['问诊', '检查', '开药'] },
  { face: 0.18, complaint: '手术前…有点紧张',       cue: '手心冒汗，很需要被安心',   ideal: ['安抚', '问诊'] },
  { face: 0.30, complaint: '咳嗽好几天没好',        cue: '想弄清楚到底咋回事',       ideal: ['问诊', '检查', '开药'] },
  { face: 0.40, complaint: '能给我讲讲注意事项吗？', cue: '眼神里都是信任',           ideal: ['问诊', '安抚'] },
];

const START_CALM = 32;   // 病人来时的初始安心值
const CALM_PERFECT = 30; // "贴心"(理想的下一步)安心涨幅
const CALM_GOOD = 22;    // "还行"(需要但不是最急)安心涨幅
const CALM_WASTE = -8;   // "多此一举"(不需要 / 重复)安心回落
const CALM_OK = 75;      // 安心值达标线 → 妥善处理

export class DiagnoseScene extends Phaser.Scene {
  constructor() { super('DiagnoseScene'); }

  init(data) {
    this.difficulty = data?.difficulty || 'mid';
    this.onComplete = data?.onComplete || null;
    this.skillBonus = data?.skillBonus || 0;

    this.N = { easy: 5, mid: 7, hard: 9 }[this.difficulty] || 7; // 要处理的病人数
    this._timeTotal = ({ easy: 75, mid: 70, hard: 65 }[this.difficulty] || 70) * 1000;
    this._timeLeft = this._timeTotal;

    this.correct = 0;   // 妥善处理(安心达标)的病人数
    this.combo = 0;
    this.maxCombo = 0;
    this.pIndex = 0;    // 当前第几位病人
    this._phase = 'load';
    this._locked = true;
    this._timeUp = false;
    this._cur = null;
    this._card = null;

    // 洗牌取 N 位病人
    const pool = Phaser.Utils.Array.Shuffle(PATIENTS.slice());
    this._queue = [];
    for (let i = 0; i < this.N; i++) this._queue.push(pool[i % pool.length]);
  }

  create() {
    const W = 960, H = 540;
    this.cameras.main.setBackgroundColor('#eaf4f4');
    this.cameras.main.setZoom(2);
    this.cameras.main.centerOn(480, 270);

    // 顶部标题条(温柔的诊室蓝绿)
    this.add.rectangle(480, 26, 960, 52, 0xd7ecec, 1).setDepth(30);
    this.add.text(480, 10, '看诊选择 · 分诊小诊室', { fontSize: '17px', color: '#2b6b6b', fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(31);
    this.add.text(480, 33, '读懂病人此刻最需要什么，给出贴心的下一步 · 安心值涨满就妥善送走 TA', { fontSize: '11px', color: '#5a8a8a' }).setOrigin(0.5, 0).setDepth(31);

    // HUD:进度 + 计时条
    this._progText = this.add.text(24, 62, '', { fontSize: '14px', color: '#2b6b6b', fontStyle: 'bold' }).setDepth(31);
    this._timeText = this.add.text(936, 62, '', { fontSize: '14px', color: '#e08a6a', fontStyle: 'bold' }).setOrigin(1, 0).setDepth(31);
    this._timeBar = this.add.graphics().setDepth(31);

    // 大 Combo 弹跳(底部,不挡脸)
    this._comboPop = this.add.text(480, 476, '', { fontSize: '40px', color: '#ff9ac0', fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 5 }).setOrigin(0.5).setDepth(20).setAlpha(0);

    // 四个处置按钮(常驻,病人来去它们不动)
    this._buttons = [];
    const centers = [145, 375, 605, 835];
    ACTIONS.forEach((a, i) => this._buildButton(a, i + 1, centers[i], 452));

    // 输入:数字键 1-4 选处置(键盘 + 鼠标都可)
    this._onKey = (e) => {
      if (this._phase !== 'playing' || this._locked) return;
      const idx = { '1': 0, '2': 1, '3': 2, '4': 3 }[e.key];
      if (idx !== undefined) this._pick(ACTIONS[idx].key);
    };
    this.input.keyboard.on('keydown', this._onKey);

    this.events.once('shutdown', () => this._cleanup());

    // 开局
    this._phase = 'playing';
    this._spawnPatient();
  }

  // —— 常驻处置按钮 ——
  _buildButton(action, num, cx, cy) {
    const w = 210, h = 74;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1); g.fillRoundedRect(-w / 2, -h / 2, w, h, 18);
    g.lineStyle(3, action.tone, 1); g.strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
    // 数字徽章
    g.fillStyle(action.tone, 1); g.fillCircle(-w / 2 + 26, 0, 15);
    const badge = this.add.text(-w / 2 + 26, 0, String(num), { fontSize: '18px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    const emoji = this.add.text(-w / 2 + 62, 0, action.emoji, { fontSize: '24px' }).setOrigin(0.5);
    const label = this.add.text(-w / 2 + 88, 0, action.label, { fontSize: '17px', color: '#2b4a4a', fontStyle: 'bold' }).setOrigin(0, 0.5);
    const cont = this.add.container(cx, cy, [g, badge, emoji, label]).setDepth(10);
    cont.setSize(w, h).setInteractive({ useHandCursor: true });
    cont.on('pointerover', () => { if (!this._locked) this.tweens.add({ targets: cont, scale: 1.06, duration: 120 }); });
    cont.on('pointerout', () => this.tweens.add({ targets: cont, scale: 1, duration: 120 }));
    cont.on('pointerdown', () => { if (this._phase === 'playing' && !this._locked) this._pick(action.key); });
    this._buttons.push(cont);
  }

  // —— 来一位病人 ——
  _spawnPatient() {
    const data = this._queue[this.pIndex];
    this._cur = {
      data,
      done: new Set(),
      picks: 0,
      calm: Phaser.Math.Clamp(START_CALM + Math.min(18, this.skillBonus), 0, 60),
      budget: data.ideal.length + 2, // 宽容额度:允许几次不完美也不会卡住
    };

    // 病人卡片容器(从左侧滑入)
    const card = this.add.container(480 - 620, 0).setDepth(8);

    // 主诉气泡
    const bubbleG = this.add.graphics();
    const cLabel = this.add.text(0, 100, `“${data.complaint}”`, { fontSize: '18px', color: '#33555f', fontStyle: 'bold' }).setOrigin(0.5);
    const bw = cLabel.width + 40, bh = 40;
    bubbleG.fillStyle(0xffffff, 1); bubbleG.fillRoundedRect(-bw / 2, 100 - bh / 2, bw, bh, 14);
    bubbleG.lineStyle(2, 0xbfe3e3, 1); bubbleG.strokeRoundedRect(-bw / 2, 100 - bh / 2, bw, bh, 14);
    bubbleG.fillTriangle(-10, 100 + bh / 2 - 2, 10, 100 + bh / 2 - 2, 0, 100 + bh / 2 + 12);

    // 肢体语言提示(引导常识,不是标准答案)
    const cue = this.add.text(0, 146, `（${data.cue}）`, { fontSize: '13px', color: '#8aa6a6' }).setOrigin(0.5);

    // 可爱头像
    const face = this.add.graphics();

    // 名牌
    const tag = this.add.text(0, 300, ['候诊 · 张阿姨', '候诊 · 小朋友', '候诊 · 李先生', '候诊 · 王同学', '候诊 · 陈奶奶'][this.pIndex % 5], { fontSize: '13px', color: '#5a8a8a' }).setOrigin(0.5);

    // 安心值条
    const calmLabel = this.add.text(0, 320, '安心值', { fontSize: '11px', color: '#7a9a9a' }).setOrigin(0.5);
    const calmBar = this.add.graphics();

    card.add([bubbleG, cLabel, cue, face, tag, calmLabel, calmBar]);
    this._card = card;
    this._cur.face = face;
    this._cur.calmBar = calmBar;

    this._paintFace(face, data.face);
    this._paintCalm(calmBar, this._cur.calm);
    this._updateHud();

    // 滑入 → 解锁可操作
    this._locked = true;
    this.tweens.add({
      targets: card, x: 480, duration: 380, ease: 'Back.out',
      onComplete: () => { if (this._phase === 'playing') this._locked = false; },
    });
    AudioSystem.uiClick && AudioSystem.uiClick();
  }

  // —— 选一个处置 ——
  _pick(key) {
    if (this._phase !== 'playing' || this._locked) return;
    const p = this._cur;
    const nextExpected = p.data.ideal.find(a => !p.done.has(a)); // 当下最该做的一步
    let grade;
    if (p.data.ideal.includes(key) && !p.done.has(key)) {
      grade = key === nextExpected ? 'perfect' : 'good';
      p.done.add(key);
    } else {
      grade = 'waste'; // 不需要 / 已经做过 → 多此一举
    }
    p.picks++;

    const fx = this._card.x, fy = 220;
    if (grade === 'perfect') {
      p.calm = Phaser.Math.Clamp(p.calm + CALM_PERFECT, 0, 100);
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      Juice.celebrate && Juice.celebrate(this, fx, fy, 0xffb3c6);
      this._floatWord('贴心！', '#ff7aa8', fx, fy - 40);
    } else if (grade === 'good') {
      p.calm = Phaser.Math.Clamp(p.calm + CALM_GOOD, 0, 100);
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      AudioSystem.uiClick && AudioSystem.uiClick();
      Juice.burst && Juice.burst(this, fx, fy, 0xa0d8b3, 8);
      this._floatWord('还行～', '#4aa06a', fx, fy - 40);
    } else {
      p.calm = Phaser.Math.Clamp(p.calm + CALM_WASTE, 0, 100);
      this.combo = 0;
      AudioSystem.error && AudioSystem.error();
      Juice.shake && Juice.shake(this, 0.006, 160);
      this._floatWord('多此一举…', '#b98a8a', fx, fy - 40);
    }

    this._paintFace(p.face, p.calm / 100);
    this._paintCalm(p.calmBar, p.calm);
    this._flashCombo();
    this._updateHud();

    const allDone = p.data.ideal.every(a => p.done.has(a));
    if (allDone) this._endPatient(true);
    else if (p.picks >= p.budget) this._endPatient(false);
  }

  // —— 一位病人处理完了 ——
  _endPatient(completed) {
    this._locked = true;
    const p = this._cur;
    const success = completed && p.calm >= CALM_OK;
    const fx = this._card.x, fy = 220;

    if (success) {
      this.correct++;
      this._paintFace(p.face, 1);
      this._paintCalm(p.calmBar, 100);
      // 治愈光效:柔光一闪 + 爱心飘起
      Juice.flash && Juice.flash(this, 0xffd6e6, 140);
      AudioSystem.success && AudioSystem.success();
      for (let i = 0; i < 5; i++) {
        const heart = this.add.text(fx + Phaser.Math.Between(-40, 40), fy + Phaser.Math.Between(-10, 20), '💗', { fontSize: '20px' }).setOrigin(0.5).setDepth(22);
        this.tweens.add({ targets: heart, y: heart.y - 90, alpha: 0, duration: 900, delay: i * 70, ease: 'Sine.out', onComplete: () => heart.destroy() });
      }
      this._floatWord('安心了 ❤', '#ff5c8a', fx, fy - 60);
    } else {
      this._paintFace(p.face, completed ? 0.6 : 0.35);
      this._floatWord(completed ? '尽力了…' : '时间不太够…', '#9aa6a6', fx, fy - 60);
    }

    // 卡片滑出 → 下一位 / 结算
    this.time.delayedCall(success ? 620 : 420, () => {
      this.tweens.add({
        targets: this._card, x: 480 + 640, alpha: 0, duration: 420, ease: 'Back.in',
        onComplete: () => { if (this._card) { this._card.destroy(); this._card = null; } this._advance(); },
      });
    });
  }

  _advance() {
    this.pIndex++;
    if (this.pIndex >= this.N || this._timeUp) this._finish();
    else this._spawnPatient();
  }

  // —— 计时 ——
  update(_t, dms) {
    if (this._phase !== 'playing') return;
    this._timeLeft -= dms;
    if (this._timeLeft <= 0) {
      this._timeLeft = 0;
      this._timeUp = true;
      this._updateHud();
      this._finish();
      return;
    }
    this._updateHud();
  }

  _updateHud() {
    if (this._progText) this._progText.setText(`病人 ${Math.min(this.pIndex + 1, this.N)} / ${this.N}  ·  妥善 ${this.correct}`);
    if (this._timeText) this._timeText.setText(`⏱ ${Math.ceil(this._timeLeft / 1000)}s`);
    if (this._timeBar) {
      const r = Phaser.Math.Clamp(this._timeLeft / this._timeTotal, 0, 1);
      this._timeBar.clear();
      this._timeBar.fillStyle(0xcfe6e6, 1); this._timeBar.fillRect(0, 52, 960, 4);
      this._timeBar.fillStyle(r > 0.3 ? 0x6fc7b3 : 0xe08a6a, 1); this._timeBar.fillRect(0, 52, 960 * r, 4);
    }
  }

  _floatWord(text, color, x, y) {
    const t = this.add.text(x, y, text, { fontSize: '18px', color, fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 4 }).setOrigin(0.5).setDepth(23);
    this.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 620, ease: 'Sine.out', onComplete: () => t.destroy() });
  }

  _flashCombo() {
    if (this.combo >= 2) {
      this._comboPop.setText(`${this.combo} 连击 贴心！`).setAlpha(1).setScale(1.3);
      this.tweens.add({ targets: this._comboPop, scale: 1, duration: 220, ease: 'Back.out' });
    } else {
      this._comboPop.setAlpha(0);
    }
  }

  // —— 画可爱头像:mood 0(难受) → 1(安心) ——
  _paintFace(g, mood) {
    g.clear();
    const cx = 0, cy = 220, R = 46;
    g.fillStyle(0xffe0c4, 1); g.fillCircle(cx, cy, R);
    g.lineStyle(3, 0xe8b48c, 1); g.strokeCircle(cx, cy, R);
    // 腮红(越安心越红扑扑)
    g.fillStyle(0xff9aae, 0.25 + mood * 0.5);
    g.fillCircle(cx - 24, cy + 8, 9); g.fillCircle(cx + 24, cy + 8, 9);
    // 眼睛:安心 → 弯弯笑眼;难受 → 圆圆的
    if (mood > 0.7) {
      g.lineStyle(3, 0x3a2b28, 1);
      g.beginPath(); g.arc(cx - 16, cy - 4, 7, Math.PI * 1.15, Math.PI * 1.85); g.strokePath();
      g.beginPath(); g.arc(cx + 16, cy - 4, 7, Math.PI * 1.15, Math.PI * 1.85); g.strokePath();
    } else {
      g.fillStyle(0x3a2b28, 1);
      g.fillCircle(cx - 16, cy - 4, 5); g.fillCircle(cx + 16, cy - 4, 5);
    }
    // 嘴:难受下弯 → 安心上扬
    const my = cy + 22, mid = my + (mood - 0.5) * 22;
    g.lineStyle(3, 0x9c5a4a, 1);
    g.beginPath(); g.moveTo(cx - 15, my); g.lineTo(cx, mid); g.lineTo(cx + 15, my); g.strokePath();
    // 焦虑时的汗珠
    if (mood < 0.35) { g.fillStyle(0x8ecae6, 0.9); g.fillCircle(cx + R - 6, cy - 12, 5); }
  }

  // —— 画安心值条 ——
  _paintCalm(g, calm) {
    g.clear();
    const bw = 240, bh = 16, x = -bw / 2, y = 332;
    g.fillStyle(0xd4e6e6, 1); g.fillRoundedRect(x, y, bw, bh, 8);
    const col = calm >= CALM_OK ? 0x7bd88f : calm >= 45 ? 0xffcf6a : 0xff9a9a;
    g.fillStyle(col, 1); g.fillRoundedRect(x + 2, y + 2, Math.max(0, (bw - 4) * calm / 100), bh - 4, 6);
  }

  // —— 结算页 ——
  _finish() {
    if (this._phase === 'result') return;
    this._phase = 'result';
    this._locked = true;

    const total = this.N;
    const ratio = total ? this.correct / total : 0;
    this.add.rectangle(480, 270, 960, 540, 0x0f2a2a, 0.82).setDepth(50);

    let msg;
    if (ratio >= 0.9) msg = '医者仁心，每个人都被你妥帖安顿';
    else if (ratio >= 0.6) msg = '有温度的处置，稳稳的';
    else msg = '别急，好医生都是慢慢练出来的';

    this.add.text(480, 176, `妥善处理 ${this.correct} / ${total} 位病人`, { fontSize: '28px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(51);
    this.add.text(480, 222, `最高连击 ${this.maxCombo} 贴心`, { fontSize: '20px', color: '#ffb3c6' }).setOrigin(0.5).setDepth(51);
    this.add.text(480, 262, msg, { fontSize: '17px', color: '#d7ecec' }).setOrigin(0.5).setDepth(51);
    const cont = this.add.text(480, 330, '空格 / 回车 / 点击 继续', { fontSize: '13px', color: '#7ee0d0' }).setOrigin(0.5).setDepth(51);
    this.tweens.add({ targets: cont, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });

    // 换成"继续"监听
    this.input.keyboard.off('keydown', this._onKey);
    const done = () => {
      const result = { correct: this.correct, total, ratio: Math.round(ratio * 100) / 100, maxCombo: this.maxCombo };
      if (this.onComplete) this.onComplete(result);
    };
    this._onCont = (e) => { if (e.key === ' ' || e.key === 'Enter' || e.code === 'Space') done(); };
    this.time.delayedCall(220, () => {
      this.input.keyboard.on('keydown', this._onCont);
      this.input.once('pointerdown', done);
    });
  }

  _cleanup() {
    if (this._onKey) this.input.keyboard.off('keydown', this._onKey);
    if (this._onCont) this.input.keyboard.off('keydown', this._onCont);
  }
}
