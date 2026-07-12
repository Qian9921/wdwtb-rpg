import Phaser from 'phaser';
import { AudioSystem } from '../systems/AudioSystem.js';
import {
  buildTryFirstAdvice,
  CAREER_NAMES,
  formatTriedCareersLine,
  REPORT_HISTORY_KEY,
} from '../systems/CareerFit.js';
import { ExplorationArchive, recommendDirections, completion } from '../systems/ExplorationArchive.js';
import { normalizeAxes, AXIS_META, AXIS_KEYS } from '../systems/PersonalityAxes.js';
import { INSIGHTS, INSIGHT_TOTAL } from '../systems/InsightCodex.js';
import { makeCutePanel } from '../systems/UI.js';
import { ensurePixelIcons, ICON_KEYS, makeIcon } from '../systems/PixelIcons.js';

// HubScene：职业选择大厅。玩家捏完人后选职业进入体验。
// 职业列表暂时硬编码，以后可挪到 data/ 目录的 JSON。
// 软灰度：当前只有 programmer 可玩，其余 9 个职业的数据/剧情/子方向逻辑全部保留，
// 只是视觉置灰 + 拦截点击。以后要开放某职业，只需把它的 key 加进这个集合。
const PLAYABLE = new Set(['programmer']);

export class HubScene extends Phaser.Scene {
  constructor() {
    super('HubScene');
  }

  init(data) {
    this._newGameSlot = (data && data.newGameSlot) || null;
  }

