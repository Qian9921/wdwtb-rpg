import Phaser from 'phaser';
import { AudioSystem } from '../systems/AudioSystem.js';
import { Juice } from '../systems/JuiceKit.js';

// SalesTalkScene：销售工作小游戏「对话应对」——可爱、人人能玩、有销售味,不考专业知识。
// 客户抛来一句话(气泡:"太贵了"/"再考虑考虑"/"别家更便宜"),给 3 个可爱的应对选项
// (共情💗 / 让利💰 / 强推🔥),玩家凭情商直觉快选一个,不同应对改变「客户好感条」(一排爱心)。
// 在限定回合内把好感填满 = 成交(彩带庆祝)。像轻松的对话经营游戏,靠读人心不靠话术知识。
// 接口与其它工作小游戏一致: init({difficulty, onComplete, skillBonus}) → onComplete({correct,total,ratio,maxCombo})
//
// 设计标准(照 TypingRhythmScene 范本):
//  1) 人人能玩:一个操作——按【1/2/3】或点卡片选应对,靠情绪直觉不靠专业知识。
//  2) 可爱:客户圆脸表情随好感变(委屈→开心→超开心)、爱心好感条、成交彩带。
//  3) 有销售味:客户异议("太贵了""再考虑考虑""别家更便宜")+ 三种应对风格,一看就懂销售日常。
//  4) 有爽感:连击 Combo、好感爱心迸溅、命中庆祝特效、提前填满即成交。
export class SalesTalkScene extends Phaser.Scene {
  constructor() { super('SalesTalkScene'); }

