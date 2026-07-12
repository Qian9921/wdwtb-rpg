import Phaser from 'phaser';
import { Juice } from './JuiceKit.js';

// StatusBarUI：状态 HUD——参考星露谷"平时极简、按需展开"理念。
// 迷你态（默认）：左上角一条紧凑横条，8 状态浓缩为色块小条，不挡视野。
// 展开态：Tab 键或鼠标悬停迷你条 → 展开完整面板（标签+进度条+数值）。
// 对话进行中自动降透明度，进一步让出画面。
const GROUPS = [
  { name: '生理', stats: [
    { key: 'health', label: '健康', desc: '身体本钱。熬夜加班会掉，归零会强制休息。' },
    { key: 'energy', label: '精力', desc: '当天的干活额度。低于15做不了工作，休息回血。' },
  ] },
  { name: '心理', stats: [
    { key: 'san', label: '心态', desc: '心理状态。被否定/委屈会掉，聊天、心象世界能回。' },
    { key: 'stress', label: '压力', desc: '越高越容易出错——≥70 时工作产出打8折。' },
  ] },
  { name: '职业', stats: [
    { key: 'skill', label: '技能', desc: '越练越高，缩短工作用时、提升产出质量。' },
    { key: 'performance', label: '绩效', desc: '工作成果的评分，决定工资与结局走向。' },
    { key: 'money', label: '金钱', desc: '工资=底薪+当日绩效，下班日报时到账。' },
  ] },
  { name: '内在', stats: [
    { key: 'passion', label: '热情', desc: '你对这份工作的喜欢程度——判断"适不适合"最关键的信号。' },
  ] },
];
const ORDER = GROUPS.flatMap(g => g.stats); // 迷你条顺序 = 面板顺序

// —— 迷你条布局（1920 屏尺度）——
// 8 个状态挤在窄横条里会糊，故加宽色块+加大间距+下移避开顶部，单字标签有呼吸空间。
const MINI_X = 18, MINI_Y = 20;
const MINI_BAR_W = 42, MINI_BAR_H = 10, MINI_GAP = 12;
const MINI_PAD = 14;

// —— 展开面板布局（1920 尺度）——
const PANEL_X = 14, PANEL_Y = 14, PANEL_W = 372, PAD = 18;
const TITLE_H = 26, ROW_H = 52, GROUP_GAP = 10;
const LABEL_X = PANEL_X + PAD;
const BAR_X = LABEL_X + 64;
const BAR_WIDTH = 168, BAR_HEIGHT = 14;
const VALUE_X = BAR_X + BAR_WIDTH + 12;

const FILL_COLOR = 0x4ec9b0;
const BG_COLOR = 0x2a2a3a;
const PASSION_COLOR = 0xff6b3d;
const WARN_COLOR = 0xe05555;    // 危险值(≤25 或压力≥75)迷你条变红提醒
const TEXT_RES = 2;

export class StatusBarUI {
  constructor(scene, stateSystem) {
    this.scene = scene;
    this.state = stateSystem;
    this.rows = {};       // 展开面板行
    this.miniFills = {};  // 迷你条填充
    this._dangerTweens = {}; // 危险状态迷你条脉冲 tween（key → tween）
    this.expanded = false;
    this._prevValues = stateSystem.getAll(); // 飘字用：记录上次值，算 delta

    this._buildMini();
    this._buildPanel();
    this._setExpanded(false);

    // Tab 切换展开/收起（Tab 默认会切浏览器焦点，禁掉）
    this.tabKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
    scene.input.keyboard.on('keydown-TAB', (e) => {
      e.preventDefault();
      this._setExpanded(!this.expanded);
    });

    stateSystem.on('change', (key, value) => {
      // key=null 表示 restore 批量恢复（StateSystem），刷新所有行
      if (key === null) { ORDER.forEach(s => this._updateRow(s.key, this.state.get(s.key))); return; }
      // 飘字反馈：数值变化时显示 +5/-3 浮起（数值驱动 RPG 的核心手感）
      const prev = this._prevValues[key];
      this._prevValues[key] = value;
      if (prev != null && typeof prev === 'number' && value !== prev) {
        this._floatStat(key, value - prev);
      }
      this._updateRow(key, value);
    });
  }

