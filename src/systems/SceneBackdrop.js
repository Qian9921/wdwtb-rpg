import Phaser from 'phaser';

// SceneBackdrop：程序化场景背景系统——让剧情演到的不同地点真的"看起来不一样"。
// 对话演到通勤/大堂/家/医院等非办公室场景时，盖一张程序化绘制的全屏场景画面，
// 把办公室俯视地图遮住；回到办公室场景时移除，露出地图。用 Phaser Graphics 画，零新美术。
//
// 钉屏 + UI 相机层，depth 在办公室世界之上(700)、对话框之下(10000)。
//
// 用法：
//   this.backdrop = new SceneBackdrop(this);
//   this.backdrop.show('street_morning');  // 切到街道晨景
//   this.backdrop.show('office');          // 回办公室（自动移除盖层）

// 哪些 bg 是"办公室内"——这些不盖场景（玩家本就在办公室地图上），只由滤镜叠色。
const OFFICE_BGS = new Set(['office', 'office_day', 'office_night', 'office_996', 'office_corridor']);

export class SceneBackdrop {
  constructor(scene) {
    this.scene = scene;
    this.container = null;
    this.currentBg = null;
    this.SW = scene.scale.width;
    this.SH = scene.scale.height;
  }

  // 切换到某场景。办公室类 bg → 移除盖层；其余 → 画对应场景并淡入。
  show(bgKey) {
    if (bgKey === this.currentBg) return;
    this.currentBg = bgKey;
    if (!bgKey || OFFICE_BGS.has(bgKey)) { this.hide(); return; }

    this._clear();
    const c = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(700);
    this.container = c;
    // 各场景绘制分派
    const draw = {
      street_morning: () => this._street(c),
      office_lobby: () => this._lobby(c),
      lobby: () => this._lobby(c),
      home: () => this._home(c),
      apartment_night: () => this._apartment(c),
      hospital: () => this._hospital(c),
      pantry: () => this._pantry(c),
      window: () => this._window(c),
      desk: () => this._desk(c),
    }[bgKey] || (() => this._generic(c, bgKey));
    draw();

    if (typeof this.scene.attachToUICamera === 'function') this.scene.attachToUICamera(c);
    c.setAlpha(0);
    this.scene.tweens.add({ targets: c, alpha: 1, duration: 500, ease: 'Sine.inOut' });
  }

  hide() {
    if (!this.container) return;
    const c = this.container; this.container = null;
    this.scene.tweens.add({
      targets: c, alpha: 0, duration: 400,
      onComplete: () => c.destroy(true),
    });
  }

  _clear() {
    if (this.container) { this.container.destroy(true); this.container = null; }
  }

  destroy() { this._clear(); }