  init(data) {
    this.difficulty = data?.difficulty || 'mid';
    this.onComplete = data?.onComplete || null;
    this.skillBonus = data?.skillBonus || 0;

    // 应对风格元数据:名字 / 可爱图标 / 主题色
    this._TYPES = {
      empathy: { name: '共情', icon: '💗', color: 0xff8fb3 },
      deal:    { name: '让利', icon: '💰', color: 0xf5b942 },
      push:    { name: '强推', icon: '🔥', color: 0xff6f5e },
    };

    // 客户异议库。每条客户一句话 + 3 种应对(q=好/一般/糟)。
    // 直觉规律(不靠知识):读客户情绪配应对——嫌贵→让利、犹豫/怀疑→共情、已心动→强推收尾。
    this._pool = [
      { line: '这个也太贵了吧，超预算了…', responses: [
        { type: 'deal',    text: '这样，我给您申请个新人专属价 😊', q: 'good' },
        { type: 'empathy', text: '理解的，好东西确实要多花点心思', q: 'ok' },
        { type: 'push',    text: '贵有贵的道理，闭眼买就对了！', q: 'bad' },
      ] },
      { line: '我还是回去再考虑考虑吧~', responses: [
        { type: 'empathy', text: '当然，重要的决定是该多想想的', q: 'good' },
        { type: 'deal',    text: '现在定的话还能送个小礼物哦', q: 'ok' },
        { type: 'push',    text: '考虑啥呀，就今天最划算了！', q: 'bad' },
      ] },
      { line: '别家好像比你们更便宜诶。', responses: [
        { type: 'empathy', text: '能理解您比价，谁的钱都来之不易', q: 'good' },
        { type: 'deal',    text: '我帮您对一下，差的部分补给您', q: 'ok' },
        { type: 'push',    text: '别家那能一样？一分钱一分货！', q: 'bad' },
      ] },
      { line: '这个…真的适合我吗，好纠结。', responses: [
        { type: 'empathy', text: '您把平时的需求跟我说说，我帮您看', q: 'good' },
        { type: 'deal',    text: '不合适七天无理由退，您放心', q: 'ok' },
        { type: 'push',    text: '绝对适合！我看人可准了', q: 'bad' },
      ] },
      { line: '我其实挺喜欢的，就是有点犹豫~', responses: [
        { type: 'push',    text: '喜欢就别犹豫，我这就帮您包起来 🎁', q: 'good' },
        { type: 'deal',    text: '那再给您叠个小优惠券要不要？', q: 'ok' },
        { type: 'empathy', text: '不急，您可以再逛逛别家看看', q: 'bad' },
      ] },
      { line: '预算就这么多，真不能再加了。', responses: [
        { type: 'deal',    text: '没问题，这个价位我给您配到最好', q: 'good' },
        { type: 'empathy', text: '能理解，咱就按您的预算来 😊', q: 'ok' },
        { type: 'push',    text: '再加一点点就能上更好的，冲！', q: 'bad' },
      ] },
      { line: '你们的售后靠不靠谱啊？', responses: [
        { type: 'empathy', text: '这点您放心，有我在，随时来找我', q: 'good' },
        { type: 'deal',    text: '再送您延长保修一年，安心', q: 'ok' },
        { type: 'push',    text: '我们这么大牌子，能不靠谱？', q: 'bad' },
      ] },
      { line: '我得跟家里人先商量商量…', responses: [
        { type: 'empathy', text: '应该的，家人的意见很重要呀~', q: 'good' },
        { type: 'deal',    text: '今天的名额我帮您先留着好吗？', q: 'ok' },
        { type: 'push',    text: '这种小事您自己定就行啦！', q: 'bad' },
      ] },
      { line: '我就随便看看，不一定买哈。', responses: [
        { type: 'empathy', text: '没事儿随便看，我在旁边您喊我~', q: 'good' },
        { type: 'deal',    text: '看中哪个跟我说，给您优惠~', q: 'ok' },
        { type: 'push',    text: '来都来了，买一个再走呗！', q: 'bad' },
      ] },
    ];

    // 难度:回合数、起始好感、好感增减幅度
    const D = {
      easy: { rounds: 5, start: 42, good: 22, ok: 9, bad: -8 },
      mid:  { rounds: 6, start: 32, good: 20, ok: 8, bad: -12 },
      hard: { rounds: 7, start: 24, good: 18, ok: 7, bad: -16 },
    }[this.difficulty] || { rounds: 6, start: 32, good: 20, ok: 8, bad: -12 };
    this._targetRounds = D.rounds;
    this._delta = { good: D.good, ok: D.ok, bad: D.bad };
    // 技能加成:给一点起手好感(轻微,封顶)
    this._fav = Phaser.Math.Clamp(D.start + Math.round((this.skillBonus || 0) * 6), 0, 96);

    this.correct = 0;      // 应对到位次数(good)
    this.combo = 0;
    this.maxCombo = 0;
    this._round = 0;       // 已开始的回合数
    this._cards = [];      // 当前 3 张应对卡
    this._hearts = [];     // 好感爱心图标
    this._locked = false;  // 结算动画期间锁输入
    this._done = false;
    // 打乱异议顺序,一局不重复
    this._queue = Phaser.Utils.Array.Shuffle(this._pool.slice());
  }