  create() {
    // 兜底清理:OpeningScene 的名字输入框(HTML DOM)若因转场路径异常没被 shutdown 清掉,
    // 会残留漂到后续场景(用户实测通勤页出现"给自己起个名字"框)。进大厅时扫一次保平安。
    try { document.querySelectorAll('#wdwtb-name-input').forEach(el => el.remove()); } catch (e) { /* */ }
    this.cameras.main.setBackgroundColor('#1a1a2e');
    this.cameras.main.fadeIn(500, 10, 8, 20);
    // 本场景用 960×540 硬编码坐标；zoom 2 + 居中让其在 1920×1080 屏铺满且原生锐利，坐标零改。
    this.cameras.main.setZoom(2);
    this.cameras.main.centerOn(480, 270);
    AudioSystem.playBgm('title'); // 延续标题氛围（同 mood 无缝）

    // 背景氛围光点（与标题页呼应）
    for (let i = 0; i < 10; i++) {
      const c = this.add.circle(
        Phaser.Math.Between(0, 960), Phaser.Math.Between(0, 540),
        Phaser.Math.Between(2, 4), 0xf5c86b, Phaser.Math.FloatBetween(0.05, 0.14)
      );
      this.tweens.add({
        targets: c, y: c.y - Phaser.Math.Between(20, 60),
        alpha: 0, duration: Phaser.Math.Between(3000, 6000),
        repeat: -1, delay: Phaser.Math.Between(0, 3000),
      });
    }

    // 细分职业（目前只有程序员开了；rec 用测评分推荐一个）。
    // dev=造东西(I/A/R + 开放性O)；test=守质量(C + 尽责性)。
    this.SUBROLES = {
      programmer: [
        { key: 'dev',  name: '开发工程师', desc: '把需求变成能跑的代码', rec: (r, b) => (r.I || 0) + (r.A || 0) + (r.R || 0) + (b.O || 0) },
        { key: 'test', name: '测试工程师', desc: '守住质量的最后一道关', rec: (r, b) => (r.C || 0) * 1.6 + (b.C || 0) },
      ],
      // 产品：业务产品偏数据/商业(E/C)，体验产品偏设计/共情(A/S + O)
      product: [
        { key: 'biz', name: '业务产品', desc: '指标、排期、把需求推上线', rec: (r, b) => (r.E || 0) + (r.C || 0) + (b.C || 0) },
        { key: 'ux',  name: '体验产品', desc: '走查、原型、好不好用', rec: (r, b) => (r.A || 0) + (r.S || 0) + (b.O || 0) },
      ],
      // 行政：综合办偏规范/文书(C)，学工教务偏服务/沟通(S/E)
      admin: [
        { key: 'office',  name: '综合办', desc: '公文、跑章、会议、迎检', rec: (r, b) => (r.C || 0) * 1.4 + (b.C || 0) },
        { key: 'student', name: '学工教务', desc: '学生事务、课表、资助', rec: (r, b) => (r.S || 0) + (r.E || 0) + (b.A || 0) },
      ],
      // 设计师迷你完整版：视觉偏审美(A)，UI/体验偏结构(C/I)
      designer: [
        { key: 'visual', name: '视觉设计', desc: '品牌、主视觉、出稿改稿', rec: (r, b) => (r.A || 0) * 1.5 + (b.O || 0) },
        { key: 'ui',     name: 'UI / 体验', desc: '组件、走查、标注交付', rec: (r, b) => (r.C || 0) + (r.I || 0) + (b.C || 0) },
      ],
      // 运营迷你完整版：内容偏表达(A/S)，增长偏数据(C/E)
      operation: [
        { key: 'content', name: '内容运营', desc: '选题、成稿、投放复盘', rec: (r, b) => (r.A || 0) + (r.S || 0) + (b.O || 0) },
        { key: 'growth',  name: '增长运营', desc: '活动、渠道、ROI', rec: (r, b) => (r.E || 0) + (r.C || 0) + (b.C || 0) },
      ],
      // 教师迷你完整版：班主任偏带班(S)，任课偏专业(I/C)
      teacher: [
        { key: 'homeroom', name: '班主任', desc: '建班、家校、班会公开课', rec: (r, b) => (r.S || 0) * 1.4 + (b.A || 0) },
        { key: 'subject',  name: '任课教师', desc: '备课、课堂、作业讲评', rec: (r, b) => (r.I || 0) + (r.C || 0) + (b.C || 0) },
      ],
      // 医护迷你完整版：临床偏诊断(I/C)，护理偏执行与照护(S/C)
      doctor: [
        { key: 'clinic', name: '临床医生', desc: '接诊、检验、查房汇报', rec: (r, b) => (r.I || 0) + (r.C || 0) + (b.C || 0) },
        { key: 'nurse',  name: '护理', desc: '交接、执行医嘱、宣教', rec: (r, b) => (r.S || 0) + (r.C || 0) + (b.A || 0) },
      ],
      // 公务员迷你完整版：窗口偏服务(S)，内勤偏文书规范(C)
      civilservant: [
        { key: 'window', name: '窗口服务', desc: '收件、会商、办结归档', rec: (r, b) => (r.S || 0) * 1.3 + (r.C || 0) },
        { key: 'desk',   name: '综合内勤', desc: '拟稿、会签、督办反馈', rec: (r, b) => (r.C || 0) * 1.4 + (b.C || 0) },
      ],
      // 销售迷你完整版：野外/大客户偏开拓(E)，电销内勤偏节奏与转化(C/E)
      sales: [
        { key: 'field',  name: '大客户销售', desc: '线索、拜访、逼单复盘', rec: (r, b) => (r.E || 0) * 1.4 + (r.S || 0) },
        { key: 'inside', name: '电销 / 内勤', desc: '触达、商机、签约交接', rec: (r, b) => (r.E || 0) + (r.C || 0) + (b.C || 0) },
      ],
      // 律师迷你完整版：诉讼偏对抗与证据(C/I)，非诉偏交易与合同(C/E)
      lawyer: [
        { key: 'litigation', name: '诉讼律师', desc: '阅卷、证据、开庭预案', rec: (r, b) => (r.C || 0) + (r.I || 0) + (b.C || 0) },
        { key: 'corporate',  name: '非诉 / 公司', desc: '尽调、合同、意见书', rec: (r, b) => (r.C || 0) + (r.E || 0) + (b.O || 0) },
      ],
    };

    const careers = [
      // 深度职业（3 个）—— 金边 + 亮色填充
      { key: 'programmer',  name: '程序员',     desc: '代码会跑，人也会累',           deep: true },
      { key: 'product',     name: '产品经理',   desc: '夹在所有人的期待中间',         deep: true },
      { key: 'admin',       name: '高校行政',   desc: '安稳的背面是什么',             deep: true },
      // 轻量职业（7 个）
      { key: 'designer',    name: '设计师',     desc: '美是秩序，也是自由的呼吸',     deep: false },
      { key: 'operation',   name: '运营',       desc: '数据背后，是无数真实的人',     deep: false },
      { key: 'teacher',     name: '教师',       desc: '每一颗种子都有它的季节',       deep: false },
      { key: 'doctor',      name: '医生／护士', desc: '疲惫中藏着最深的善意',         deep: false },
      { key: 'civilservant',name: '公务员',     desc: '规则之内，亦有温度',           deep: false },
      { key: 'sales',       name: '销售',       desc: '每一单背后都有一段对话',       deep: false },
      { key: 'lawyer',      name: '律师',       desc: '天平的两端，哪边更重',         deep: false },
    ];

    // 测评推荐：从 wdwtb_profile 读兴趣坐标 → 星标先试职业（推荐可改）
    // 软灰度期只有 programmer 可玩：推荐里过滤掉不可选的职业，避免"建议先试XX"却点不了，
    // 且当推荐落在不可玩职业上时，统一改为引导玩家试当前唯一开放的 programmer。
    let recKeys = new Set();
    let recLine = '';
    try {
      const prof = JSON.parse(localStorage.getItem('wdwtb_profile') || 'null');
      if (prof && (prof.riasec || prof.tryFirst)) {
        const advice = prof.tryFirst?.length
          ? {
              headline: prof.tryHeadline || `建议先试「${prof.tryFirst[0]?.name}」`,
              tryFirst: prof.tryFirst,
            }
          : buildTryFirstAdvice(prof, 2);
        const allRecKeys = new Set();
        (advice.tryFirst || advice.detail || []).slice(0, 2).forEach((t) => allRecKeys.add(t.key));
        [...allRecKeys].filter((k) => PLAYABLE.has(k)).forEach((k) => recKeys.add(k));
      }
    } catch (e) { /* */ }
    recLine = recKeys.size
      ? `⭐ 测评建议先试：${[...recKeys].map(k => CAREER_NAMES[k] || k).join('、')}`
      : '⭐ 当前主打「程序员」深度体验，测评结果会在更多职业开放后派上用场';

    // 标题
    const title = this.add.text(480, 62, '入职哪一行？', {
      fontSize: '34px', color: '#ffffff', fontStyle: 'bold', letterSpacing: 4,
    }).setOrigin(0.5);
    title.setShadow(0, 2, '#d4a35366', 10, false, true);
    this.add.text(480, 100, '选一个职业，真实过几天那种生活——当前主打程序员线，更多职业陆续开放', {
      fontSize: '13px', color: '#9aa0a6',
    }).setOrigin(0.5);
    // 3 分钟路径 + 推荐
    this.add.text(480, 122, '办公室：找 ❗ 导师 → 对接同事 → 工位开工 → 右上角下班 → 结局心之画像', {
      fontSize: '12px', color: '#c8b070',
    }).setOrigin(0.5);
    this.add.text(480, 142, recLine, {
      fontSize: '12px', color: '#ffd24d',
    }).setOrigin(0.5);

    // 多职业试玩历史（报告柱回灌 → 对照适合/喜欢）
    let triedLine = '';
    try {
      const hist = JSON.parse(localStorage.getItem(REPORT_HISTORY_KEY) || '[]');
      triedLine = formatTriedCareersLine(hist, 3);
    } catch (e) { /* */ }
    if (triedLine) {
      this.add.text(480, 160, triedLine, {
        fontSize: '11px', color: '#9ab4dc',
      }).setOrigin(0.5);
    }

    // 左上角返回按钮
    const back = this.add.text(24, 16, '← 返回', {
      fontSize: '15px', color: '#9aa0a6',
    }).setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor('#ffd24d'));
    back.on('pointerout', () => back.setColor('#9aa0a6'));
    back.on('pointerdown', () => this.scene.start('OpeningScene'));