  // ---- 绘制工具 ----
  _rect(c, x, y, w, h, color, alpha = 1) {
    c.add(this.scene.add.rectangle(x, y, w, h, color, alpha).setOrigin(0, 0));
    return c;
  }
  // 竖直渐变（用多条横带模拟）
  _vGradient(c, x, y, w, h, topColor, botColor, steps = 24) {
    const tr = (topColor >> 16) & 255, tg = (topColor >> 8) & 255, tb = topColor & 255;
    const br = (botColor >> 16) & 255, bg = (botColor >> 8) & 255, bb = botColor & 255;
    const bandH = h / steps;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const r = Math.round(tr + (br - tr) * t), g = Math.round(tg + (bg - tg) * t), b = Math.round(tb + (bb - tb) * t);
      this._rect(c, x, y + i * bandH, w, bandH + 1, (r << 16) | (g << 8) | b);
    }
  }
  _label(c, text, color = '#8a8a9e') {
    // 场景名标签（左上角小字，帮助辨识）
    c.add(this.scene.add.text(40, 30, text, {
      fontSize: '20px', color, backgroundColor: '#00000066', padding: { x: 12, y: 6 },
    }).setScrollFactor(0));
  }
  _emoji(c, x, y, e, size = 40) {
    c.add(this.scene.add.text(x, y, e, { fontSize: `${size}px` }).setOrigin(0.5).setScrollFactor(0));
  }
  _circle(c, x, y, r, color, alpha = 1) {
    c.add(this.scene.add.circle(x, y, r, color, alpha).setScrollFactor(0));
  }
  _stroke(c, cx, cy, w, h, lineW, color) {
    c.add(this.scene.add.rectangle(cx, cy, w, h).setStrokeStyle(lineW, color).setScrollFactor(0));
  }

  // ======== 各场景 ========

  // 街道晨景：晨光天空渐变 + 楼群剪影 + 地面 + 通勤元素
  _street(c) {
    const W = this.SW, H = this.SH;
    this._vGradient(c, 0, 0, W, H * 0.62, 0xffc98a, 0xf0d8e8);   // 晨光橙→淡紫
    // 远处楼群剪影（高低错落）
    const groundY = H * 0.62;
    const bw = 150;
    for (let i = 0; i < Math.ceil(W / bw); i++) {
      const bh = 120 + ((i * 137) % 320);
      const shade = 0x6a7290 + ((i % 3) * 0x0a0a10);
      this._rect(c, i * bw, groundY - bh, bw - 12, bh, shade);
      // 楼上的窗（点点亮光）
      for (let wy = groundY - bh + 20; wy < groundY - 20; wy += 34) {
        for (let wx = i * bw + 12; wx < i * bw + bw - 24; wx += 30) {
          if ((wx + wy) % 3 === 0) this._rect(c, wx, wy, 12, 16, 0xffe9a8, 0.8);
        }
      }
    }
    // 最高那栋（玻璃大厦，剧情"招聘页看过八百遍的玻璃大厦"）
    this._rect(c, W * 0.5, groundY - 480, 160, 480, 0x8ab0d8, 0.9);
    this._rect(c, W * 0.5 + 8, groundY - 470, 144, 460, 0xaed0f0, 0.5);
    // 地面（街道）
    this._rect(c, 0, groundY, W, H - groundY, 0x3a3a44);
    this._rect(c, 0, groundY, W, 6, 0x5a5a66);
    // 斑马线
    for (let x = W * 0.3; x < W * 0.7; x += 60) this._rect(c, x, groundY + 40, 36, H - groundY - 80, 0xcccccc, 0.5);
    this._emoji(c, W * 0.5, groundY + 120, '🚶', 44);
    this._emoji(c, W * 0.62, groundY + 150, '🚇', 52);
    this._label(c, '🌅 清晨 · 通勤路上');
  }

  // 大堂：高挑冷调空间 + 闸机 + 前台
  _lobby(c) {
    const W = this.SW, H = this.SH;
    this._vGradient(c, 0, 0, W, H, 0xe8eef4, 0xc4ccd8);          // 明亮冷白
    // 高挑立柱
    for (const x of [W * 0.15, W * 0.4, W * 0.6, W * 0.85]) {
      this._rect(c, x - 24, 0, 48, H * 0.8, 0xd0d6e0);
      this._rect(c, x - 24, 0, 8, H * 0.8, 0xffffff, 0.6);
    }
    // 地面（大理石反光）
    this._rect(c, 0, H * 0.7, W, H * 0.3, 0xb8c0cc);
    this._rect(c, 0, H * 0.7, W, 4, 0xffffff, 0.5);
    // 闸机排
    for (let i = 0; i < 5; i++) {
      const x = W * 0.32 + i * 90;
      this._rect(c, x, H * 0.6, 20, 110, 0x5a6274);
      this._rect(c, x, H * 0.6, 20, 10, 0x3fb950, 0.9); // 绿灯
    }
    // 前台
    this._rect(c, W * 0.7, H * 0.5, 260, 90, 0x8a7a5a);
    this._emoji(c, W * 0.78, H * 0.46, '💁', 40);
    this._label(c, '🏢 公司大堂', '#5a5a6e');
  }

  // 家：暖色房间 + 窗外夜色 + 桌床 + 暖灯
  _home(c) {
    const W = this.SW, H = this.SH;
    this._rect(c, 0, 0, W, H, 0x2e2620);                        // 暖褐墙
    this._rect(c, 0, H * 0.72, W, H * 0.28, 0x4a3a2e);          // 地板
    // 窗（夜色）
    this._rect(c, W * 0.1, H * 0.15, 300, 320, 0x1a2440);
    this._rect(c, W * 0.1, H * 0.15, 300, 320, 0x0a1428, 0.4);
    for (let i = 0; i < 20; i++) this._emoji(c, W * 0.1 + 20 + (i * 53 % 280), H * 0.15 + 20 + (i * 71 % 280), '·', 20);
    this._emoji(c, W * 0.1 + 240, H * 0.15 + 60, '🌙', 40);
    // 窗框
    this._stroke(c, W * 0.1 + 150, H * 0.15 + 160, 300, 320, 6, 0x6a5a4a);
    // 暖灯 + 光晕
    this._circle(c, W * 0.8, H * 0.36, 180, 0xffcc66, 0.12);
    this._emoji(c, W * 0.8, H * 0.3, '💡', 48);
    // 桌 + 床
    this._rect(c, W * 0.55, H * 0.55, 300, 120, 0x6a5240);       // 桌
    this._emoji(c, W * 0.6, H * 0.52, '💻', 40);
    this._rect(c, W * 0.78, H * 0.66, 340, 160, 0x7a5a6a);       // 床
    this._label(c, '🏠 出租屋', '#c8b090');
  }

  // 公寓夜晚（比 home 更暗更孤独）
  _apartment(c) {
    this._home(c);
    // 叠一层更深的夜色 + 孤独感
    this._rect(c, 0, 0, this.SW, this.SH, 0x0a0a1e, 0.35);
    this._label(c, '🌃 深夜的公寓', '#8a8ab0');
  }

  // 医院：白墙冷光走廊
  _hospital(c) {
    const W = this.SW, H = this.SH;
    this._rect(c, 0, 0, W, H, 0xe8f0f2);                        // 白墙
    // 两侧墙（收窄营造走廊纵深感）
    this._rect(c, 0, 0, W * 0.16, H, 0xccd8dc);
    this._rect(c, W * 0.84, 0, W * 0.16, H, 0xccd8dc);
    this._rect(c, W * 0.16, 0, 6, H, 0xb0c0c6);
    this._rect(c, W * 0.84 - 6, 0, 6, H, 0xb0c0c6);
    this._rect(c, 0, H * 0.6, W, H * 0.4, 0xd0dce0);            // 地面
    this._rect(c, 0, H * 0.6, W, 4, 0xa0b0b8);
    // 冷光灯管
    for (const x of [W * 0.35, W * 0.5, W * 0.65]) this._rect(c, x, 40, 90, 14, 0xcfe8f0, 0.9);
    // 十字标 + 病床
    this._emoji(c, W * 0.5, H * 0.3, '🏥', 60);
    this._emoji(c, W * 0.5, H * 0.66, '🛏️', 52);
    this._label(c, '🏥 医院', '#5a7a8a');
  }

  // 茶水间近景
  _pantry(c) {
    const W = this.SW, H = this.SH;
    this._rect(c, 0, 0, W, H, 0x3a3630);
    this._rect(c, 0, H * 0.6, W, H * 0.4, 0x4a4640);
    this._rect(c, W * 0.3, H * 0.4, 500, 160, 0x6a6258);       // 台面
    this._emoji(c, W * 0.4, H * 0.42, '☕', 44);
    this._emoji(c, W * 0.52, H * 0.42, '🫖', 40);
    this._emoji(c, W * 0.6, H * 0.42, '🚰', 40);
    this._label(c, '🍵 茶水间', '#c8b8a0');
  }

  // 窗边（大窗 + 窗外景）
  _window(c) {
    const W = this.SW, H = this.SH;
    this._rect(c, 0, 0, W, H, 0x2a3038);
    // 大窗
    this._vGradient(c, W * 0.2, H * 0.1, W * 0.6, H * 0.7, 0x3a4a6e, 0x1a2440);
    for (let i = 0; i < 30; i++) this._emoji(c, W * 0.2 + 30 + (i * 97 % (W * 0.55)), H * 0.1 + 30 + (i * 53 % (H * 0.6)), '·', 18);
    this._emoji(c, W * 0.7, H * 0.22, '🌙', 44);
    // 窗框十字
    this._rect(c, W * 0.5 - 4, H * 0.1, 8, H * 0.7, 0x5a5a66);
    this._rect(c, W * 0.2, H * 0.45 - 4, W * 0.6, 8, 0x5a5a66);
    this._label(c, '🪟 窗边', '#9ab0c8');
  }

  // 工位近景
  _desk(c) {
    const W = this.SW, H = this.SH;
    this._rect(c, 0, 0, W, H, 0x26262e);
    this._rect(c, 0, H * 0.62, W, H * 0.38, 0x3a3a44);          // 桌面
    // 双显示器
    this._rect(c, W * 0.32, H * 0.28, 300, 200, 0x0d1117);
    this._rect(c, W * 0.32 + 10, H * 0.28 + 10, 280, 180, 0x161b22);
    this._rect(c, W * 0.56, H * 0.28, 300, 200, 0x0d1117);
    this._rect(c, W * 0.56 + 10, H * 0.28 + 10, 280, 180, 0x161b22);
    // 屏上代码行
    for (let i = 0; i < 6; i++) this._rect(c, W * 0.32 + 24, H * 0.28 + 28 + i * 24, 120 + (i * 37 % 140), 8, 0x3fb950, 0.5);
    this._emoji(c, W * 0.5, H * 0.7, '⌨️', 44);
    this._emoji(c, W * 0.7, H * 0.68, '🪴', 40);
    this._label(c, '💻 你的工位', '#8ab0d8');
  }

  // 兜底：未知场景用中性暗色 + 场景名
  _generic(c, bgKey) {
    this._rect(c, 0, 0, this.SW, this.SH, 0x1a1a26);
    this._label(c, `· ${bgKey} ·`);
  }
}