  create() {
    const W = 960, H = 540;
    this.cameras.main.setBackgroundColor('#ffe9d6'); // 暖橙色柔和店面感
    this.cameras.main.setZoom(2);
    this.cameras.main.centerOn(480, 270);

    // 顶部标题条
    this.add.rectangle(480, 26, 960, 52, 0xffffff, 0.55).setDepth(30);
    this.add.text(480, 10, '对话应对 · 门店销售', { fontSize: '17px', color: '#b5533a', fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(31);
    this.add.text(480, 33, '读懂客户情绪，按【1 / 2 / 3】或点卡片选应对 · 把好感填满就成交', { fontSize: '11px', color: '#a9755f' }).setOrigin(0.5, 0).setDepth(31);

    // 回合指示
    this._roundText = this.add.text(30, 14, '', { fontSize: '13px', color: '#b5533a', fontStyle: 'bold' }).setDepth(31);

    // 客户头像(可爱圆脸,表情随好感变)
    this._avatar = this.add.container(232, 210).setDepth(10);
    this._faceG = this.add.graphics();
    this._avatar.add(this._faceG);
    this._drawFace(this._moodLevel());
    // 轻轻上下浮动,活泼
    this.tweens.add({ targets: this._avatar, y: 218, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // 客户对话气泡
    this._bubbleG = this.add.graphics().setDepth(9);
    this._bubbleText = this.add.text(560, 190, '', {
      fontSize: '17px', color: '#5b3a2e', fontStyle: 'bold',
      align: 'left', wordWrap: { width: 300 },
    }).setOrigin(0, 0.5).setDepth(11);

    // 好感条:一排爱心 + 标签
    this.add.text(480, 78, '客户好感', { fontSize: '13px', color: '#b5533a', fontStyle: 'bold' }).setOrigin(0.5).setDepth(11);
    const heartN = 10, hx0 = 480 - (heartN - 1) * 26 / 2;
    for (let i = 0; i < heartN; i++) {
      const h = this.add.text(hx0 + i * 26, 102, '♥', { fontSize: '22px', color: '#ffffff' }).setOrigin(0.5).setDepth(11);
      h.setAlpha(0.35);
      this._hearts.push(h);
    }
    this._favText = this.add.text(760, 102, '', { fontSize: '14px', color: '#ff5c7a', fontStyle: 'bold' }).setOrigin(0.5).setDepth(11);
    this._syncHearts();

    // Combo 大字
    this._comboText = this.add.text(480, 300, '', { fontSize: '40px', color: '#ff6f8f', fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 5 }).setOrigin(0.5).setDepth(25).setAlpha(0);

    // 键盘:1 / 2 / 3 选应对
    const kb = this.input.keyboard;
    this._onKey1 = () => this._choose(0);
    this._onKey2 = () => this._choose(1);
    this._onKey3 = () => this._choose(2);
    kb.on('keydown-ONE', this._onKey1);
    kb.on('keydown-TWO', this._onKey2);
    kb.on('keydown-THREE', this._onKey3);

    this.events.once('shutdown', () => this._cleanup());
    this._nextRound();
  }

  // 好感 → 心情等级 0..3(委屈/平静/开心/超开心)
  _moodLevel() {
    if (this._fav >= 78) return 3;
    if (this._fav >= 52) return 2;
    if (this._fav >= 28) return 1;
    return 0;
  }

  // 画客户圆脸(本地坐标以 0,0 为中心),表情随 level 变
  _drawFace(level) {
    const g = this._faceG; g.clear();
    const R = 62;
    // 脸
    g.fillStyle(0xffe0bd, 1); g.fillCircle(0, 0, R);
    g.lineStyle(3, 0xffffff, 0.9); g.strokeCircle(0, 0, R);
    // 腮红
    g.fillStyle(0xffa9b8, level >= 2 ? 0.75 : 0.5);
    g.fillEllipse(-30, 16, 22, 14); g.fillEllipse(30, 16, 22, 14);
    // 眼睛
    g.fillStyle(0x5a3d30, 1);
    if (level >= 3) { // 超开心:弯弯笑眼
      g.lineStyle(4, 0x5a3d30, 1);
      this._arc(g, -22, -8, 11, 0.15, 0.85);
      this._arc(g, 22, -8, 11, 0.15, 0.85);
      // 眼里的星光
      g.fillStyle(0xffffff, 0.9); g.fillCircle(-19, -12, 2.5); g.fillCircle(25, -12, 2.5);
    } else if (level === 0) { // 委屈:小垂眼
      g.fillCircle(-22, -4, 6); g.fillCircle(22, -4, 6);
    } else {
      g.fillCircle(-22, -8, 7); g.fillCircle(22, -8, 7);
      g.fillStyle(0xffffff, 0.85); g.fillCircle(-24, -10, 2.4); g.fillCircle(20, -10, 2.4);
    }
    // 嘴:曲率随 level(负=瘪嘴,0=平,正=笑)
    const c = [-9, 0, 11, 16][level];
    g.lineStyle(4, 0xc85a4a, 1);
    g.strokePoints(this._mouthPoints(0, 26, 22, c, 14), false, false);
    if (level >= 3) { // 张嘴笑,加个小舌头
      g.fillStyle(0xff8f8f, 0.9); g.fillCircle(0, 34, 6);
    }
  }

  // 弧线笑眼(用短折线近似)
  _arc(g, cx, cy, r, t0, t1) {
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI * (t0 + (t1 - t0) * i / 8);
      pts.push({ x: cx + Math.cos(a) * r, y: cy - Math.sin(a) * r + 4 });
    }
    g.strokePoints(pts, false, false);
  }

  // 嘴巴曲线点:c>0 微笑(∪),c<0 瘪嘴(∩)
  _mouthPoints(cx, cy, hw, c, steps) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = -1 + 2 * i / steps;      // -1..1
      pts.push({ x: cx + t * hw, y: cy + c * (1 - t * t) });
    }
    return pts;
  }

  // 画对话气泡(带指向头像的小尾巴)
  _drawBubble(w, h) {
    const g = this._bubbleG; g.clear();
    const x = 344, y = 190 - h / 2;
    g.fillStyle(0xffffff, 0.96); g.lineStyle(3, 0xffd0b8, 1);
    g.fillRoundedRect(x, y, w, h, 18); g.strokeRoundedRect(x, y, w, h, 18);
    // 尾巴(指向左边头像)
    g.fillTriangle(x + 4, 190 - 8, x + 4, 190 + 8, x - 14, 190);
  }

  _nextRound() {
    if (this._done) return;
    this._round++;
    this._locked = false;
    this._roundText.setText(`第 ${this._round} / ${this._targetRounds} 位客户`);

    // 取一条异议,打乱选项顺序(好答案不总在 1 号位)
    this._current = this._queue[(this._round - 1) % this._queue.length];
    const responses = Phaser.Utils.Array.Shuffle(this._current.responses.slice());
    this._current = { line: this._current.line, responses };

    // 气泡
    this._bubbleText.setText(this._current.line);
    const bw = Math.min(320, this._bubbleText.width + 32), bh = this._bubbleText.height + 26;
    this._drawBubble(bw, bh);
    this._bubbleText.setAlpha(0);
    this.tweens.add({ targets: this._bubbleText, alpha: 1, duration: 200 });

    // 三张应对卡
    this._clearCards();
    const xs = [170, 480, 790];
    responses.forEach((resp, i) => {
      const card = this._buildCard(xs[i], 428, i, resp);
      card.setAlpha(0).setScale(0.9);
      this.tweens.add({ targets: card, alpha: 1, scale: 1, duration: 220, delay: 60 * i, ease: 'Back.out' });
      this._cards.push(card);
    });
  }

  _buildCard(x, y, index, resp) {
    const meta = this._TYPES[resp.type];
    const W = 282, H = 128;
    const cont = this.add.container(x, y).setDepth(14);
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1); g.fillRoundedRect(-W / 2, -H / 2, W, H, 18);
    g.lineStyle(3, meta.color, 1); g.strokeRoundedRect(-W / 2, -H / 2, W, H, 18);
    // 顶部风格色条
    g.fillStyle(meta.color, 0.16); g.fillRoundedRect(-W / 2, -H / 2, W, 34, { tl: 18, tr: 18, bl: 0, br: 0 });
    cont.add(g);
    // 序号徽章
    const badge = this.add.container(-W / 2 + 22, -H / 2 + 17);
    const bg2 = this.add.graphics(); bg2.fillStyle(meta.color, 1); bg2.fillCircle(0, 0, 13);
    badge.add(bg2);
    badge.add(this.add.text(0, 0, `${index + 1}`, { fontSize: '15px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5));
    cont.add(badge);
    // 风格标签
    cont.add(this.add.text(-W / 2 + 44, -H / 2 + 17, `${meta.icon} ${meta.name}`, {
      fontSize: '14px', color: '#7a4a3a', fontStyle: 'bold',
    }).setOrigin(0, 0.5));
    // 应对台词
    cont.add(this.add.text(0, 14, resp.text, {
      fontSize: '14px', color: '#5b3a2e', align: 'center', wordWrap: { width: W - 34 }, lineSpacing: 3,
    }).setOrigin(0.5));
    // 交互热区(键鼠皆可)
    const hit = this.add.rectangle(0, 0, W, H, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => { if (!this._locked) this.tweens.add({ targets: cont, scale: 1.05, duration: 120 }); });
    hit.on('pointerout', () => { if (!this._locked) this.tweens.add({ targets: cont, scale: 1, duration: 120 }); });
    hit.on('pointerdown', () => this._choose(index));
    cont.add(hit);
    cont._meta = meta;
    return cont;
  }

  _clearCards() {
    this._cards.forEach(c => c.destroy());
    this._cards = [];
  }

  // 玩家选了第 index 个应对
  _choose(index) {
    if (this._locked || this._done) return;
    const resp = this._current.responses[index];
    if (!resp) return;
    this._locked = true;

    const q = resp.q;
    const delta = this._delta[q];
    const prevFilled = Math.round(this._fav / 10);
    this._fav = Phaser.Math.Clamp(this._fav + delta, 0, 100);
    const nowFilled = Math.round(this._fav / 10);

    // 高亮被选中的卡,其它淡出
    const chosen = this._cards[index];
    this._cards.forEach((c, i) => {
      if (i === index) this.tweens.add({ targets: c, scale: 1.08, duration: 150, yoyo: true });
      else this.tweens.add({ targets: c, alpha: 0.35, duration: 150 });
    });

    // 好感与心情
    this._syncHearts(prevFilled, nowFilled);
    this._favText.setText(`${this._fav}%`);
    this._drawFace(this._moodLevel());

    // Combo / correct
    if (q === 'good') {
      this.correct++;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
    } else {
      this.combo = 0;
    }

    // 反馈:飘字 + 特效 + 音
    const cx = chosen ? chosen.x : 480;
    const fbColor = q === 'good' ? '#2fae6b' : q === 'ok' ? '#c98a3a' : '#e0574f';
    const sign = delta >= 0 ? `+${delta}` : `${delta}`;
    const face = q === 'good' ? '💗' : q === 'ok' ? '🙂' : '💧';
    const fb = this.add.text(cx, 360, `${sign} ${face}`, { fontSize: '22px', color: fbColor, fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 4 }).setOrigin(0.5).setDepth(26);
    this.tweens.add({ targets: fb, y: fb.y - 46, alpha: 0, duration: 700, ease: 'Cubic.out', onComplete: () => fb.destroy() });

    if (q === 'good') {
      Juice.celebrate && Juice.celebrate(this, this._avatar.x, 150, 0xff8fb3);
      this._flashCombo();
    } else if (q === 'ok') {
      AudioSystem.uiClick && AudioSystem.uiClick();
    } else {
      AudioSystem.error && AudioSystem.error();
      this._flashCombo();
    }

    // 结算或下一位
    this.time.delayedCall(880, () => {
      if (this._fav >= 100) { this._finish(true); }
      else if (this._round >= this._targetRounds) { this._finish(false); }
      else { this._nextRound(); }
    });
  }

  // 同步爱心显示;prevFilled→nowFilled 之间的新爱心弹一下
  _syncHearts(prevFilled = -1, nowFilled = -1) {
    const filled = Math.round(this._fav / 10);
    this._hearts.forEach((h, i) => {
      if (i < filled) { h.setColor('#ff5c7a').setAlpha(1); }
      else { h.setColor('#ffffff').setAlpha(0.35); }
    });
    if (nowFilled > prevFilled && prevFilled >= 0) {
      for (let i = prevFilled; i < nowFilled && i < this._hearts.length; i++) {
        const h = this._hearts[i];
        h.setScale(1.6);
        this.tweens.add({ targets: h, scale: 1, duration: 260, ease: 'Back.out' });
      }
    }
  }

  _flashCombo() {
    if (this.combo >= 2) {
      this._comboText.setText(`${this.combo} 连击!`).setAlpha(1).setScale(1.3);
      this.tweens.add({ targets: this._comboText, scale: 1, duration: 220, ease: 'Back.out' });
      this.time.delayedCall(700, () => this.tweens.add({ targets: this._comboText, alpha: 0, duration: 300 }));
    } else {
      this._comboText.setAlpha(0);
    }
  }

  _finish(closed) {
    if (this._done) return;
    this._done = true;
    this._locked = true;
    this._clearCards();
    this._bubbleText.setAlpha(0);
    this._bubbleG.clear();
    this._comboText.setAlpha(0);

    const total = this._round;
    const ratio = total ? this.correct / total : 0;

    if (closed) {
      this._drawFace(3);
      this._confetti();
      Juice.celebrate && Juice.celebrate(this, 480, 200, 0xff8fb3);
      AudioSystem.questDone && AudioSystem.questDone();
      Juice.flash && Juice.flash(this, 0xffe9d6, 160);
    }

    // 结算面板
    const mask = this.add.rectangle(480, 270, 960, 540, 0x3a2a26, 0.62).setDepth(50);
    const panel = this.add.graphics().setDepth(51);
    panel.fillStyle(0xfff6ee, 1); panel.lineStyle(4, 0xffc9a8, 1);
    panel.fillRoundedRect(210, 150, 540, 260, 26); panel.strokeRoundedRect(210, 150, 540, 260, 26);

    const title = closed ? '成交啦！🎉' : '本轮结束';
    this.add.text(480, 190, title, { fontSize: '30px', color: closed ? '#e0567a' : '#b5533a', fontStyle: 'bold' }).setOrigin(0.5).setDepth(52);
    this.add.text(480, 232, `客户好感 ${this._fav}%   ·   应对到位 ${this.correct}/${total}`, { fontSize: '17px', color: '#6b4636' }).setOrigin(0.5).setDepth(52);
    this.add.text(480, 262, `最高连击 ${this.maxCombo} 连击`, { fontSize: '16px', color: '#e08a4a', fontStyle: 'bold' }).setOrigin(0.5).setDepth(52);

    let msg;
    if (closed) msg = '你天生会读人心，成交如喝水 💗';
    else if (this._fav >= 70) msg = '就差临门一脚！好感很高了，收尾再练练';
    else if (this._fav >= 40) msg = '客户没走，你的真诚被感觉到了';
    else msg = '别灰心，读懂情绪是慢慢练出来的~';
    this.add.text(480, 300, msg, { fontSize: '16px', color: '#8a5a44', align: 'center', wordWrap: { width: 480 } }).setOrigin(0.5).setDepth(52);

    const cont = this.add.text(480, 358, '空格 / 回车 / 点击 继续', { fontSize: '14px', color: '#e0567a', fontStyle: 'bold' }).setOrigin(0.5).setDepth(52);
    this.tweens.add({ targets: cont, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });

    // 换绑输入:清掉选项键,改成继续
    const kb = this.input.keyboard;
    kb.off('keydown-ONE', this._onKey1);
    kb.off('keydown-TWO', this._onKey2);
    kb.off('keydown-THREE', this._onKey3);
    const done = () => {
      const result = { correct: this.correct, total, ratio: Math.round(ratio * 100) / 100, maxCombo: this.maxCombo };
      if (this.onComplete) this.onComplete(result);
    };
    this.time.delayedCall(250, () => {
      this._doneHandler = done;
      kb.on('keydown-SPACE', done);
      kb.on('keydown-ENTER', done);
      this.input.on('pointerdown', done);
    });
  }

  // 成交彩带:一堆彩色小方片从顶部飘落旋转
  _confetti() {
    const colors = [0xff8fb3, 0xf5b942, 0xff6f5e, 0x8fd6a0, 0x9ab7ff, 0xffffff];
    for (let i = 0; i < 28; i++) {
      const x = Phaser.Math.Between(140, 820);
      const c = colors[i % colors.length];
      const p = this.add.rectangle(x, Phaser.Math.Between(-40, 60), Phaser.Math.Between(7, 13), Phaser.Math.Between(9, 16), c).setDepth(55).setAngle(Phaser.Math.Between(0, 360));
      this.tweens.add({
        targets: p,
        y: 560,
        x: x + Phaser.Math.Between(-60, 60),
        angle: p.angle + Phaser.Math.Between(180, 540),
        duration: Phaser.Math.Between(1200, 2200),
        delay: Phaser.Math.Between(0, 500),
        ease: 'Cubic.in',
        onComplete: () => p.destroy(),
      });
    }
  }

  _cleanup() {
    const kb = this.input.keyboard;
    if (!kb) return;
    if (this._onKey1) { kb.off('keydown-ONE', this._onKey1); kb.off('keydown-TWO', this._onKey2); kb.off('keydown-THREE', this._onKey3); }
    if (this._doneHandler) { kb.off('keydown-SPACE', this._doneHandler); kb.off('keydown-ENTER', this._doneHandler); this.input.off('pointerdown', this._doneHandler); }
  }
}
