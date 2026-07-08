import Phaser from 'phaser';

// StatusBarUI：左上角 8 项状态 HUD。
// 引擎共用 UI 模块，数值来自 StateSystem，监听 'change' 实时刷新。
// 设计：半透明背景面板 + 每行「标签 · 进度条 · 数值」对齐；文字 resolution:2 保证清晰。
const GROUPS = [
  {
    name: '生理',
    stats: [
      { key: 'health', label: '健康' },
      { key: 'energy', label: '精力' },
    ],
  },
  {
    name: '心理',
    stats: [
      { key: 'san', label: '心态' },
      { key: 'stress', label: '压力' },
    ],
  },
  {
    name: '职业',
    stats: [
      { key: 'skill', label: '技能' },
      { key: 'performance', label: '绩效' },
      { key: 'money', label: '金钱' },
    ],
  },
  {
    name: '内在',
    stats: [
      { key: 'passion', label: '热情' },
    ],
  },
];

// —— 面板与行的布局常量（设计分辨率 960×540 下）——
const PANEL_X = 8;
const PANEL_Y = 8;
const PANEL_W = 184;
const PAD = 10;          // 面板内边距
const TITLE_H = 15;      // 组标题行高
const ROW_H = 17;        // 状态行行高
const GROUP_GAP = 6;     // 组间空隙
const LABEL_X = PANEL_X + PAD;           // 标签左边缘 = 18
const BAR_X = LABEL_X + 36;              // 进度条左边缘 = 54（标签固定占 36px）
const BAR_WIDTH = 92;
const BAR_HEIGHT = 8;
const VALUE_X = BAR_X + BAR_WIDTH + 6;   // 数值右对齐到面板右内缘

const FILL_COLOR = 0x4ec9b0;   // 普通状态填充：青绿
const BG_COLOR = 0x2a2a3a;     // 进度条底条：深灰
const PASSION_COLOR = 0xff6b3d;// 热情填充：醒目橙红
const TEXT_RES = 2;            // 文字分辨率倍数：抗糊

export class StatusBarUI {
  constructor(scene, stateSystem) {
    this.scene = scene;
    this.state = stateSystem;
    this.rows = {};

    // 先算出面板总高（一次干跑），再画背景板置于最底，内容压其上。
    const panelH = this._measureHeight();
    this.scene.add
      .rectangle(PANEL_X, PANEL_Y, PANEL_W, panelH, 0x14141f, 0.85)
      .setOrigin(0, 0).setStrokeStyle(1, 0x3a3a4e, 0.9)
      .setScrollFactor(0).setDepth(9997);

    let y = PANEL_Y + PAD;
    for (const group of GROUPS) {
      // 组标题
      this.scene.add.text(LABEL_X, y, group.name, {
        fontSize: '11px', color: '#8a8a9e',
      }).setResolution(TEXT_RES).setScrollFactor(0).setDepth(9998);
      y += TITLE_H;

      for (const s of group.stats) {
        const isPassion = s.key === 'passion';
        const value = stateSystem.get(s.key);
        const barCY = y + ROW_H / 2 - 1;

        // 标签（左对齐，固定宽度区）
        this.scene.add.text(LABEL_X, barCY, s.label, {
          fontSize: '12px',
          color: isPassion ? '#ffd6a0' : '#d8d8e2',
          fontStyle: isPassion ? 'bold' : 'normal',
        }).setOrigin(0, 0.5).setResolution(TEXT_RES).setScrollFactor(0).setDepth(9998);

        // 进度条：底条 + 填充条，左对齐（origin 0,0.5）
        this.scene.add.rectangle(BAR_X, barCY, BAR_WIDTH, BAR_HEIGHT, BG_COLOR)
          .setOrigin(0, 0.5).setScrollFactor(0).setDepth(9998);
        const fill = this.scene.add
          .rectangle(BAR_X, barCY, this._fillWidth(s.key, value), BAR_HEIGHT,
            isPassion ? PASSION_COLOR : FILL_COLOR)
          .setOrigin(0, 0.5).setScrollFactor(0).setDepth(9999);

        // 数值（右对齐到进度条右端）
        const valText = this.scene.add.text(VALUE_X, barCY, `${value}`, {
          fontSize: '11px', color: '#f0f0f4',
        }).setOrigin(1, 0.5).setResolution(TEXT_RES).setScrollFactor(0).setDepth(9998);

        this.rows[s.key] = { text: valText, fill, label: s.label };
        y += ROW_H;
      }
      y += GROUP_GAP;
    }

    // 监听数值变化，实时刷新对应行
    stateSystem.on('change', (key, value) => this._updateRow(key, value));
  }

  // 干跑一遍累加高度（与构造函数布局逻辑一致），用于背景板尺寸
  _measureHeight() {
    let y = PAD;
    for (const group of GROUPS) {
      y += TITLE_H;
      y += group.stats.length * ROW_H;
      y += GROUP_GAP;
    }
    return y - GROUP_GAP + PAD + 4; // 去掉最后一组多加的空隙，补底部内边距（+4 余量防末行溢出）
  }

  // 填充宽度：普通项 value/100，money value/1000 且不超过满格
  _fillWidth(key, value) {
    const ratio = key === 'money' ? value / 1000 : value / 100;
    return Phaser.Math.Clamp(ratio * BAR_WIDTH, 0, BAR_WIDTH);
  }

  _updateRow(key, value) {
    const row = this.rows[key];
    if (!row) return;
    row.text.setText(`${value}`);
    // setSize 改宽，origin (0,0.5) 保持左边缘固定，从左侧伸缩
    row.fill.setSize(this._fillWidth(key, value), BAR_HEIGHT);
  }
}
