import Phaser from 'phaser';

// TouchControls：移动端虚拟摇杆 + 交互按钮 overlay。
// 仅在触屏设备激活（hasTouch 判定），桌面端完全静默、不影响键盘操作。
// 钉屏 + 适配 UI 相机（双相机架构下不被主相机 zoom 放大）。
// 支持多指：摇杆与按钮互不干扰，可同时移动 + 交互。
//
// 对外接口（WorldScene 调用）：
//   new TouchControls(scene)              —— 创建（内部自判触屏，非触屏则空跑）
//   controls.getAxis() → {x, y}           —— 归一化方向向量 [-1,1]（update 里读）
//   controls.setInteractVisible(bool)     —— 控制"交互"按钮显隐（走近 NPC 时显示）
//   controls.onInteract(cb)               —— 注册交互按钮回调
//   controls.onMenu(cb)                   —— 注册菜单按钮回调（ESC 替代）
export class TouchControls {
  constructor(scene) {
    this.scene = scene;
    this.enabled = TouchControls.hasTouch();
    if (!this.enabled) {
      // 非触屏：提供空实现，让 WorldScene 代码无需判空
      this._axis = { x: 0, y: 0 };
      return;
    }
    this._build();
  }

  // 触屏判定：'ontouchstart' in window 或 maxTouchPoints>0。
  // WSL/桌面浏览器通常返回 false，手机/平板返回 true。
  static hasTouch() {
    if (typeof window === 'undefined') return false;
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  }

  _build() {
    const scene = this.scene;
    const SW = scene.scale.width, SH = scene.scale.height;
    this._axis = { x: 0, y: 0 };
    this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(9998);

    // ---- 左侧虚拟摇杆 ----
    this.stickCx = 170;          // 摇杆中心（屏幕坐标，1920 尺度）
    this.stickCy = SH - 170;
    this.stickR = 110;           // 外圈半径
    this.stickDead = 28;         // 死区（小于此距离归零，防漂移）
    this.stickMax = 90;          // 最大有效位移（超出按最大算）
    this.stickPointerId = null;  // 当前控制摇杆的指针 id

    this.stickBase = scene.add.circle(this.stickCx, this.stickCy, this.stickR, 0xffffff, 0.08)
      .setStrokeStyle(3, 0xffffff, 0.25);
    this.stickKnob = scene.add.circle(this.stickCx, this.stickCy, 44, 0x4ec9b0, 0.55)
      .setStrokeStyle(3, 0xffffff, 0.6);
    this.stickBase.setInteractive(new Phaser.Geom.Circle(this.stickCx, this.stickCy, this.stickR + 40), Phaser.Geom.Circle.Contains);
    this.container.add([this.stickBase, this.stickKnob]);

    // 摇杆拖拽：记录指针 id，只响应第一个落在外圈的指针（防多指抢夺）
    this.stickBase.on('pointerdown', (pointer) => {
      if (this.stickPointerId !== null) return;
      this.stickPointerId = pointer.id;
      this._updateKnob(pointer);
    });
    // 用 scene 的 pointermove（拖出 base 范围时仍能响应）
    scene.input.on('pointermove', (pointer) => {
      if (pointer.id !== this.stickPointerId) return;
      this._updateKnob(pointer);
    });
    const release = (pointer) => {
      if (pointer.id !== this.stickPointerId) return;
      this.stickPointerId = null;
      this._axis.x = 0; this._axis.y = 0;
      this.stickKnob.setPosition(this.stickCx, this.stickCy);
    };
    scene.input.on('pointerup', release);
    scene.input.on('pointerupoutside', release);

    // ---- 右侧按钮组：交互 + 菜单 ----
    this.interactBtn = this._makeButton(SW - 110, SH - 230, 'E', 0x2a6fd6, 70);
    this.interactBtn.setVisible(false); // 默认隐藏，走近 NPC 才显示
    this.menuBtn = this._makeButton(SW - 110, SH - 100, '☰', 0x3a3a4e, 62);

    this.interactBtn.on('pointerdown', () => {
      if (this._onInteract) this._onInteract();
    });
    this.menuBtn.on('pointerdown', () => {
      if (this._onMenu) this._onMenu();
    });

    // 适配双相机
    if (typeof scene.attachToUICamera === 'function') scene.attachToUICamera(this.container);
  }

  // 画一个圆形按钮（带 hitarea），返回可交互的 circle
  _makeButton(x, y, label, fill, r) {
    const scene = this.scene;
    const bg = scene.add.circle(x, y, r, fill, 0.5).setStrokeStyle(3, 0xffffff, 0.5)
      .setInteractive(new Phaser.Geom.Circle(x, y, r + 12), Phaser.Geom.Circle.Contains)
      .setScrollFactor(0);
    const txt = scene.add.text(x, y, label, {
      fontSize: '30px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0);
    this.container.add([bg, txt]);
    // pointerdown 视觉反馈
    bg.on('pointerdown', () => { bg.setFillStyle(fill, 0.8); });
    bg.on('pointerup', () => { bg.setFillStyle(fill, 0.5); });
    bg.on('pointerout', () => { bg.setFillStyle(fill, 0.5); });
    // 把方法挂到 bg 上方便外部 setVisible
    bg.label = txt;
    return bg;
  }

  // 按指针位置更新摇杆 knob + axis 向量
  _updateKnob(pointer) {
    let dx = pointer.x - this.stickCx;
    let dy = pointer.y - this.stickCy;
    const dist = Math.hypot(dx, dy);
    // 限幅到最大半径
    if (dist > this.stickMax) {
      dx = (dx / dist) * this.stickMax;
      dy = (dy / dist) * this.stickMax;
    }
    this.stickKnob.setPosition(this.stickCx + dx, this.stickCy + dy);
    // 死区处理
    const mag = Math.hypot(dx, dy);
    if (mag < this.stickDead) {
      this._axis.x = 0; this._axis.y = 0;
    } else {
      this._axis.x = dx / this.stickMax;
      this._axis.y = dy / this.stickMax;
    }
  }

  // ---- 对外接口 ----
  getAxis() { return this._axis; }

  setInteractVisible(v) {
    if (this.enabled && this.interactBtn) {
      this.interactBtn.setVisible(v);
      if (this.interactBtn.label) this.interactBtn.label.setVisible(v);
    }
  }

  onInteract(cb) { this._onInteract = cb; }
  onMenu(cb) { this._onMenu = cb; }

  destroy() {
    if (this.container) { this.container.destroy(true); this.container = null; }
  }
}
