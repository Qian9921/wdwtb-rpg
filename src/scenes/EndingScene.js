import Phaser from 'phaser';
import { AIClient } from '../systems/AIClient.js';
import { AudioSystem } from '../systems/AudioSystem.js';

// EndingScene：结局"心之画像"报告 — 游戏高潮收尾，AI(混元hy3)据玩家全程数据生成，模板兜底。
const DEFAULT_PORTRAIT = {
  driveText: '你被一种"要把事做好"的内在标准推着走。不是外界要求，是你自己放不过那行代码。',
  drainText: '反复修改的需求和无休止的沟通，悄悄消耗了你的表达欲——你开始把话吞回去。',
  stressStyle: '你习惯内化压力，表面平静如水，内心却在编译自己。你的身体比你先知道累。',
  hiddenPattern: '你总是在别人开口前先自我怀疑。但那个说"你不行"的声音，其实从来不是你自己的——是环境塞给你的。',
  fitText: '程序员的逻辑思维与你的分析本能高度共振。你擅于在混沌中建立秩序，这是天赋。',
  oneLineForYou: '代码会跑，人也会累——但你不会一直累下去。',
};

const ENDING_NAMES = {
  backbone: '成为团队骨干', quit: '选择裸辞离开', health: '身体发出的警告',
  switch: '转行重新开始', light: '找到你的光',
};

export class EndingScene extends Phaser.Scene {
  constructor() { super('EndingScene'); }

  init(data) {
    this.ending = data?.ending || 'backbone';
    this.career = data?.career || 'programmer';
    this.stats = data?.stats || {
      health: 80, energy: 100, san: 80, stress: 20, skill: 10, performance: 50, money: 0, passion: 70,
    };
    this.choiceLog = data?.choiceLog || null; // 玩家选择日志(若主线记录了)
    this.portrait = data?.portrait || null;
  }

  create() {
    AudioSystem.playBgm('ending'); // 温暖释然的收尾
    this.cameras.main.setBackgroundColor('#15151f');
    this.uiContainer = null;

    if (this.portrait) {
      this._render(this.portrait);
    } else {
      this._renderLoading();
      this._generateWithAI();
    }
  }

  // ===== AI 生成中占位 =====
  _renderLoading() {
    const { width, height } = this.scale;
    this.loadingC = this.add.container(0, 0);
    this.loadingC.add(this.add.text(width / 2, height / 2 - 20, '心之画像', {
      fontSize: '30px', color: '#d4a353', fontStyle: 'bold',
    }).setOrigin(0.5));
    const tip = this.add.text(width / 2, height / 2 + 30,
      'AI 正在读取你这一路的选择，为你生成专属画像…', {
      fontSize: '15px', color: '#8b8ba0',
    }).setOrigin(0.5);
    this.loadingC.add(tip);
    // 呼吸动画
    this.tweens.add({ targets: tip, alpha: 0.4, duration: 900, yoyo: true, repeat: -1 });
  }

