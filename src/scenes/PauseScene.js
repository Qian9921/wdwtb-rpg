import Phaser from 'phaser';
import { AudioSystem } from '../systems/AudioSystem.js';
import { buildPauseInsight, CAREER_NAMES as FIT_NAMES } from '../systems/CareerFit.js';

// PauseScene — 暂停菜单覆盖场景（完整像素 RPG 标配）
// 由 WorldScene 通过 scene.launch('PauseScene', { origin, stateSystem, career, act }) 唤起，
// WorldScene 先 scene.pause()。本场景半透明覆盖其上，ESC/继续 关闭并 resume。
// 面板：主菜单 / 角色状态 / 物品 / 任务日志 / 设置。
const CAREER_NAMES = {
  programmer: '程序员', product: '产品经理', admin: '高校行政',
  designer: '设计师', operation: '运营', teacher: '教师',
  doctor: '医生/护士', civilservant: '公务员', sales: '销售', lawyer: '律师',
  ...FIT_NAMES,
};
const ACT_NAMES = ['', '入职', '上手', '996 / 消耗', '至暗', '抉择'];
const STAT_LABELS = [
  ['health', '健康'], ['energy', '精力'], ['san', '心态'], ['stress', '压力'],
  ['skill', '技能'], ['performance', '绩效'], ['money', '金钱'], ['passion', '热情'],
];

export class PauseScene extends Phaser.Scene {
  constructor() { super('PauseScene'); }

  init(data) {
    this.origin = data?.origin || 'WorldScene';
    this.stateSystem = data?.stateSystem || null;
    this.career = data?.career || 'programmer';
    this.act = data?.act || 1;
    this.stats = this.stateSystem ? this.stateSystem.getAll() : null;
    this.questSystem = data?.questSystem || null;  // 真实任务数据源（替代硬编码 goalByAct）
    this.choiceLog = data?.choiceLog || null;
    this.relationSummary = data?.relationSummary || null; // E5 办公室关系摘要
    this.itemSystem = data?.itemSystem || null;    // 真实背包（WorldScene 的 ItemSystem）
    this.openPanel = data?.openPanel || null;      // 直接打开某面板（如白板打开 'quests'）
  }

  create() {
    const { width: W, height: H } = this.scale;
    this.W = W; this.H = H;
    AudioSystem.duck(true); // 菜单打开压低 BGM
    // 半透明遮罩（吃掉底层点击）
    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0a12, 0.82).setInteractive();
    // 面板容器（切换用）
    this.panel = this.add.container(0, 0);
    // 白板等物件可直接打开任务页；否则进主菜单
    if (this.openPanel === 'quests') this._showQuests();
    else this._showMain();

