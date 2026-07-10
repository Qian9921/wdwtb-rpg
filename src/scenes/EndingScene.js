import Phaser from 'phaser';
import { AIClient } from '../systems/AIClient.js';
import { AudioSystem } from '../systems/AudioSystem.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import {
  buildEndingReportContext,
  buildReportHistoryEntry,
  mergeReportHistory,
  CAREER_NAMES,
  LAST_REPORT_KEY,
  REPORT_HISTORY_KEY,
} from '../systems/CareerFit.js';

// EndingScene：结局"心之画像"报告 — 测评×体验闭环，AI 据本局数据生成，模板兜底。
const DEFAULT_PORTRAIT = {
  driveText: '你被一种"要把事做好"的内在标准推着走。不是外界要求，是你自己放不过那份标准。',
  drainText: '反复修改与无休止的对齐，悄悄消耗了你的表达欲——你开始把话吞回去。',
  stressStyle: '你习惯内化压力，表面平静，内心却在高速运转。你的身体比你先知道累。',
  hiddenPattern: '你总是在别人开口前先自我怀疑。但那个说"你不行"的声音，往往是环境塞给你的，不是你本来的名字。',
  fitText: '这份职业与你的一部分高度共振，也暴露了你还在犹豫的另一部分。适合与喜欢，可以慢慢对齐。',
  oneLineForYou: '工作会跑，人也会累——但你有权问：这条路，还想不想继续走。',
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
    this.subRole = data?.subRole || null;
    this.stats = data?.stats || {
      health: 80, energy: 100, san: 80, stress: 20, skill: 10, performance: 50, money: 0, passion: 70,
    };
    this.choiceLog = data?.choiceLog || null; // 玩家选择日志(若主线记录了)
    this.projectProgress = data?.projectProgress != null ? data.projectProgress : null;
    this.portrait = data?.portrait || null;
    let profile = null;
    try { profile = JSON.parse(localStorage.getItem('wdwtb_profile') || 'null'); } catch (e) {}
    this.profile = profile;
    this.reportCtx = buildEndingReportContext({
      career: this.career,
      subRole: this.subRole,
      ending: this.ending,
      stats: this.stats,
      choiceLog: this.choiceLog,
      profile: this.profile,
      projectProgress: this.projectProgress,
    });
  }

  create() {
    // 这一局已通关：清掉本局存档。否则"再玩一次/继续游戏"会落回打完的状态。
    try { SaveSystem.clear(); } catch (e) {}
    AudioSystem.playBgm('ending'); // 温暖释然的收尾
    this.cameras.main.setBackgroundColor('#15151f');
    this.cameras.main.fadeIn(600, 0, 0, 0); // 从黑淡入（与 WorldScene 转场淡出衔接）
    this.uiContainer = null;

    if (this.portrait) {
      this._persistReport(this.portrait);
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

  // ===== 调混元生成个性化画像（吃满：职业体验 + 体感信号 + 选择轨迹 + 开局契合）=====
  async _generateWithAI() {
    const s = this.stats;
    const endingName = ENDING_NAMES[this.ending] || this.ending;
    const careerName = CAREER_NAMES[this.career] || this.career;
    const ctx = this.reportCtx;
    const sys = '你是一位温柔而敏锐的职业心理咨询师，为一款帮助大学毕业生探索职业的像素游戏撰写《心之画像》。'
      + '目标：帮ta判断「适不适合、喜不喜欢」这份职业，而不是评判对错。'
      + '语气像懂你、心疼你、但相信你的老朋友在深夜说话。走心、克制、有具体感、最终向上托举。'
      + '禁止说教、禁止贴标签、禁止空泛套话。全程只用中文。每段2-3句，直接称呼"你"。'
      + 'fitText 必须结合ta刚体验的职业日常与身体信号，诚实但不劝退。';
    const user = `这位玩家在游戏里体验了【${careerName}】职业生活，结局是「${endingName}」。\n`
      + `最终状态（0-100）：健康${s.health}、精力${s.energy}、心态${s.san}、压力${s.stress}、`
      + `技能${s.skill}、绩效${s.performance}、热情${s.passion}。\n`
      + `—— 本局体验摘要（请优先使用）——\n${ctx.promptBlock}\n`
      + `请输出严格 JSON（不要多余文字，不要markdown代码块）：\n`
      + `{"driveText":"驱动力","drainText":"消耗源","stressStyle":"与压力的关系",`
      + `"hiddenPattern":"ta可能没察觉的模式(结合选择轨迹,具体戳心)",`
      + `"fitText":"与【${careerName}】的契合(结合体感信号,诚实不劝退,可建议再试什么)",`
      + `"oneLineForYou":"一句专属的话(不是鸡汤)"}`;

    const fallbackPortrait = {
      ...DEFAULT_PORTRAIT,
      fitText: ctx.fitScore != null
        ? `开局兴趣与「${careerName}」锚点大约 ${ctx.fitScore} 分；结合你这局的体感——${ctx.body.signals[0]}。数字只是线索，喜不喜欢以你过完这几天的感觉为准。`
        : DEFAULT_PORTRAIT.fitText,
      oneLineForYou: `你刚试过「${careerName}」的日子。适合与喜欢，都可以再试一条线来对照。`,
    };

    const res = await AIClient.call(
      [{ role: 'system', content: sys }, { role: 'user', content: user }],
      { model: 'hy3', timeoutMs: 15000, fallbackFn: () => ({ text: JSON.stringify(fallbackPortrait) }) }
    );

    let portrait = fallbackPortrait;
    try {
      let t = (res.text || '').trim();
      t = t.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(t);
      portrait = { ...fallbackPortrait, ...parsed };
      this.aiSource = res.source;
    } catch (e) {
      portrait = fallbackPortrait;
      this.aiSource = 'fallback';
    }

    this._persistReport(portrait);
    if (this.loadingC) { this.loadingC.destroy(true); this.loadingC = null; }
    this._render(portrait);
  }

  /** 落档本局摘要，方便以后对比「试过的职业」 */
  _persistReport(portrait) {
    try {
      const entry = buildReportHistoryEntry(this.reportCtx, portrait);
      localStorage.setItem(LAST_REPORT_KEY, JSON.stringify(entry));
      let hist = [];
      try { hist = JSON.parse(localStorage.getItem(REPORT_HISTORY_KEY) || '[]'); } catch (e) {}
      hist = mergeReportHistory(hist, entry, 8);
      localStorage.setItem(REPORT_HISTORY_KEY, JSON.stringify(hist));
    } catch (e) { /* 存储失败不挡报告 */ }
  }

  // ===== 渲染报告卡片 =====
  // 全程「先量文字实际高度、再定位」——根治遮字。卡片高度由内容反推，不写死。
  _render(p) {
    const { width, height } = this.scale;
    if (this.uiContainer) this.uiContainer.destroy(true);
    const ui = this.add.container(0, 0);
    this.uiContainer = ui;

    const cardW = 900;
    const cardX = (width - cardW) / 2, cardY = 24;
    const innerL = cardX + 24;
    const innerW = cardW - 48;

    const revealGroups = [];
    const addGroup = () => { const g = []; revealGroups.push(g); return g; };

    // 所有文本用 origin(x, 0) 顶对齐，y 就是顶部，height 可直接累加（安全前进）
    let y = cardY + 28;
    const g0 = addGroup();
    const title = this.add.text(width / 2, y, '你的心之画像', {
      fontSize: '28px', color: '#d4a353', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    g0.push(title); y += title.height + 8;
    const careerName = CAREER_NAMES[this.career] || this.career;
    const sub = this.add.text(width / 2, y,
      `结局 · ${ENDING_NAMES[this.ending] || this.ending}　｜　体验职业 · ${careerName}`, {
      fontSize: '15px', color: '#8b8ba0',
    }).setOrigin(0.5, 0);
    g0.push(sub); y += sub.height + 4;
    // 本局体感一行（初衷：报告吃体验）
    const signal = (this.reportCtx?.body?.signals && this.reportCtx.body.signals[0]) || '';
    const fitBit = this.reportCtx?.fitScore != null ? `开局契合 ${this.reportCtx.fitScore} · ` : '';
    if (signal) {
      const sigT = this.add.text(width / 2, y, `${fitBit}${signal}`, {
        fontSize: '12px', color: '#c8b070', wordWrap: { width: innerW, useAdvancedWrap: true }, align: 'center',
      }).setOrigin(0.5, 0);
      g0.push(sigT); y += sigT.height + 6;
    }
    const aimark = this.add.text(width / 2, y, this.aiSource === 'ai' ? '· 由腾讯混元 hy3 为你生成 ·' : '· 基于你的旅程生成 ·', {
      fontSize: '11px', color: '#5a6a8a',
    }).setOrigin(0.5, 0);
    g0.push(aimark); y += aimark.height + 12;

    y = this._divider(ui, width / 2, y, cardW - 120);
    y = this._revealSection(ui, revealGroups, innerL, y, innerW, '🟡 你的驱动力', p.driveText, '#d4a353');
    y = this._revealSection(ui, revealGroups, innerL, y, innerW, '🔴 你的消耗源', p.drainText, '#e8735a');
    y = this._revealSection(ui, revealGroups, innerL, y, innerW, '💙 你与压力的关系', p.stressStyle, '#7b9cd6');
    // 隐藏模式段：带高亮底框（框尺寸由该段实测高度决定，包住整段不遮字）
    y = this._revealSection(ui, revealGroups, innerL, y, innerW, '✨ 你没察觉的模式 ✨', p.hiddenPattern, '#f0c060', true);
    y = this._revealSection(ui, revealGroups, innerL, y, innerW, '🟢 职业契合度', p.fitText, '#6aaa6a');

    y = this._divider(ui, width / 2, y, cardW - 200);
    const statsGroup = addGroup();
    y = this._statsBar(ui, innerL, y, innerW, statsGroup);
    y = this._divider(ui, width / 2, y + 4, cardW - 120);

    // 金句：实测高度前进（AI 生成常 2 行，写死会遮）
    const oneLineGroup = addGroup();
    const quote = this.add.text(width / 2, y, `「 ${p.oneLineForYou} 」`, {
      fontSize: '18px', color: '#f0d080', fontStyle: 'bold',
      wordWrap: { width: innerW - 40, useAdvancedWrap: true }, align: 'center',
    }).setOrigin(0.5, 0);
    oneLineGroup.push(quote); ui.add(quote);
    y += quote.height + 12;
    y = this._divider(ui, width / 2, y, cardW - 160);

    // 按钮区
    const btnY = y + 30;
    const btnGroup = addGroup();
    const b1 = this._button(ui, width / 2 - 220, btnY, 190, 36, '再玩一次', 0x2a2a4a, () => this.scene.start('HubScene'));
    const b2 = this._button(ui, width / 2, btnY, 190, 36, '保存画像 📷', 0x3a3a2a, () => this._sharePortrait());
    const b3 = this._button(ui, width / 2 + 220, btnY, 190, 36, '返回标题', 0x33283a, () => this.scene.start('TitleScene'));
    btnGroup.push(b1.bg, b1.txt, b2.bg, b2.txt, b3.bg, b3.txt);

    // 卡片底板：由内容最终高度反推（不写死 500），画完后沉到最底作"舞台"
    const contentBottom = btnY + 40;
    const cardH = contentBottom - cardY + 20;
    const board = this.add.rectangle(width / 2, cardY + cardH / 2, cardW, cardH, 0x1e1e30);
    const goldLine = this.add.rectangle(width / 2, cardY, cardW, 3, 0xd4a353).setOrigin(0.5, 0);
    ui.add(board); ui.add(goldLine);
    ui.sendToBack(goldLine); ui.sendToBack(board); // board 最底，金线在其上、内容之下
    // 卡片整体垂直居中于屏幕（内容高度变化时不会贴顶或超出）
    ui.y = Math.max(0, (height - cardH - cardY * 2) / 2);

    // 揭示组初始隐藏
    for (const g of revealGroups) {
      for (const el of g) {
        if (el && !el.parentContainer) ui.add(el);
        if (el && el.setAlpha) el.setAlpha(0);
      }
    }
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
  // 揭示版 _section：先量文字高度再定位，高亮框（highlight=true）尺寸由实测段落高度决定。
  // origin(x,0) 顶对齐，y 前进 = label高 + 间距 + 正文实测高 + 段间距。根治遮字。
  _revealSection(parent, revealGroups, x, y, w, label, text, accent, highlight) {
    const g = []; revealGroups.push(g);
    const labelEl = this.add.text(x, y, label, { fontSize: '13px', color: accent, fontStyle: 'bold' }).setOrigin(0, 0);
    const labelH = labelEl.height;
    const textY = y + labelH + 5;
    const textEl = this.add.text(x, textY, text || '', {
      fontSize: '13px', color: '#c4c4d4',
      wordWrap: { width: w, useAdvancedWrap: true }, lineSpacing: 4,
    }).setOrigin(0, 0);
    const textH = textEl.height;
    const sectionH = labelH + 5 + textH;
    // 高亮框先加（在文字下层），尺寸包住整段
    if (highlight) {
      const hlBg = this.add.rectangle(x + w / 2, y + sectionH / 2, w + 16, sectionH + 16, 0x2a2a18, 0.7);
      parent.add(hlBg);
      g.push(hlBg);
    }
    parent.add(labelEl); parent.add(textEl);
    g.push(labelEl, textEl);
    return y + sectionH + 16; // 段间距 16
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