  // ---------- 迷你态：一块小横条 ----------
  _buildMini() {
    const n = ORDER.length;
    const w = MINI_PAD * 2 + n * MINI_BAR_W + (n - 1) * MINI_GAP;
    const h = MINI_PAD * 2 + MINI_BAR_H + 22; // 22 = 小标签行
    this.mini = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(9998);

    const bg = this.scene.add.rectangle(MINI_X, MINI_Y, w, h, 0x14141f, 0.75)
      .setOrigin(0, 0).setStrokeStyle(2, 0x3a3a4e, 0.9)
      .setInteractive({ useHandCursor: true });
    this.mini.add(bg);
    // 点击展开，移出面板收起（原悬停即弹的巨面板会挡住办公室左上区，改为主动点击才展开）
    bg.on('pointerdown', () => this._setExpanded(!this.expanded));

    ORDER.forEach((s, i) => {
      const x = MINI_X + MINI_PAD + i * (MINI_BAR_W + MINI_GAP);
      const y = MINI_Y + MINI_PAD + 18;
      // 单字标签（健/精/心/压/技/绩/金/热）——加大字号,窄条里也看得清
      this.mini.add(this.scene.add.text(x + MINI_BAR_W / 2, MINI_Y + MINI_PAD + 1, s.label[0], {
        fontSize: '18px', color: s.key === 'passion' ? '#ffb080' : '#c0c0d0',
        stroke: '#0a0a14', strokeThickness: 3,
      }).setOrigin(0.5, 0).setResolution(TEXT_RES));
      this.mini.add(this.scene.add.rectangle(x, y, MINI_BAR_W, MINI_BAR_H, BG_COLOR).setOrigin(0, 0));
      const fill = this.scene.add.rectangle(x, y, this._ratio(s.key) * MINI_BAR_W, MINI_BAR_H,
        this._miniColor(s.key)).setOrigin(0, 0);
      this.mini.add(fill);
      this.miniFills[s.key] = fill;
    });
    // 展开提示
    this.mini.add(this.scene.add.text(MINI_X + w + 10, MINI_Y + 14, 'Tab', {
      fontSize: '16px', color: '#6a6a7e',
    }).setResolution(TEXT_RES));
  }

  // ---------- 展开态：完整面板 ----------
  _buildPanel() {
    this.panel = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(9998);
    const panelH = this._measureHeight();
    // 背景改为 0.9 半透明（原 0.97 近乎不透明）：展开时底下的 NPC/名牌仍能隐约看到，
    // 不会像之前那样把左上区完全"糊死"。
    const bg = this.scene.add.rectangle(PANEL_X, PANEL_Y, PANEL_W, panelH, 0x14141f, 0.9)
      .setOrigin(0, 0).setStrokeStyle(2, 0xd4a353, 0.6)
      .setInteractive();
    this.panel.add(bg);
    bg.on('pointerout', () => this._setExpanded(false)); // 移出面板自动收回

    let y = PANEL_Y + PAD;
    for (const group of GROUPS) {
      this.panel.add(this.scene.add.text(LABEL_X, y, group.name, {
        fontSize: '18px', color: '#8a8a9e',
      }).setResolution(TEXT_RES));
      y += TITLE_H;

      for (const s of group.stats) {
        const isPassion = s.key === 'passion';
        const value = this.state.get(s.key);
        const barCY = y + 12; // 上半行：标签+条+值

        this.panel.add(this.scene.add.text(LABEL_X, barCY, s.label, {
          fontSize: '20px',
          color: isPassion ? '#ffd6a0' : '#d8d8e2',
          fontStyle: isPassion ? 'bold' : 'normal',
        }).setOrigin(0, 0.5).setResolution(TEXT_RES));

        this.panel.add(this.scene.add.rectangle(BAR_X, barCY, BAR_WIDTH, BAR_HEIGHT, BG_COLOR).setOrigin(0, 0.5));
        const fill = this.scene.add.rectangle(BAR_X, barCY, this._ratio(s.key) * BAR_WIDTH, BAR_HEIGHT,
          isPassion ? PASSION_COLOR : FILL_COLOR).setOrigin(0, 0.5);
        this.panel.add(fill);

        const valText = this.scene.add.text(VALUE_X, barCY, `${value}`, {
          fontSize: '19px', color: '#f0f0f4',
        }).setOrigin(1, 0.5).setResolution(TEXT_RES);
        this.panel.add(valText);

        // 下半行：这项状态的详细说明（每项都讲清楚）
        if (s.desc) {
          this.panel.add(this.scene.add.text(LABEL_X, y + 28, s.desc, {
            fontSize: '12px', color: '#7f8398',
            wordWrap: { width: PANEL_W - PAD * 2 - (LABEL_X - PANEL_X - PAD), useAdvancedWrap: true }, lineSpacing: 2,
          }).setOrigin(0, 0).setResolution(TEXT_RES));
        }

        this.rows[s.key] = { text: valText, fill };
        y += ROW_H;
      }
      y += GROUP_GAP;
    }
    this.panel.add(this.scene.add.text(PANEL_X + PANEL_W - 12, PANEL_Y + 10, 'Tab 收起', {
      fontSize: '16px', color: '#6a6a7e',
    }).setOrigin(1, 0).setResolution(TEXT_RES));
    this.panel.add(this.scene.add.text(LABEL_X, y - GROUP_GAP + 2, '这些数值会影响你的工作产出与结局走向', {
      fontSize: '13px', color: '#6a6a82',
    }).setResolution(TEXT_RES));
  }

