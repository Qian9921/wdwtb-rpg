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
    this.cameras.main.fadeIn(600, 0, 0, 0); // 从黑淡入（与 WorldScene 转场淡出衔接）
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
    // 选择轨迹：把 choiceLog 聚合成"行为标签统计 + 最近选择"喂给 AI，
    // 让画像从"8数值反推"升级为"懂你的具体轨迹"（choice_log 选择记忆的价值兑现）。
    const choiceSummary = this._summarizeChoices();
    const user = `这位玩家扮演【${this.career === 'programmer' ? '程序员' : this.career}】走完了职场生涯，`
      + `最终结局是「${endingName}」。ta 的最终状态数值（0-100）：`
      + `健康${s.health}、精力${s.energy}、心态${s.san}、压力${s.stress}、技能${s.skill}、绩效${s.performance}、热情${s.passion}。\n`
      + (choiceSummary ? `ta 一路的选择轨迹：${choiceSummary}\n` : '')
      + `请基于这些${choiceSummary ? '（尤其是选择轨迹，它比数值更能反映 ta 是谁）' : ''}，`
      + `输出严格的 JSON（不要多余文字，不要markdown代码块），字段如下：\n`
      + `{"driveText":"你的驱动力(是什么在推着ta走)","drainText":"你的消耗源(什么最快掏空ta)",`
      + `"stressStyle":"你与压力的关系(硬扛/逃避/释放型)","hiddenPattern":"你没察觉的模式(结合选择轨迹反推一个ta自己没意识到的行为模式,这是报告灵魂,要具体戳心)",`
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

  // 把 choiceLog（序列化的选择数组）聚合成一句人类可读的轨迹描述，喂给 AI。
  // 统计出现≥2次的行为标签（重复的选择最能反映一个人），附带最近几条选择文本。
  _summarizeChoices() {
    const log = this.choiceLog;
    if (!Array.isArray(log) || log.length === 0) return '';
    // 标签计数
    const counts = {};
    for (const e of log) { if (e && e.tag) counts[e.tag] = (counts[e.tag] || 0) + 1; }
    const repeated = Object.entries(counts)
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, n]) => `「${tag}」${n}次`);
    // 最近几条选择文本
    const recent = log.slice(-5).map(e => e && e.choiceLabel).filter(Boolean);
    const parts = [];
    if (repeated.length) parts.push(`反复出现的行为模式：${repeated.join('、')}`);
    if (recent.length) parts.push(`最近的几个选择：${recent.join('；')}`);
    return parts.join('。');
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

    // 卡片底板 + 金线（立即显示，作为揭示的"舞台"）
    ui.add(this.add.rectangle(width / 2, cardY + cardH / 2, cardW, cardH, 0x1e1e30));
    ui.add(this.add.rectangle(width / 2, cardY, cardW, 3, 0xd4a353).setOrigin(0.5, 0));

    // 收集所有可揭示的"段落组"——每组是一组 UI 元素，按顺序淡入上滑。
    // 标题/副标题/AI标记/分隔线也作为揭示组，让整张卡片像礼物一样逐层打开。
    const revealGroups = [];
    const addGroup = () => { const g = []; revealGroups.push(g); return g; };

    let y = cardY + 30;
    const g0 = addGroup();
    g0.push(this.add.text(width / 2, y, '你的心之画像', {
      fontSize: '28px', color: '#d4a353', fontStyle: 'bold',
    }).setOrigin(0.5));
    y += 34;
    g0.push(this.add.text(width / 2, y, `结局 · ${ENDING_NAMES[this.ending] || this.ending}`, {
      fontSize: '16px', color: '#8b8ba0',
    }).setOrigin(0.5));
    y += 12;
    g0.push(this.add.text(width / 2, y, this.aiSource === 'ai' ? '· 由腾讯混元 hy3 为你生成 ·' : '· 基于你的旅程生成 ·', {
      fontSize: '11px', color: '#5a6a8a',
    }).setOrigin(0.5));
    y += 18;

    y = this._divider(ui, width / 2, y, cardW - 120);
    y = this._revealSection(ui, revealGroups, innerL, y, innerW, '🟡 你的驱动力', p.driveText, '#d4a353');
    y = this._revealSection(ui, revealGroups, innerL, y, innerW, '🔴 你的消耗源', p.drainText, '#e8735a');
    y = this._revealSection(ui, revealGroups, innerL, y, innerW, '💙 你与压力的关系', p.stressStyle, '#7b9cd6');
    const hlBg = this.add.rectangle(width / 2, y + 16, innerW + 8, 44, 0x2a2a18, 0.7);
    ui.add(hlBg);
    y = this._revealSection(ui, revealGroups, innerL, y, innerW, '✨ 你没察觉的模式 ✨', p.hiddenPattern, '#f0c060', hlBg);
    y = this._revealSection(ui, revealGroups, innerL, y, innerW, '🟢 职业契合度', p.fitText, '#6aaa6a');

    y = this._divider(ui, width / 2, y, cardW - 200);
    const statsGroup = addGroup();
    y = this._statsBar(ui, innerL, y, innerW, statsGroup);
    y = this._divider(ui, width / 2, y + 4, cardW - 120);

    const oneLineGroup = addGroup();
    oneLineGroup.push(this.add.text(width / 2, y, `「 ${p.oneLineForYou} 」`, {
      fontSize: '18px', color: '#f0d080', fontStyle: 'bold',
      wordWrap: { width: innerW - 40, useAdvancedWrap: true }, align: 'center',
    }).setOrigin(0.5));
    ui.add(oneLineGroup[0]);
    y += 34;
    y = this._divider(ui, width / 2, y, cardW - 160);

    // 把所有组的元素加入容器 + 初始隐藏（准备逐组揭示）
    for (const g of revealGroups) {
      for (const el of g) {
        if (el && !el.parentContainer) ui.add(el);
        if (el && el.setAlpha) el.setAlpha(0);
      }
    }

    // 按钮区：最后揭示（所有段落完成后才出现，让玩家先"读完"再看操作）
    const btnY = y + 16;
    const btnGroup = addGroup();
    const b1 = this._button(ui, width / 2 - 220, btnY, 190, 36, '再玩一次', 0x2a2a4a, () => this.scene.start('HubScene'));
    const b2 = this._button(ui, width / 2, btnY, 190, 36, '保存画像 📷', 0x3a3a2a, () => this._sharePortrait());
    const b3 = this._button(ui, width / 2 + 220, btnY, 190, 36, '返回标题', 0x33283a, () => this.scene.start('TitleScene'));
    // _button 内部已 add 进 ui，这里收集用于揭示
    btnGroup.push(b1.bg, b1.txt, b2.bg, b2.txt, b3.bg, b3.txt);
    for (const el of btnGroup) { if (el && el.setAlpha) el.setAlpha(0); }

    // 逐组揭示：每组延迟 220ms，淡入 + 上滑 8px，配打字机 blip 增加仪式感
    const PER = 220;
    revealGroups.forEach((g, i) => {
      this.time.delayedCall(PER * (i + 1), () => {
        for (const el of g) {
          if (!el) continue;
          if (el.y != null && this.tweens) {
            const oy = el.y;
            el.y = oy + 8;
            this.tweens.add({ targets: el, alpha: 1, y: oy, duration: 400, ease: 'Cubic.out' });
          } else if (el.setAlpha) {
            el.setAlpha(1);
          }
        }
        AudioSystem.blip('');
      });
    });
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
  // 揭示版 _section：元素收集进 revealGroups 而非立即全显示（配合逐段揭示动画）
  _revealSection(parent, revealGroups, x, y, w, label, text, accent, extraEl) {
    const g = []; revealGroups.push(g);
    const labelEl = this.add.text(x, y, label, { fontSize: '13px', color: accent, fontStyle: 'bold' });
    const textEl = this.add.text(x, y + 14, text, { fontSize: '12px', color: '#b8b8c8', wordWrap: { width: w, useAdvancedWrap: true }, lineSpacing: 3 });
    parent.add(labelEl); parent.add(textEl);
    g.push(labelEl, textEl);
    if (extraEl) g.push(extraEl);
    return y + 40;
  }
  _statsBar(parent, x, y, w, group) {
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
      const t = this.add.text(bx, by, `${it.key} ${it.value}`, { fontSize: '10px', color: '#8b8ba0' });
      const fillW = Math.min(barW, (it.value / it.max) * barW);
      const isP = it.key === '热情';
      const bgBar = this.add.rectangle(bx + barW / 2, by + 14, barW, barH, 0x2a2a3e).setOrigin(0.5);
      const fillBar = this.add.rectangle(bx, by + 14, fillW, barH, isP ? 0xff6b3d : 0x4ec9b0).setOrigin(0, 0.5);
      parent.add(t); parent.add(bgBar); parent.add(fillBar);
      if (group) group.push(t, bgBar, fillBar);
    });
    return y + 52;
  }
  _button(parent, cx, cy, w, h, label, color, cb) {
    const btn = this.add.rectangle(cx, cy, w, h, color).setInteractive({ useHandCursor: true });
    const txt = this.add.text(cx, cy, label, { fontSize: '14px', color: '#e6e6e6' }).setOrigin(0.5);
    btn.on('pointerdown', cb);
    parent.add(btn); parent.add(txt);
    return { bg: btn, txt };
  }
}