    // 右上角「探索档案」——跨职业自我发现的可视化入口（引导方向的落点）
    const dashBtn = this.add.rectangle(880, 22, 150, 30, 0x23233a, 0.96)
      .setStrokeStyle(2, 0x7b9cd6).setInteractive({ useHandCursor: true });
    const dashTxt = this.add.text(880, 22, '📊 探索档案', { fontSize: '14px', color: '#bcd0f0' }).setOrigin(0.5);
    dashBtn.on('pointerover', () => dashBtn.setFillStyle(0x33334e));
    dashBtn.on('pointerout', () => dashBtn.setFillStyle(0x23233a));
    dashBtn.on('pointerdown', () => { AudioSystem.uiClick(); this._showArchivePanel(); });

    // 网格参数：5 列 × 2 行
    const cols = 5;
    const cardW = 160, cardH = 92;
    const gapX = 16, gapY = 26;
    const totalW = cols * cardW + (cols - 1) * gapX;
    const startX = (960 - totalW) / 2;
    // 有历史条时卡片略下移，避免挤标题
    const rowCY = triedLine ? [268, 382] : [252, 366];

    careers.forEach((career, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + cardW / 2 + col * (cardW + gapX);
      const cy = rowCY[row];

      // 软灰度判据：只有 PLAYABLE 里的职业能玩，其余全部视觉降级 + 拦截点击。
      const isPlayable = PLAYABLE.has(career.key);
      const isDeep = career.deep;
      const baseFill = isPlayable ? (isDeep ? 0x2a2a4e : 0x1e1e3a) : 0x14141c;
      const hoverFill = isPlayable ? (isDeep ? 0x3c3c5e : 0x2c2c4a) : 0x14141c;
      const nameColor = isPlayable ? (isDeep ? '#ffd24d' : '#e6e6e6') : '#5a5a6a';
      const descColor = isPlayable ? (isDeep ? '#aaaacc' : '#9aa0a6') : '#4c4c5c';
      const rad = 14;

      // 可爱圆角卡（容器：圆角底 + 文字 + 角标 + 交互热区）
      const cont = this.add.container(cx, cy);

      // 主打职业（programmer）柔光晕：轻微脉动，让它成为视觉焦点
      if (isPlayable) {
        const glow = this.add.graphics();
        glow.fillStyle(0xffd24d, 0.16);
        glow.fillRoundedRect(-cardW / 2 - 6, -cardH / 2 - 6, cardW + 12, cardH + 12, rad + 6);
        cont.add(glow);
        this.tweens.add({ targets: glow, alpha: 0.06, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }

      const g = this.add.graphics();
      const drawCard = (fill, hover) => {
        g.clear();
        g.fillStyle(fill, 0.98);
        g.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, rad);
        const strokeColor = !isPlayable
          ? (hover ? 0x34343f : 0x24242e)
          : (isDeep ? 0xd4a353 : (hover ? 0x6a6a8a : 0x3a3a52));
        g.lineStyle(isPlayable && isDeep ? 3 : 2, strokeColor, 1);
        g.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, rad);
      };
      drawCard(baseFill, false);
      cont.add(g);
      cont.add(this.add.text(0, -14, career.name, { fontSize: '15px', color: nameColor, fontStyle: 'bold' }).setOrigin(0.5));
      cont.add(this.add.text(0, 14, career.desc, { fontSize: '11px', color: descColor }).setOrigin(0.5));

      // 角标：可玩=金色完整版；不可玩=灰色「敬请期待」
      const tag = isPlayable
        ? { t: '★完整版', c: '#ffd24d' }
        : { t: '敬请期待', c: '#6a6a8a' };
      cont.add(this.add.text(cardW / 2 - 8, -cardH / 2 + 6, tag.t, { fontSize: '9px', color: tag.c, fontStyle: isPlayable ? 'bold' : 'normal' }).setOrigin(1, 0));

      // 左上角：测评推荐优先，否则可玩职业显示「主打」强调；不可玩职业不显示（已被灰化，没必要再引导）
      if (recKeys.has(career.key)) {
        cont.add(this.add.text(-cardW / 2 + 8, -cardH / 2 + 6, '⭐建议', { fontSize: '9px', color: '#ffd24d', fontStyle: 'bold' }).setOrigin(0, 0));
      } else if (isPlayable) {
        cont.add(this.add.text(-cardW / 2 + 8, -cardH / 2 + 6, '⭐主打', { fontSize: '9px', color: '#ffd24d', fontStyle: 'bold' }).setOrigin(0, 0));
      }

      const zone = this.add.zone(0, 0, cardW, cardH).setInteractive({ useHandCursor: isPlayable });
      cont.add(zone);
      if (isPlayable) {
        // 可玩职业：hover 放大 + 手型，点击行为不变（有细分方向先弹窗，否则直接进游戏）
        zone.on('pointerover', () => { drawCard(hoverFill, true); this.tweens.add({ targets: cont, scale: 1.05, duration: 130, ease: 'Back.out' }); });
        zone.on('pointerout', () => { drawCard(baseFill, false); this.tweens.add({ targets: cont, scale: 1, duration: 130 }); });
        zone.on('pointerdown', () => {
          AudioSystem.uiClick();
          if (this.SUBROLES[career.key]) { this._showSpecModal(career); return; }
          this._enterWorld(career, null);
        });
      } else {
        // 不可玩职业：不放大、无手型（不给"可点"的错觉），hover 只极轻微提亮边框；
        // 点击不进游戏，只给友好提示 + 点击音效。
        zone.on('pointerover', () => drawCard(baseFill, true));
        zone.on('pointerout', () => drawCard(baseFill, false));
        zone.on('pointerdown', () => {
          AudioSystem.uiClick();
          this._showComingSoonHint(career.name);
        });
      }
    });
  }

  // 不可玩职业的点击反馈：一个漂浮的思维气泡，友好告知"还在打磨中"，引导回程序员。
  // 防止连点堆叠气泡：同一时刻只留一个。
  _showComingSoonHint(careerName) {
    if (this._comingSoonBubble) { this._comingSoonBubble.destroy(); this._comingSoonBubble = null; }

    const cx = 480, cy = 300;
    const msg = `「${careerName}」还在打磨中，敬请期待～\n先试试程序员吧！`;
    const cont = this.add.container(cx, cy).setDepth(80).setAlpha(0);

    const g = this.add.graphics();
    const w = 220, h = 56, rad = 14;
    g.fillStyle(0x23233a, 0.96);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, rad);
    g.lineStyle(2, 0x7b9cd6, 0.9);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, rad);
    // 思维气泡的小尾巴（两个渐小的圆）
    g.fillStyle(0x23233a, 0.96);
    g.fillCircle(-w / 4, h / 2 + 8, 6);
    g.fillCircle(-w / 4 - 10, h / 2 + 16, 3.5);
    cont.add(g);
    cont.add(this.add.text(0, 0, msg, {
      fontSize: '11px', color: '#e6e6e6', align: 'center', lineSpacing: 4,
    }).setOrigin(0.5));

    this._comingSoonBubble = cont;
    this.tweens.add({
      targets: cont, alpha: 1, y: cy - 10, duration: 180, ease: 'Back.out',
      onComplete: () => {
        this.time.delayedCall(1400, () => {
          if (this._comingSoonBubble !== cont) return; // 已被新气泡替换
          this.tweens.add({
            targets: cont, alpha: 0, y: cy - 22, duration: 260,
            onComplete: () => { cont.destroy(); if (this._comingSoonBubble === cont) this._comingSoonBubble = null; },
          });
        });
      },
    });
  }

  _enterWorld(career, subRole) {
    this.cameras.main.fadeOut(400, 10, 8, 20);
    this.cameras.main.once('camerafadeoutcomplete', () =>
      this.scene.start('WorldScene', { career: career.key, subRole, deep: career.deep, act: 1, newGameSlot: this._newGameSlot }));
  }

  // 细分职业选择弹窗：两个方向卡 + 测评推荐高亮
  _showSpecModal(career) {
    const subs = this.SUBROLES[career.key];
    let prof = {}; try { prof = JSON.parse(localStorage.getItem('wdwtb_profile') || '{}'); } catch (e) {}
    const r = prof.riasec || {}, big = prof.big5 || {};
    const recKey = subs.map(s => ({ k: s.key, v: s.rec(r, big) })).sort((a, b) => b.v - a.v)[0].k;

    const els = [];
    els.push(this.add.rectangle(480, 270, 960, 540, 0x0a0a16, 0.84).setInteractive().setDepth(50));
    els.push(makeCutePanel(this, { x: 480, y: 270, w: 600, h: 340, radius: 22, fill: 0x191930, glow: true }).setDepth(51));
    els.push(this.add.text(480, 152, `选择你的方向 · ${career.name}`, { fontSize: '22px', color: '#ffd24d', fontStyle: 'bold' }).setOrigin(0.5).setDepth(52));
    els.push(this.add.text(480, 178, '不同方向 = 不同的导师任务、对接的人、小游戏', { fontSize: '12px', color: '#9aa0a6' }).setOrigin(0.5).setDepth(52));
    els.push(this.add.text(480, 200, '进办公室：找 ❗ 导师 → 对接 → 自己的椅子「坐下办公」→「开始工作」→ 下班', {
      fontSize: '11px', color: '#c8b070',
    }).setOrigin(0.5).setDepth(52));

    subs.forEach((sub, i) => {
      const cx = 480 + (i === 0 ? -148 : 148), cy = 298, cw = 254, ch = 152;
      const isRec = sub.key === recKey;
      const g = this.add.graphics().setDepth(52);
      const draw = (hover) => {
        g.clear();
        g.fillStyle(hover ? (isRec ? 0x35604e : 0x33334e) : (isRec ? 0x2a4a3e : 0x23233a), 0.98);
        g.fillRoundedRect(cx - cw / 2, cy - ch / 2, cw, ch, 16);
        g.lineStyle(2.5, isRec ? 0xffd24d : 0x4a4a6a, 1);
        g.strokeRoundedRect(cx - cw / 2, cy - ch / 2, cw, ch, 16);
      };
      draw(false);
      els.push(g);
      els.push(this.add.text(cx, cy - 42, sub.name, { fontSize: '18px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(53));
      els.push(this.add.text(cx, cy - 6, sub.desc, { fontSize: '12px', color: '#c8c8d8', wordWrap: { width: 215 }, align: 'center' }).setOrigin(0.5).setDepth(53));
      if (isRec) els.push(this.add.text(cx, cy + 48, '⭐ 测评推荐', { fontSize: '12px', color: '#ffd24d' }).setOrigin(0.5).setDepth(53));
      const zone = this.add.zone(cx, cy, cw, ch).setInteractive({ useHandCursor: true }).setDepth(53);
      els.push(zone);
      zone.on('pointerover', () => draw(true));
      zone.on('pointerout', () => draw(false));
      zone.on('pointerdown', () => { AudioSystem.uiClick(); this._enterWorld(career, sub.key); });
    });

    const close = this.add.text(748, 148, '✕', { fontSize: '20px', color: '#8a8a9e' })
      .setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(53);
    close.on('pointerover', () => close.setColor('#ff9a9a'));
    close.on('pointerdown', () => { els.push(close); els.forEach(e => e.destroy()); });
    els.push(close);
  }

  // 探索档案面板：跨职业自我发现的仪表盘——人格轴 + 已试职业 + 推荐方向 + 完成度。
  // 让"引导方向"这个主旨,在选职业前就被玩家看见。
  _showArchivePanel() {
    const arch = ExplorationArchive.load();
    const axes = normalizeAxes(arch.axisTotals || {});
    const rec = recommendDirections(arch, { topN: 3 });
    const comp = completion(arch);
    const tried = Object.keys(arch.careers || {});

    const els = [];
    const D = 60;
    els.push(this.add.rectangle(480, 270, 960, 540, 0x0a0a16, 0.86).setInteractive().setDepth(D));
    els.push(makeCutePanel(this, { x: 480, y: 270, w: 660, h: 410, radius: 22, fill: 0x161628, stroke: 0x7b9cd6, glow: true }).setDepth(D + 1));
    els.push(this.add.text(480, 96, '📊 我的职业探索档案', { fontSize: '22px', color: '#bcd0f0', fontStyle: 'bold' }).setOrigin(0.5).setDepth(D + 2));
    els.push(this.add.text(480, 120, '你的选择跨职业沉淀下来的样子——方向,从对照里长出来。', { fontSize: '11px', color: '#8a90a6' }).setOrigin(0.5).setDepth(D + 2));

    // 左栏：职业人格轴（4条双极迷你条）
    const lx = 210;
    els.push(this.add.text(lx, 150, '职业人格轴', { fontSize: '14px', color: '#d4a353', fontStyle: 'bold' }).setOrigin(0, 0).setDepth(D + 2));
    let ay = 178;
    for (const k of AXIS_KEYS) {
      const meta = AXIS_META[k];
      const v = Math.max(-100, Math.min(100, axes[k] || 0));
      els.push(this.add.text(lx, ay, meta.neg, { fontSize: '10px', color: '#8a8a9e' }).setOrigin(0, 0.5).setDepth(D + 2));
      els.push(this.add.text(lx + 180, ay, meta.pos, { fontSize: '10px', color: '#8a8a9e' }).setOrigin(1, 0.5).setDepth(D + 2));
      const tx = lx + 34, tw = 112, mid = tx + tw / 2;
      els.push(this.add.rectangle(mid, ay, tw, 4, 0x2a2a3e).setOrigin(0.5).setDepth(D + 2));
      els.push(this.add.rectangle(mid, ay, 2, 9, 0x55556e).setOrigin(0.5).setDepth(D + 2));
      els.push(this.add.circle(mid + (v / 100) * (tw / 2), ay, 5, 0xf0c060).setDepth(D + 3));
      ay += 26;
    }
    // 完成度：职业进度纯展示；感悟进度做成可点入口——图鉴才是"可回看"的落点。
    els.push(this.add.text(lx, ay + 6, `探索完成度：职业 ${comp.careers.tried}/${comp.careers.total}`, {
      fontSize: '11px', color: '#9ab4dc',
    }).setOrigin(0, 0).setDepth(D + 2));
    ensurePixelIcons(this);
    const insightRowY = ay + 26;
    const insightIcon = makeIcon(this, lx + 8, insightRowY, ICON_KEYS.lens, 0xc79ae8, 14).setDepth(D + 2);
    const insightBtn = this.add.text(lx + 20, insightRowY, `感悟图鉴 ${comp.thoughts}/${INSIGHT_TOTAL} →`, {
      fontSize: '11px', color: '#c79ae8', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(D + 2).setInteractive({ useHandCursor: true });
    insightBtn.on('pointerover', () => { insightBtn.setColor('#ffe08a'); insightIcon.setTint(0xffe08a); });
    insightBtn.on('pointerout', () => { insightBtn.setColor('#c79ae8'); insightIcon.setTint(0xc79ae8); });
    insightBtn.on('pointerdown', () => { AudioSystem.uiClick(); this._showInsightCodexPanel(); });
    els.push(insightIcon); els.push(insightBtn);

    // 右栏：已试职业 + 推荐方向
    const rx = 470;
    els.push(this.add.text(rx, 150, '已体验', { fontSize: '14px', color: '#d4a353', fontStyle: 'bold' }).setOrigin(0, 0).setDepth(D + 2));
    const triedNames = tried.length ? tried.map(k => CAREER_NAMES[k] || k).join('、') : '还没有——选一个职业开始吧';
    els.push(this.add.text(rx, 174, triedNames, { fontSize: '12px', color: '#c8c8d8', wordWrap: { width: 250 }, lineSpacing: 3 }).setOrigin(0, 0).setDepth(D + 2));

    els.push(this.add.text(rx, 224, '🧭 建议下一步探索', { fontSize: '14px', color: '#7b9cd6', fontStyle: 'bold' }).setOrigin(0, 0).setDepth(D + 2));
    let ry = 250;
    (rec.next || []).forEach((n, i) => {
      els.push(this.add.text(rx, ry, `${i + 1}. ${n.name}`, { fontSize: '13px', color: '#e6e6e6', fontStyle: 'bold' }).setOrigin(0, 0).setDepth(D + 2));
      els.push(this.add.text(rx, ry + 17, n.why, { fontSize: '11px', color: '#a0a0b8', wordWrap: { width: 250 }, lineSpacing: 2 }).setOrigin(0, 0).setDepth(D + 2));
      const t = this.add.text(rx, ry + 17, n.why, { fontSize: '11px', wordWrap: { width: 250 }, lineSpacing: 2 }).setVisible(false);
      ry += 20 + t.height + 8; t.destroy();
    });
    if (rec.deepen) {
      els.push(this.add.text(rx, ry + 2, `或：回「${rec.deepen.careerName}」试试没走过的方向`, { fontSize: '11px', color: '#c8b070', wordWrap: { width: 250 } }).setOrigin(0, 0).setDepth(D + 2));
    }

    const close = this.add.text(788, 84, '✕', { fontSize: '20px', color: '#8a8a9e' })
      .setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(D + 3);
    close.on('pointerover', () => close.setColor('#ff9a9a'));
    close.on('pointerdown', () => { els.push(close); els.forEach(e => e.destroy()); });
    els.push(close);
  }

  // 职业感悟图鉴浏览面板：翻看所有已解锁的感悟卡（未解锁=占位，给收集目标感）。
  // 内容/解锁逻辑完全复用 InsightCodex.js + ExplorationArchive——本方法只做展示。
  // 叠在探索档案面板之上（更高 depth），关闭后回到档案面板，风格与其一致（makeCutePanel 圆角+金边系）。
  _showInsightCodexPanel() {
    const arch = ExplorationArchive.load();
    const owned = new Set(arch.thoughts || []);
    ensurePixelIcons(this);
    const kb = this.input.keyboard;
    const D = 70; // 高于 _showArchivePanel 的 D(60)+3，确保叠在其上
    const cols = 4, rows = 2, perPage = cols * rows;
    const total = INSIGHT_TOTAL;
    const pageCount = Math.max(1, Math.ceil(total / perPage));
    let page = 0;

    const els = [];       // 面板整体（标题/进度/关闭按钮等），关闭时统一销毁
    const gridEls = [];   // 当前页的卡片，翻页时重建
    let detailEls = [];   // 详情浮层，随时可能开关

    els.push(this.add.rectangle(480, 270, 960, 540, 0x05050c, 0.88).setInteractive().setDepth(D));
    els.push(makeCutePanel(this, { x: 480, y: 270, w: 700, h: 420, radius: 22, fill: 0x161628, stroke: 0xc79ae8, glow: true }).setDepth(D + 1));
    els.push(this.add.text(480, 78, '感悟图鉴', { fontSize: '22px', color: '#e8d4f8', fontStyle: 'bold' }).setOrigin(0.5).setDepth(D + 2));
    const progressText = this.add.text(480, 102, '', { fontSize: '12px', color: '#9ab4dc' }).setOrigin(0.5).setDepth(D + 2);
    els.push(progressText);
    const pageText = this.add.text(480, 452, '', { fontSize: '11px', color: '#8a90a6' }).setOrigin(0.5).setDepth(D + 2);
    els.push(pageText);
    els.push(this.add.text(480, 468, 'ESC 关闭 · ←→ / Tab 翻页 · 数字键查看详情', {
      fontSize: '10px', color: '#5a6078',
    }).setOrigin(0.5).setDepth(D + 2));

    const close = this.add.text(808, 66, '✕', { fontSize: '20px', color: '#8a8a9e' })
      .setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(D + 3);
    close.on('pointerover', () => close.setColor('#ff9a9a'));
    close.on('pointerout', () => close.setColor('#8a8a9e'));
    els.push(close);

    const DIGIT_NAMES = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
    let digitHandlers = [];
    const clearDigitHandlers = () => { digitHandlers.forEach(({ name, handler }) => kb.off(`keydown-${name}`, handler)); digitHandlers = []; };
    const clearGrid = () => { gridEls.forEach((e) => e.destroy()); gridEls.length = 0; };
    const clearDetail = () => { detailEls.forEach((e) => e.destroy()); detailEls = []; };

    const showDetail = (idx) => {
      clearDetail();
      const ins = INSIGHTS[idx];
      if (!ins) return;
      const dD = D + 10;
      const scrim = this.add.rectangle(480, 270, 960, 540, 0x05050a, 0.55).setInteractive().setDepth(dD);
      detailEls.push(scrim);
      detailEls.push(makeCutePanel(this, { x: 480, y: 270, w: 480, h: 260, radius: 20, fill: 0x1e1a38, stroke: 0xffe08a, glow: true }).setDepth(dD + 1));
      detailEls.push(this.add.text(480, 172, ins.title, {
        fontSize: '20px', color: '#ffe08a', fontStyle: 'bold', wordWrap: { width: 420 }, align: 'center',
      }).setOrigin(0.5, 0).setDepth(dD + 2));
      detailEls.push(this.add.text(480, 258, ins.text, {
        fontSize: '14px', color: '#e8e4f4', wordWrap: { width: 400, useAdvancedWrap: true }, align: 'center', lineSpacing: 6,
      }).setOrigin(0.5, 0.5).setDepth(dD + 2));
      detailEls.push(this.add.text(480, 372, 'ESC / 点击空白处 返回', { fontSize: '11px', color: '#8a90a6' }).setOrigin(0.5).setDepth(dD + 2));
      scrim.on('pointerdown', () => clearDetail());
    };

    const renderGrid = () => {
      clearGrid();
      clearDigitHandlers();
      const startIdx = page * perPage;
      const items = INSIGHTS.slice(startIdx, startIdx + perPage);
      const cardW = 145, cardH = 115, gapX = 12, gapY = 16;
      const totalW = cols * cardW + (cols - 1) * gapX;
      const startX = 480 - totalW / 2 + cardW / 2;
      const startY = 168;
      items.forEach((ins, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const cx = startX + col * (cardW + gapX);
        const cy = startY + row * (cardH + gapY);
        const isUnlocked = owned.has(ins.id);
        const g = this.add.graphics().setDepth(D + 2);
        const draw = (hover) => {
          g.clear();
          g.fillStyle(hover && isUnlocked ? 0x2e2a58 : (isUnlocked ? 0x232045 : 0x1a1a26), 0.98);
          g.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 12);
          g.lineStyle(hover && isUnlocked ? 2.5 : 2, hover && isUnlocked ? 0xffe08a : (isUnlocked ? 0xc79ae8 : 0x33333f), isUnlocked ? 1 : 0.7);
          g.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 12);
        };
        draw(false);
        gridEls.push(g);
        gridEls.push(this.add.text(cx - cardW / 2 + 8, cy - cardH / 2 + 6, `${startIdx + i + 1}`, {
          fontSize: '10px', color: '#6a6a82',
        }).setOrigin(0, 0).setDepth(D + 3));
        if (isUnlocked) {
          gridEls.push(this.add.text(cx, cy - cardH / 2 + 14, ins.title, {
            fontSize: '13px', color: '#f0d8ff', fontStyle: 'bold',
            wordWrap: { width: cardW - 20, useAdvancedWrap: true }, align: 'center',
          }).setOrigin(0.5, 0).setDepth(D + 3));
          const snippet = ins.text.length > 34 ? `${ins.text.slice(0, 34)}…` : ins.text;
          gridEls.push(this.add.text(cx, cy + 8, snippet, {
            fontSize: '10px', color: '#b8b4cc',
            wordWrap: { width: cardW - 20, useAdvancedWrap: true }, align: 'center', lineSpacing: 2,
          }).setOrigin(0.5, 0).setDepth(D + 3));
        } else {
          gridEls.push(makeIcon(this, cx, cy - 14, ICON_KEYS.quest, 0x55556a, 22).setDepth(D + 3));
          gridEls.push(this.add.text(cx, cy + 18, '？未解锁', { fontSize: '11px', color: '#55556a' }).setOrigin(0.5).setDepth(D + 3));
        }
        const zone = this.add.zone(cx, cy, cardW, cardH).setDepth(D + 4).setInteractive({ useHandCursor: isUnlocked });
        gridEls.push(zone);
        if (isUnlocked) {
          zone.on('pointerover', () => draw(true));
          zone.on('pointerout', () => draw(false));
          zone.on('pointerdown', () => { AudioSystem.uiClick(); showDetail(startIdx + i); });
        }
        // 数字键 1-8 快速查看当前页对应卡片详情（未解锁的不响应）
        if (DIGIT_NAMES[i]) {
          const handler = () => { if (isUnlocked) { AudioSystem.uiClick(); showDetail(startIdx + i); } };
          kb.on(`keydown-${DIGIT_NAMES[i]}`, handler);
          digitHandlers.push({ name: DIGIT_NAMES[i], handler });
        }
      });
      progressText.setText(`已悟 ${owned.size} / 共 ${total}`);
      pageText.setText(pageCount > 1 ? `第 ${page + 1}/${pageCount} 页` : '');
    };

    const changePage = (delta) => {
      if (detailEls.length) return; // 详情打开时先不切页，避免视觉突变
      if (pageCount <= 1) return;
      page = (page + delta + pageCount) % pageCount;
      AudioSystem.uiClick();
      renderGrid();
    };

    const onLeft = () => changePage(-1);
    const onRight = () => changePage(1);
    const onTab = (e) => { if (e) e.preventDefault(); changePage(1); };
    const onEsc = () => { if (detailEls.length) clearDetail(); else closeAll(); };

    kb.on('keydown-LEFT', onLeft);
    kb.on('keydown-RIGHT', onRight);
    kb.on('keydown-TAB', onTab);
    kb.on('keydown-ESC', onEsc);

    const closeAll = () => {
      kb.off('keydown-LEFT', onLeft);
      kb.off('keydown-RIGHT', onRight);
      kb.off('keydown-TAB', onTab);
      kb.off('keydown-ESC', onEsc);
      clearDigitHandlers();
      clearDetail();
      clearGrid();
      els.forEach((e) => e.destroy());
    };
    close.on('pointerdown', () => closeAll());

    renderGrid();
  }
}