  // ===== 调混元生成个性化画像 =====
  async _generateWithAI() {
    const s = this.stats;
    const endingName = ENDING_NAMES[this.ending] || this.ending;
    const sys = '你是一位温柔而敏锐的职业心理咨询师，为一款职场疗愈游戏的玩家撰写《心之画像》报告。'
      + '语气像懂你、心疼你、但相信你的老朋友在深夜跟你说话。走心、克制、有具体感、最终向上托举。'
      + '禁止说教、禁止贴标签、禁止空泛套话。全程只用中文，不夹任何英文单词。每段2-3句，直接称呼"你"。';
    const user = `这位玩家扮演【${this.career === 'programmer' ? '程序员' : this.career}】走完了职场生涯，`
      + `最终结局是「${endingName}」。ta 的最终状态数值（0-100）：`
      + `健康${s.health}、精力${s.energy}、心态${s.san}、压力${s.stress}、技能${s.skill}、绩效${s.performance}、热情${s.passion}。\n`
      + `请基于这些，输出严格的 JSON（不要多余文字，不要markdown代码块），字段如下：\n`
      + `{"driveText":"你的驱动力(是什么在推着ta走)","drainText":"你的消耗源(什么最快掏空ta)",`
      + `"stressStyle":"你与压力的关系(硬扛/逃避/释放型)","hiddenPattern":"你没察觉的模式(从数值反推一个ta自己没意识到的行为模式,这是报告灵魂,要具体戳心)",`
      + `"fitText":"职业契合度(诚实但不劝退)","oneLineForYou":"给你的一句话(基于ta这程的专属鼓励,不是鸡汤)"}`;

    const res = await AIClient.call(
      [{ role: 'system', content: sys }, { role: 'user', content: user }],
      { model: 'hy3', timeoutMs: 15000, fallbackFn: () => ({ text: JSON.stringify(DEFAULT_PORTRAIT) }) }
    );

    let portrait = DEFAULT_PORTRAIT;
    try {
      let t = (res.text || '').trim();
      // 去掉可能的 ```json 包裹
      t = t.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(t);
      // 合并(缺字段用默认补)
      portrait = { ...DEFAULT_PORTRAIT, ...parsed };
      this.aiSource = res.source; // 'ai' or 'fallback'
    } catch (e) {
      portrait = DEFAULT_PORTRAIT;
      this.aiSource = 'fallback';
    }

    if (this.loadingC) { this.loadingC.destroy(true); this.loadingC = null; }
    this._render(portrait);
  }

  // ===== 渲染报告卡片 =====
  _render(p) {
    const { width } = this.scale;
    if (this.uiContainer) this.uiContainer.destroy(true);
    const ui = this.add.container(0, 0);
    this.uiContainer = ui;

    const cardW = 900, cardH = 500;
    const cardX = (width - cardW) / 2, cardY = 20;
    const innerL = cardX + 24;
    const innerW = cardW - 48;

    ui.add(this.add.rectangle(width / 2, cardY + cardH / 2, cardW, cardH, 0x1e1e30));
    ui.add(this.add.rectangle(width / 2, cardY, cardW, 3, 0xd4a353).setOrigin(0.5, 0));

    let y = cardY + 30;
    ui.add(this.add.text(width / 2, y, '你的心之画像', {
      fontSize: '28px', color: '#d4a353', fontStyle: 'bold',
    }).setOrigin(0.5));
    y += 34;
    ui.add(this.add.text(width / 2, y, `结局 · ${ENDING_NAMES[this.ending] || this.ending}`, {
      fontSize: '16px', color: '#8b8ba0',
    }).setOrigin(0.5));
    y += 12;
    // AI 标记(适度显性)
    ui.add(this.add.text(width / 2, y, this.aiSource === 'ai' ? '· 由腾讯混元 hy3 为你生成 ·' : '· 基于你的旅程生成 ·', {
      fontSize: '11px', color: '#5a6a8a',
    }).setOrigin(0.5));
    y += 18;

    y = this._divider(ui, width / 2, y, cardW - 120);
    y = this._section(ui, innerL, y, innerW, '🟡 你的驱动力', p.driveText, '#d4a353');
    y = this._section(ui, innerL, y, innerW, '🔴 你的消耗源', p.drainText, '#e8735a');
    y = this._section(ui, innerL, y, innerW, '💙 你与压力的关系', p.stressStyle, '#7b9cd6');
    ui.add(this.add.rectangle(width / 2, y + 16, innerW + 8, 44, 0x2a2a18, 0.7));
    y = this._section(ui, innerL, y, innerW, '✨ 你没察觉的模式 ✨', p.hiddenPattern, '#f0c060');
    y = this._section(ui, innerL, y, innerW, '🟢 职业契合度', p.fitText, '#6aaa6a');

    y = this._divider(ui, width / 2, y, cardW - 200);
    y = this._statsBar(ui, innerL, y, innerW);
    y = this._divider(ui, width / 2, y + 4, cardW - 120);

    ui.add(this.add.text(width / 2, y, `「 ${p.oneLineForYou} 」`, {
      fontSize: '18px', color: '#f0d080', fontStyle: 'bold',
      wordWrap: { width: innerW - 40, useAdvancedWrap: true }, align: 'center',
    }).setOrigin(0.5));
    y += 34;
    y = this._divider(ui, width / 2, y, cardW - 160);

    const btnY = y + 16;
    this._button(ui, width / 2 - 130, btnY, 200, 36, '再玩一次', 0x2a2a4a, () => this.scene.start('HubScene'));
    this._button(ui, width / 2 + 130, btnY, 200, 36, '保存画像 📷', 0x3a3a2a, () => this._sharePortrait());
  }