  _setExpanded(on) {
    this.expanded = on;
    this.mini.setVisible(!on);
    this.panel.setVisible(on);
    // 通知外部(WorldScene):展开的大面板会盖住左上任务指引,让它暂时避让(Q2重叠修复)
    if (typeof this.onExpandChange === 'function') this.onExpandChange(on);
  }

  // 对话/演出时调用：整个 HUD 让路（半透明）；结束恢复
  setDimmed(dim) {
    const a = dim ? 0.25 : 1;
    this.mini.setAlpha(a);
    this.panel.setAlpha(a);
  }

  _ratio(key) {
    const v = this.state.get(key);
    return Phaser.Math.Clamp((key === 'money' ? v / 1000 : v / 100), 0, 1);
  }

  // 迷你条颜色：热情橙色；危险状态红色（低于25 或 压力高于75）
  _miniColor(key) {
    const v = this.state.get(key);
    if (key === 'stress' && v >= 75) return WARN_COLOR;
    if (key !== 'stress' && key !== 'money' && v <= 25) return WARN_COLOR;
    return key === 'passion' ? PASSION_COLOR : FILL_COLOR;
  }

  _measureHeight() {
    let y = PAD;
    for (const g of GROUPS) y += TITLE_H + g.stats.length * ROW_H + GROUP_GAP;
    return y - GROUP_GAP + PAD + 4;
  }

  _updateRow(key, value) {
    const row = this.rows[key];
    if (row) {
      row.text.setText(`${value}`);
      row.fill.setSize(this._ratio(key) * BAR_WIDTH, BAR_HEIGHT);
    }
    const mf = this.miniFills[key];
    if (mf) {
      mf.setSize(this._ratio(key) * MINI_BAR_W, MINI_BAR_H);
      mf.setFillStyle(this._miniColor(key));
      this._updateDangerPulse(key, mf);
    }
  }

  // 危险状态（≤25 或压力≥75）迷你条闪烁脉冲；回到安全区停止并恢复不透明
  _updateDangerPulse(key, fill) {
    const v = this.state.get(key);
    const danger = key === 'stress' ? v >= 75 : (key !== 'money' && v <= 25);
    const tween = this._dangerTweens[key];
    if (danger && !tween) {
      this._dangerTweens[key] = this.scene.tweens.add({
        targets: fill, alpha: 0.35, duration: 500, yoyo: true, repeat: -1,
      });
    } else if (!danger && tween) {
      tween.stop();
      delete this._dangerTweens[key];
      fill.setAlpha(1);
    }
  }

  // 飘字：状态变化时在迷你条上方浮起 +5/-3。delta 正绿负红。
  // 钉屏 + UI 相机坐标（屏幕左上角迷你条位置）。money delta 可能很大，截断显示。
  _floatStat(key, delta) {
    if (delta === 0 || !this.scene?.add?.text) return;
    const idx = ORDER.findIndex(s => s.key === key);
    if (idx < 0) return;
    const x = MINI_X + MINI_PAD + idx * (MINI_BAR_W + MINI_GAP) + MINI_BAR_W / 2;
    const y = MINI_Y - 4;
    const sign = delta > 0 ? '+' : '';
    const txt = Math.abs(delta) > 999 ? `${sign}${delta > 0 ? '↑' : '↓'}` : `${sign}${delta}`;
    const color = delta > 0 ? '#6aaa6a' : '#e8735a';
    Juice.floatText(this.scene, x, y, txt, color);
  }
}
