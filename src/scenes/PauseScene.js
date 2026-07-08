import Phaser from 'phaser';
import { AudioSystem } from '../systems/AudioSystem.js';

// PauseScene — 暂停菜单覆盖场景（完整像素 RPG 标配）
// 由 WorldScene 通过 scene.launch('PauseScene', { origin, stateSystem, career, act }) 唤起，
// WorldScene 先 scene.pause()。本场景半透明覆盖其上，ESC/继续 关闭并 resume。
// 面板：主菜单 / 角色状态 / 物品 / 任务日志 / 设置。
const CAREER_NAMES = {
  programmer: '程序员', product: '产品经理', admin: '高校行政',
  designer: '设计师', operation: '运营', teacher: '教师',
  doctor: '医生/护士', civilservant: '公务员', sales: '销售', lawyer: '律师',
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
  }

  create() {
    const { width: W, height: H } = this.scale;
    this.W = W; this.H = H;
    AudioSystem.duck(true); // 菜单打开压低 BGM
    // 半透明遮罩（吃掉底层点击）
    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0a12, 0.82).setInteractive();
    // 面板容器（切换用）
    this.panel = this.add.container(0, 0);
    this._showMain();

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

  _menuButton(y, label, cb, w = 320, color = 0x2a2a44) {
    const btn = this.add.rectangle(this.W / 2, y, w, 46, color, 0.95)
      .setStrokeStyle(1, 0x5a5a8a).setInteractive({ useHandCursor: true });
    const txt = this.add.text(this.W / 2, y, label, { fontSize: '18px', color: '#e8e8f4' }).setOrigin(0.5);
    btn.on('pointerover', () => btn.setFillStyle(0x3a3a5e));
    btn.on('pointerout', () => btn.setFillStyle(color));
    btn.on('pointerdown', () => { AudioSystem.uiClick(); cb(); });
    this.panel.add(btn); this.panel.add(txt);
    return btn;
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
    this._title('暂 停', 130);
    const cn = CAREER_NAMES[this.career] || this.career;
    this.panel.add(this.add.text(this.W / 2, 172, `${cn} · 第${this.act}幕 ${ACT_NAMES[this.act] || ''}`, {
      fontSize: '14px', color: '#8b8bb0',
    }).setOrigin(0.5));

    let y = 230;
    this._menuButton(y, '▶  继续游戏', () => this._close()); y += 58;
    this._menuButton(y, '👤  角色状态', () => this._showStatus()); y += 58;
    this._menuButton(y, '🎒  物品', () => this._showItems()); y += 58;
    this._menuButton(y, '📋  任务日志', () => this._showQuests()); y += 58;
    this._menuButton(y, '⚙  设置', () => this._showSettings()); y += 58;

    this.panel.add(this.add.text(this.W / 2, this.H - 24, 'ESC 继续游戏', {
      fontSize: '12px', color: '#5a5a7a',
    }).setOrigin(0.5));
  }

  // ===== 角色状态 =====
  _showStatus() {
    this._clear(); this.inSub = true;
    this._title('角色状态'); this._backButton();

    // 初见画像（读 localStorage profile）
    let profile = null;
    try { profile = JSON.parse(localStorage.getItem('wdwtb_profile') || 'null'); } catch (e) {}
    const cardX = this.W / 2;
    if (profile) {
      this.panel.add(this.add.text(cardX, 108, `${profile.mbti || ''}  ·  ${profile.holland || ''}`, {
        fontSize: '24px', color: '#ffffff', fontStyle: 'bold', letterSpacing: 3,
      }).setOrigin(0.5));
      const cn = CAREER_NAMES[this.career] || this.career;
      this.panel.add(this.add.text(cardX, 138, `现在的你：${cn} · 第${this.act}幕`, {
        fontSize: '14px', color: '#9aa0c0',
      }).setOrigin(0.5));
    }

    // 8 状态条
    if (this.stats) {
      const startY = 180, rowH = 34, barW = 260, leftX = this.W / 2 - 150;
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

  // ===== 物品 =====
  _showItems() {
    this._clear(); this.inSub = true;
    this._title('物品'); this._backButton();

    let items = [];
    try { items = JSON.parse(localStorage.getItem('wdwtb_items') || '[]'); } catch (e) {}
    // 内置固定物品（情感锚点）：绿植、信
    let plantName = '窗台的绿植';
    try { const p = JSON.parse(localStorage.getItem('wdwtb_plant') || 'null'); if (p?.name) plantName = p.name; } catch (e) {}
    const base = [
      { icon: '🪴', name: plantName, desc: '入职那天种下的小苗。它的样子，是你心里的样子。' },
      { icon: '✉️', name: '给一年后自己的信', desc: '封存中。你会在故事的尽头，重新读到它。' },
    ];
    const all = base.concat(items);

    const cols = 4, cellW = 190, cellH = 100, startX = this.W / 2 - (cols * cellW) / 2 + cellW / 2, startY = 150;
    all.forEach((it, i) => {
      const cx = startX + (i % cols) * cellW;
      const cy = startY + Math.floor(i / cols) * (cellH + 20);
      const cell = this.add.rectangle(cx, cy, cellW - 16, cellH, 0x22223a, 0.95).setStrokeStyle(1, 0x44446a);
      this.panel.add(cell);
      this.panel.add(this.add.text(cx, cy - 26, it.icon, { fontSize: '28px' }).setOrigin(0.5));
      this.panel.add(this.add.text(cx, cy + 6, it.name, { fontSize: '13px', color: '#e8e8f4', wordWrap: { width: cellW - 30, useAdvancedWrap: true }, align: 'center' }).setOrigin(0.5));
      cell.setInteractive({ useHandCursor: true }).on('pointerdown', () => this._itemDetail(it));
    });
    this.panel.add(this.add.text(this.W / 2, this.H - 30, '点击物品查看详情', { fontSize: '12px', color: '#5a5a7a' }).setOrigin(0.5));
  }

  _itemDetail(it) {
    const box = this.add.container(0, 0).setDepth(50);
    box.add(this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0x000000, 0.6).setInteractive());
    box.add(this.add.rectangle(this.W / 2, this.H / 2, 460, 220, 0x1e1e34).setStrokeStyle(2, 0xf0d68a));
    box.add(this.add.text(this.W / 2, this.H / 2 - 60, it.icon, { fontSize: '40px' }).setOrigin(0.5));
    box.add(this.add.text(this.W / 2, this.H / 2 - 10, it.name, { fontSize: '18px', color: '#ffd68a', fontStyle: 'bold' }).setOrigin(0.5));
    box.add(this.add.text(this.W / 2, this.H / 2 + 36, it.desc, { fontSize: '14px', color: '#c8c8dc', wordWrap: { width: 400, useAdvancedWrap: true }, align: 'center', lineSpacing: 6 }).setOrigin(0.5));
    box.setInteractive = null;
    box.list[0].on('pointerdown', () => box.destroy(true));
    this.panel.add(box);
  }

  // ===== 任务日志 =====
  _showQuests() {
    this._clear(); this.inSub = true;
    this._title('任务日志'); this._backButton();

    const cn = CAREER_NAMES[this.career] || this.career;
    // 当前幕目标（按职业+幕次概括）
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

    // 已完成的幕
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

    // 全屏切换
    this._menuButton(300, '⛶  全屏 / 退出全屏', () => {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
    }, 300);

    // 返回标题（确认）
    this._menuButton(360, '🏠  返回标题', () => {
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