  // 保存心之画像：截当前画布为 PNG 下载（玩家可发社交平台，自然传播）
  _sharePortrait() {
    try {
      this.game.renderer.snapshot((img) => {
        const a = document.createElement('a');
        a.href = img.src;
        a.download = `心之画像_${this.ending || 'me'}_${Date.now()}.png`;
        a.click();
        this._toast('已保存！发给朋友，也许 TA 也在找自己。');
      });
    } catch (e) {
      this._toast('保存失败，可直接截屏分享');
    }
  }

  _toast(msg) {
    const { width, height } = this.scale;
    const t = this.add.text(width / 2, height - 40, msg, {
      fontSize: '14px', color: '#ffe08a', backgroundColor: '#1e1e30',
      padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setDepth(99999).setAlpha(0);
    this.tweens.add({
      targets: t, alpha: 1, duration: 250, yoyo: true, hold: 1800,
      onComplete: () => t.destroy(),
    });
  }

  _divider(parent, cx, y, w) {
    parent.add(this.add.rectangle(cx, y + 6, w, 1, 0x2a2a40));
    return y + 14;
  }
  _section(parent, x, y, w, label, text, accent) {
    parent.add(this.add.text(x, y, label, { fontSize: '13px', color: accent, fontStyle: 'bold' }));
    parent.add(this.add.text(x, y + 14, text, { fontSize: '12px', color: '#b8b8c8', wordWrap: { width: w, useAdvancedWrap: true }, lineSpacing: 3 }));
    return y + 40;
  }
  _statsBar(parent, x, y, w) {
    const items = [
      { key: '健康', value: this.stats.health, max: 100 }, { key: '精力', value: this.stats.energy, max: 100 },
      { key: '心态', value: this.stats.san, max: 100 }, { key: '压力', value: this.stats.stress, max: 100 },
      { key: '技能', value: this.stats.skill, max: 100 }, { key: '绩效', value: this.stats.performance, max: 100 },
      { key: '金钱', value: this.stats.money, max: 1000 }, { key: '热情', value: this.stats.passion, max: 100 },
    ];
    const barW = (w - 18) / 4, barH = 6;
    items.forEach((it, i) => {
      const row = Math.floor(i / 4), col = i % 4;
      const bx = x + col * (barW + 6), by = y + row * 26;
      parent.add(this.add.text(bx, by, `${it.key} ${it.value}`, { fontSize: '10px', color: '#8b8ba0' }));
      const fillW = Math.min(barW, (it.value / it.max) * barW);
      const isP = it.key === '热情';
      parent.add(this.add.rectangle(bx + barW / 2, by + 14, barW, barH, 0x2a2a3e).setOrigin(0.5));
      parent.add(this.add.rectangle(bx, by + 14, fillW, barH, isP ? 0xff6b3d : 0x4ec9b0).setOrigin(0, 0.5));
    });
    return y + 52;
  }
  _button(parent, cx, cy, w, h, label, color, cb) {
    const btn = this.add.rectangle(cx, cy, w, h, color).setInteractive({ useHandCursor: true });
    const txt = this.add.text(cx, cy, label, { fontSize: '14px', color: '#e6e6e6' }).setOrigin(0.5);
    btn.on('pointerdown', cb);
    parent.add(btn); parent.add(txt);
  }
}