    // ESC 关闭
    this.input.keyboard.on('keydown-ESC', () => {
      // 子面板时 ESC 返回主菜单，主菜单时 ESC 关闭
      if (this.inSub) this._showMain();
      else this._close();
    });
  }

  _clear() { this.panel.removeAll(true); this.inSub = false; }

  _title(text, y = 54) {
    this.panel.add(this.add.text(this.W / 2, y, text, {
      fontSize: '30px', color: '#f0d68a', fontStyle: 'bold', letterSpacing: 3,
    }).setOrigin(0.5));
  }

  _menuButton(y, label, cb, w = 340, color = 0x2a2a44) {
    // 可爱圆角按钮：先量文字再定框（绝不挡字），圆角+金边+hover 弹性
    const txt = this.add.text(this.W / 2, y, label, { fontSize: '20px', color: '#eef1ff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(2);
    const bw = Math.max(w, Math.ceil(txt.width) + 56);
    const bh = Math.ceil(txt.height) + 24;
    const r = Math.min(16, bh / 2);
    const g = this.add.graphics();
    const draw = (hover) => {
      g.clear();
      g.fillStyle(hover ? 0x3a3a5e : color, 0.97); g.fillRoundedRect(this.W / 2 - bw / 2, y - bh / 2, bw, bh, r);
      g.lineStyle(2, 0xd4a353, hover ? 1 : 0.6); g.strokeRoundedRect(this.W / 2 - bw / 2, y - bh / 2, bw, bh, r);
    };
    draw(false);
    const zone = this.add.zone(this.W / 2, y, bw, bh).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => { draw(true); this.tweens.add({ targets: txt, scale: 1.04, duration: 100, ease: 'Back.out' }); });
    zone.on('pointerout', () => { draw(false); this.tweens.add({ targets: txt, scale: 1, duration: 100 }); });
    zone.on('pointerdown', () => { AudioSystem.uiClick(); cb(); });
    this.panel.add(g); this.panel.add(txt); this.panel.add(zone);
    return { label: txt, g, zone };
  }

  _backButton() {
    const b = this.add.text(40, 40, '‹ 返回', { fontSize: '17px', color: '#9aa0c0' })
      .setInteractive({ useHandCursor: true });
    b.on('pointerover', () => b.setColor('#ffd24d'));
    b.on('pointerout', () => b.setColor('#9aa0c0'));
    b.on('pointerdown', () => this._showMain());
    this.panel.add(b);
  }

  // ===== 主菜单 =====
  _showMain() {
    this._clear();
    // 可爱圆角卡（衬在菜单后，包住标题+7个按钮，绝不出框）
    const cardW = 500, cardH = 470, cx = this.W / 2, cy = 355;
    const card = this.add.graphics();
    card.fillStyle(0x1a1a2c, 0.98); card.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 26);
    card.fillStyle(0xffffff, 0.04); card.fillRoundedRect(cx - cardW / 2 + 6, cy - cardH / 2 + 6, cardW - 12, cardH * 0.24, 22);
    card.lineStyle(3, 0xd4a353, 1); card.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 26);
    this.panel.add(card);
    this._title('暂 停', 130);
    const cn = CAREER_NAMES[this.career] || this.career;
    this.panel.add(this.add.text(this.W / 2, 172, `${cn} · 第${this.act}幕 ${ACT_NAMES[this.act] || ''}`, {
      fontSize: '14px', color: '#8b8bb0',
    }).setOrigin(0.5));

    let y = 216;
    this._menuButton(y, '▶  继续游戏', () => this._close()); y += 54;
    this._menuButton(y, '🌌  心象世界', () => this._enterMindscape()); y += 54;
    this._menuButton(y, '👤  角色状态', () => this._showStatus()); y += 54;
    this._menuButton(y, '🎒  物品', () => this._showItems()); y += 54;
    this._menuButton(y, '📋  任务日志', () => this._showQuests()); y += 54;
    this._menuButton(y, '⚙  设置', () => this._showSettings()); y += 54;
    this._menuButton(y, '🚪  返回职业大厅', () => {
      this._confirm('返回职业大厅？当前进度已自动存档。', () => {
        this.scene.stop(this.origin);
        this.scene.stop();
        this.scene.start('HubScene');
      });
    }, 320, 0x3a3222); y += 54;

    this.panel.add(this.add.text(this.W / 2, this.H - 24, 'ESC 继续游戏', {
      fontSize: '12px', color: '#5a5a7a',
    }).setOrigin(0.5));
  }

  // ===== 从暂停菜单进入心象世界 =====
  _enterMindscape() {
    // 暂停 WorldScene（如果还活跃），启动心象世界
    const origin = this.scene.get(this.origin);
    if (origin && origin.scene.isActive() && !origin.scene.isPaused()) {
      origin.scene.pause();
    }
    this.scene.launch('MindscapeScene', {
      stateSystem: this.stateSystem,
      returnScene: this.origin,
      monoScene: 'auto',
      freeEntry: true,
    });
    // 心象返回后回到暂停菜单
    origin.events.once('mindscapeReturn', () => {
      this.scene.stop('MindscapeScene');
      // 刷新状态（疗愈可能改了数值）
      if (this.stateSystem) this.stats = this.stateSystem.getAll();
      this._showMain();
    });
    this.scene.stop(); // 先关暂停面板，心象独占
  }

  // ===== 角色状态 =====
  _showStatus() {
    this._clear(); this.inSub = true;
    this._title('角色状态'); this._backButton();

    // 初见画像（读 localStorage profile）
    let profile = null;
    try { profile = JSON.parse(localStorage.getItem('wdwtb_profile') || 'null'); } catch (e) {}
    const cardX = this.W / 2;
    const insight = buildPauseInsight({
      profile, stats: this.stats, career: this.career, act: this.act,
      relationSummary: this.relationSummary,
    });
    if (profile) {
      this.panel.add(this.add.text(cardX, 100, `${profile.mbti || ''}  ·  ${profile.holland || ''}`, {
        fontSize: '22px', color: '#ffffff', fontStyle: 'bold', letterSpacing: 3,
      }).setOrigin(0.5));
    }
    this.panel.add(this.add.text(cardX, 128, insight.headline, {
      fontSize: '14px', color: '#ffd24d',
    }).setOrigin(0.5));
    // 测评建议 + 本局体感（初衷：局中回看「适合/喜欢」）
    this.panel.add(this.add.text(cardX, 158, insight.body, {
      fontSize: '12px', color: '#9aa0c0', align: 'center',
      wordWrap: { width: 620, useAdvancedWrap: true }, lineSpacing: 4,
    }).setOrigin(0.5, 0));

    // 8 状态条
    if (this.stats) {
      const startY = 230, rowH = 34, barW = 260, leftX = this.W / 2 - 150;
      STAT_LABELS.forEach(([key, label], i) => {
        const y = startY + i * rowH;
        const v = this.stats[key];
        const isP = key === 'passion';
        this.panel.add(this.add.text(leftX - 8, y, label, { fontSize: '14px', color: isP ? '#ffb060' : '#c8c8dc' }).setOrigin(1, 0.5));
        this.panel.add(this.add.rectangle(leftX, y, barW, 10, 0x2a2a3e).setOrigin(0, 0.5));
        const ratio = key === 'money' ? Math.min(1, v / 1000) : v / 100;
        this.panel.add(this.add.rectangle(leftX, y, barW * ratio, 10, isP ? 0xff6b3d : 0x4ec9b0).setOrigin(0, 0.5));
        this.panel.add(this.add.text(leftX + barW + 10, y, `${v}`, { fontSize: '13px', color: '#9aa0c0' }).setOrigin(0, 0.5));
      });
    } else {
      this.panel.add(this.add.text(this.W / 2, 300, '（状态数据不可用）', { fontSize: '14px', color: '#6a6a8a' }).setOrigin(0.5));
    }
  }

  // ===== 物品（真实背包 ItemSystem）=====
  _showItems() {
    this._clear(); this.inSub = true;
    this._title('物品'); this._backButton();

    // 内置固定物品（情感锚点）：绿植、期待记录（始终显示在最前）
    let plantName = '窗台的绿植';
    try { const p = JSON.parse(localStorage.getItem('wdwtb_plant') || 'null'); if (p?.name) plantName = p.name; } catch (e) {}
    const base = [
      { icon: '🪴', name: plantName, desc: '入职那天种下的小苗。它的样子，是你心里的样子。' },
      { icon: '📝', name: '职业期待记录', desc: '入职时写下的期待。结局报告会拿它和现实对照。' },
    ];
    const bag = this.itemSystem ? this.itemSystem.list() : [];
    const all = base.concat(bag);

    const cols = 4, cellW = 190, cellH = 100, startX = this.W / 2 - (cols * cellW) / 2 + cellW / 2, startY = 150;
    all.forEach((it, i) => {
      const cx = startX + (i % cols) * cellW;
      const cy = startY + Math.floor(i / cols) * (cellH + 20);
      const cell = this.add.rectangle(cx, cy, cellW - 16, cellH, 0x22223a, 0.95).setStrokeStyle(1, 0x44446a);
      this.panel.add(cell);
      this.panel.add(this.add.text(cx, cy - 26, it.icon, { fontSize: '28px' }).setOrigin(0.5));
      const label = it.count > 1 ? `${it.name} ×${it.count}` : it.name;
      this.panel.add(this.add.text(cx, cy + 6, label, { fontSize: '13px', color: '#e8e8f4', wordWrap: { width: cellW - 30, useAdvancedWrap: true }, align: 'center' }).setOrigin(0.5));
      cell.setInteractive({ useHandCursor: true }).on('pointerdown', () => this._itemDetail(it));
    });
    if (this.itemSystem && bag.length === 0) {
      this.panel.add(this.add.text(this.W / 2, startY + 160, '（背包空空——办公室的售货机/咖啡角能买到东西）', {
        fontSize: '13px', color: '#6a6a8a',
      }).setOrigin(0.5));
    }
    this.panel.add(this.add.text(this.W / 2, this.H - 30, '点击物品查看详情', { fontSize: '12px', color: '#5a5a7a' }).setOrigin(0.5));
  }

  _itemDetail(it) {
    const box = this.add.container(0, 0).setDepth(50);
    box.add(this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0x000000, 0.6).setInteractive());
    box.add(this.add.rectangle(this.W / 2, this.H / 2, 460, 260, 0x1e1e34).setStrokeStyle(2, 0xf0d68a));
    box.add(this.add.text(this.W / 2, this.H / 2 - 80, it.icon, { fontSize: '40px' }).setOrigin(0.5));
    box.add(this.add.text(this.W / 2, this.H / 2 - 30, it.name, { fontSize: '18px', color: '#ffd68a', fontStyle: 'bold' }).setOrigin(0.5));
    box.add(this.add.text(this.W / 2, this.H / 2 + 12, it.desc, { fontSize: '14px', color: '#c8c8dc', wordWrap: { width: 400, useAdvancedWrap: true }, align: 'center', lineSpacing: 6 }).setOrigin(0.5));
    // 可使用的背包物品：使用按钮（应用效果到 StateSystem）
    const usable = it.id && it.use && !it.readonly && this.itemSystem && this.stateSystem;
    if (usable) {
      const useBtn = this.add.rectangle(this.W / 2, this.H / 2 + 82, 140, 40, 0x3a5a3e)
        .setStrokeStyle(2, 0x5fbf7f).setInteractive({ useHandCursor: true });
      box.add(useBtn);
      box.add(this.add.text(this.W / 2, this.H / 2 + 82, '使用', { fontSize: '16px', color: '#e8ffe8', fontStyle: 'bold' }).setOrigin(0.5));
      useBtn.on('pointerdown', () => {
        const r = this.itemSystem.use(it.id);
        if (!r.ok) { box.destroy(true); return; }
        for (const [k, v] of Object.entries(r.effects)) this.stateSystem.change(k, v);
        this.stats = this.stateSystem.getAll();
        AudioSystem.success();
        box.destroy(true);
        this._showItems(); // 重新渲染（计数变化）
        const toast = this.add.text(this.W / 2, this.H - 60, `${it.icon} 已使用`, {
          fontSize: '16px', color: '#8bd68b', backgroundColor: '#1e2e1e', padding: { x: 12, y: 6 },
        }).setOrigin(0.5).setDepth(60);
        this.tweens.add({ targets: toast, alpha: 0, delay: 1200, duration: 400, onComplete: () => toast.destroy() });
      });
    }
    box.list[0].on('pointerdown', () => box.destroy(true));
    this.panel.add(box);
  }

  // ===== 任务日志 =====
  // 有 questSystem 时渲染真实任务列表（进行中/可接/已完成）；否则回落幕次概览。
  _showQuests() {
    this._clear(); this.inSub = true;
    this._title('任务日志'); this._backButton();

    // 无任务系统 → 回落幕次概览（向后兼容）
    if (!this.questSystem) { this._showQuestsFallback(); return; }

    const cx = this.W / 2;
    let y = 130;

    // ---- 进行中任务（含目标勾选）----
    const active = this.questSystem.active();
    this.panel.add(this.add.text(cx, y, '◆ 进行中', { fontSize: '17px', color: '#ffd68a' }).setOrigin(0.5));
    y += 30;
    if (active.length === 0) {
      this.panel.add(this.add.text(cx, y, '（暂无进行中的任务，去找头顶有 ❗ 的同事）', {
        fontSize: '13px', color: '#7a7a9a',
      }).setOrigin(0.5));
      y += 26;
    } else {
      for (const q of active) {
        const ready = this.questSystem.isReady(q.id);
        this.panel.add(this.add.text(cx, y, `${ready ? '✓' : '▸'} ${q.title}${ready ? '（可交付）' : ''}`, {
          fontSize: '15px', color: ready ? '#7eff7e' : '#e8e8f4', fontStyle: 'bold',
        }).setOrigin(0.5));
        y += 22;
        // 目标勾选清单
        const prog = this.questSystem.accepted[q.id];
        for (const o of (q.objectives || [])) {
          const oDone = prog && prog.objectives[o.id];
          this.panel.add(this.add.text(cx, y, `   ${oDone ? '☑' : '☐'} ${o.text}`, {
            fontSize: '13px', color: oDone ? '#8bd68b' : '#a8a8c0',
          }).setOrigin(0.5));
          y += 19;
        }
        y += 8;
      }
    }

    // ---- 可接任务 ----
    const avail = this.questSystem.available({ act: this.act });
    if (avail.length > 0) {
      y += 6;
      this.panel.add(this.add.text(cx, y, '◇ 可接取', { fontSize: '15px', color: '#8b8bb0' }).setOrigin(0.5));
      y += 26;
      for (const q of avail) {
        this.panel.add(this.add.text(cx, y, `· ${q.title}（找 ${this._npcName(q.giver)}）`, {
          fontSize: '13px', color: '#9a9ac0',
        }).setOrigin(0.5));
        y += 20;
      }
    }

    // ---- 已完成计数 ----
    const doneCount = this.questSystem.done().length;
    if (doneCount > 0) {
      y += 10;
      this.panel.add(this.add.text(cx, y, `✓ 已完成 ${doneCount} 个任务`, {
        fontSize: '13px', color: '#7a9a7a',
      }).setOrigin(0.5));
    }
  }

  // NPC id → 显示名（任务给取者提示用；覆盖各职业名册常用 id）
  _npcName(id) {
    const map = {
      senior: '导师', peer: '同事', vet: '前辈',
      // 程序员
      zhao: '小赵', lin: '小林', ting: '婷婷',
      // 产品
      dev: '研发', data: '数据', ops: '运营',
      // 行政
      teach: '教务', fin: '财务', stu: '学工',
      // 设计/运营
      pm: '产品', design: '设计',
      // 教师
      parent: '家长', admin: '行政',
      // 医护
      lab: '检验', pharm: '药房',
      // 公务员
      archive: '档案', legal: '法制',
      // 销售
      sol: '售前', cs: '客成',
      // 律师
      corp: '公司组', clerk: '书记员',
    };
    return map[id] || '同事';
  }

  // 回落：无任务系统时的幕次概览（保留原逻辑）
  _showQuestsFallback() {
    const cn = CAREER_NAMES[this.career] || this.career;
    const goalByAct = {
      1: `熟悉「${cn}」的第一天：见导师、领工位、种下绿植、写下给自己的信。`,
      2: '上手第一份真正的工作，在成就与代价之间找到自己的节奏。',
      3: '在无止境的消耗里，守住那点还没熄灭的东西。',
      4: '走过至暗时刻——看清自己真正承受得住什么。',
      5: '做出属于你的抉择，认出那个本来的你。',
    };
    const y0 = 140;
    this.panel.add(this.add.text(this.W / 2, y0, '◆ 当前目标', { fontSize: '16px', color: '#ffd68a' }).setOrigin(0.5));
    this.panel.add(this.add.text(this.W / 2, y0 + 34, goalByAct[this.act] || '继续你的职场故事。', {
      fontSize: '15px', color: '#e8e8f4', wordWrap: { width: 620, useAdvancedWrap: true }, align: 'center', lineSpacing: 8,
    }).setOrigin(0.5));
    this.panel.add(this.add.text(this.W / 2, y0 + 110, '◇ 已经走过', { fontSize: '15px', color: '#8b8bb0' }).setOrigin(0.5));
    let done = '';
    for (let a = 1; a < this.act; a++) done += `· 第${a}幕 ${ACT_NAMES[a]}\n`;
    this.panel.add(this.add.text(this.W / 2, y0 + 140, done || '（这才刚刚开始）', {
      fontSize: '13px', color: '#7a7a9a', align: 'center', lineSpacing: 6,
    }).setOrigin(0.5, 0));
  }

  // ===== 设置 =====
  _showSettings() {
    this._clear(); this.inSub = true;
    this._title('设置'); this._backButton();

    let settings = { bgm: 70, sfx: 80 };
    try { settings = { ...settings, ...JSON.parse(localStorage.getItem('wdwtb_settings') || '{}') }; } catch (e) {}
    const save = () => { try { localStorage.setItem('wdwtb_settings', JSON.stringify(settings)); } catch (e) {} };

    const slider = (y, label, key) => {
      this.panel.add(this.add.text(this.W / 2 - 200, y, label, { fontSize: '16px', color: '#c8c8dc' }).setOrigin(0, 0.5));
      const trackX = this.W / 2 - 40, trackW = 200;
      this.panel.add(this.add.rectangle(trackX, y, trackW, 6, 0x2a2a3e).setOrigin(0, 0.5));
      const fill = this.add.rectangle(trackX, y, trackW * settings[key] / 100, 6, 0x4ec9b0).setOrigin(0, 0.5);
      const knob = this.add.circle(trackX + trackW * settings[key] / 100, y, 9, 0xf0d68a).setInteractive({ useHandCursor: true, draggable: true });
      this.panel.add(fill); this.panel.add(knob);
      const valTxt = this.add.text(trackX + trackW + 20, y, `${settings[key]}`, { fontSize: '14px', color: '#9aa0c0' }).setOrigin(0, 0.5);
      this.panel.add(valTxt);
      this.input.setDraggable(knob);
      knob.on('drag', (p, dx) => {
        const nx = Phaser.Math.Clamp(dx, trackX, trackX + trackW);
        knob.x = nx;
        const val = Math.round((nx - trackX) / trackW * 100);
        settings[key] = val; fill.width = trackW * val / 100; valTxt.setText(`${val}`);
        AudioSystem.setVolume(key, val); // 实时生效，边拖边听
        save();
      });
      // 松手时给一声反馈（sfx 滑块能立刻听到新音量）
      knob.on('dragend', () => { if (key === 'sfx') AudioSystem.uiClick(); });
    };
    slider(180, '背景音乐', 'bgm');
    slider(230, '音效', 'sfx');

    // 文字速度（对话打字机）：慢/中/快 三档循环
    const SPEED_NAMES = ['慢', '中', '快(瞬显)'];
    const speedVal = () => settings.textSpeed ?? 1;
    const speedBtn = this._menuButton(290, '', () => {
      settings.textSpeed = (speedVal() + 1) % 3; save();
      speedBtn.label.setText(`💬  文字速度：${SPEED_NAMES[speedVal()]}`);
    }, 300);
    speedBtn.label.setText(`💬  文字速度：${SPEED_NAMES[speedVal()]}`);

    // 全屏切换
    this._menuButton(345, '⛶  全屏 / 退出全屏', () => {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
    }, 300);

    // 辅助模式（Celeste 式）：开启后负面状态消耗减半，让任何人都能走到结局
    const assistOn = () => !!settings.assist;
    const assistBtn = this._menuButton(400, '', () => {
      settings.assist = !settings.assist; save();
      assistBtn.label.setText(`💗  叙事辅助：${assistOn() ? '开' : '关'}（减轻状态消耗）`);
    }, 300, assistOn() ? 0x2a4436 : 0x2a2a3e);
    assistBtn.label.setText(`💗  叙事辅助：${assistOn() ? '开' : '关'}（减轻状态消耗）`);

    // 返回标题（确认）
    this._menuButton(455, '🏠  返回标题', () => {
      this._confirm('确定返回标题？当前进度会保留在存档。', () => {
        this.scene.stop(this.origin);
        this.scene.stop();
        this.scene.start('TitleScene');
      });
    }, 300, 0x442a2a);
  }

  _confirm(msg, onYes) {
    const box = this.add.container(0, 0).setDepth(60);
    box.add(this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0x000000, 0.7).setInteractive());
    box.add(this.add.rectangle(this.W / 2, this.H / 2, 440, 180, 0x1e1e34).setStrokeStyle(2, 0xf0d68a));
    box.add(this.add.text(this.W / 2, this.H / 2 - 40, msg, { fontSize: '15px', color: '#e8e8f4', wordWrap: { width: 380, useAdvancedWrap: true }, align: 'center' }).setOrigin(0.5));
    const yes = this.add.rectangle(this.W / 2 - 90, this.H / 2 + 40, 140, 40, 0x3a5a3e).setInteractive({ useHandCursor: true });
    const no = this.add.rectangle(this.W / 2 + 90, this.H / 2 + 40, 140, 40, 0x442a2a).setInteractive({ useHandCursor: true });
    box.add(yes); box.add(no);
    box.add(this.add.text(this.W / 2 - 90, this.H / 2 + 40, '确定', { fontSize: '15px', color: '#e8ffe8' }).setOrigin(0.5));
    box.add(this.add.text(this.W / 2 + 90, this.H / 2 + 40, '取消', { fontSize: '15px', color: '#ffd8d8' }).setOrigin(0.5));
    yes.on('pointerdown', () => { box.destroy(true); onYes(); });
    no.on('pointerdown', () => box.destroy(true));
    this.panel.add(box);
  }

  // ===== 关闭并恢复 =====
  _close() {
    AudioSystem.duck(false); // 恢复 BGM 音量
    this.scene.stop();
    this.scene.resume(this.origin);
  }
}
