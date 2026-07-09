import Phaser from 'phaser';

// PhoneMessage：仿微信手机消息弹窗 —— 展示剧情中家人发来的消息。
// 纯 UI 渲染层（"怎么显示"）；显示什么由 FamilyMessages（数据层）决定。
// 钉屏（setScrollFactor 0）+ 适配 UI 相机（双相机架构下不被主相机 zoom 放大），
// 层级在对话 UI(10000) 之上(10050)，保证家人消息永远盖在最上层。
export class PhoneMessage {
  constructor(scene) {
    this.scene = scene;
    this.ui = null;       // 面板 Container
    this.backdrop = null; // 半透明遮罩
    this.onClose = null;
    this._closing = false;
  }

  // messages: [{ sender:'妈妈', text:'...' }]; onClose 可选回调
  show(messages, onClose) {
    this._close(true); // 先关掉已有的
    this.onClose = onClose || null;
    this._closing = false;
    const scene = this.scene;

    const SW = scene.scale.width;  // 1920 设计分辨率
    const SH = scene.scale.height;
    const panelW = 420;            // 1920 尺度下更宽更舒展
    const titleH = 52;
    const contentH = this._contentHeight(messages);
    const panelH = Math.min(titleH + contentH, SH - 120);
    const startX = SW + panelW;    // 从右侧屏幕外滑入
    const endX = SW - panelW - 24; // 停在右侧

    // 半透明遮罩（钉屏，点击关闭）——比对话遮罩更深的暗，把场景压暗聚焦消息
    const backdrop = scene.add.rectangle(SW / 2, SH / 2, SW, SH, 0x000000, 0.5)
      .setScrollFactor(0)
      .setInteractive()
      .setDepth(10050);
    backdrop.on('pointerdown', () => this._close(false));
    this.backdrop = backdrop;

    // 面板容器（钉屏）
    const c = scene.add.container(startX, 80).setScrollFactor(0).setDepth(10051);
    this.ui = c;

    // 面板背景：手机式深色卡片
    const bg = scene.add.rectangle(panelW / 2, panelH / 2, panelW, panelH, 0x1e1e2e, 0.97);
    c.add(bg);
    bg.setInteractive(); // 吃掉面板区域内的点击，防穿透到遮罩

    // ---- 标题栏：WeChat 绿 ----
    const titleBar = scene.add.rectangle(panelW / 2, titleH / 2, panelW, titleH, 0x15a15a, 0.92);
    c.add(titleBar);
    c.add(scene.add.text(24, titleH / 2, '微信', {
      fontSize: '22px', color: '#ffffff',
    }).setOrigin(0, 0.5));
    // ✕ 关闭按钮
    const closeBtn = scene.add.text(panelW - 24, titleH / 2, '✕', {
      fontSize: '24px', color: '#ffffff',
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerover', () => closeBtn.setColor('#ff6666'));
    closeBtn.on('pointerout', () => closeBtn.setColor('#ffffff'));
    closeBtn.on('pointerdown', () => this._close(false));
    c.add(closeBtn);

    // ---- 消息气泡 ----
    let y = titleH + 20;
    messages.forEach(msg => {
      // 发送人（上方小字）
      c.add(scene.add.text(28, y, msg.sender, {
        fontSize: '15px', color: '#9aa0a6',
      }));
      y += 21;

      // 气泡：宽随文字测量，最小留两行空间
      const probe = scene.add.text(-9999, -9999, msg.text, {
        fontSize: '18px', wordWrap: { width: panelW - 96, useAdvancedWrap: true },
      }).setVisible(false);
      const bubbleW = panelW - 56;
      const bubbleH = Math.max(48, probe.height + 24);
      probe.destroy();

      c.add(scene.add.rectangle(28 + bubbleW / 2, y + bubbleH / 2, bubbleW, bubbleH, 0xf0eed8, 0.94));
      c.add(scene.add.text(40, y + 12, msg.text, {
        fontSize: '18px', color: '#3a3a3a',
        wordWrap: { width: bubbleW - 24, useAdvancedWrap: true },
        lineSpacing: 4,
      }));

      y += bubbleH + 24;
    });

    // 适配双相机：main 相机忽略（不受 zoom 放大），uiCamera 默认渲染
    if (typeof scene.attachToUICamera === 'function') scene.attachToUICamera([backdrop, c]);

    // ---- 滑入动画（350ms）----
    scene.tweens.add({
      targets: c,
      x: endX,
      duration: 350,
      ease: 'Power2',
    });
  }

  // immediate=true 直接销毁不播动画
  _close(immediate) {
    if (this._closing || !this.ui) return;
    this._closing = true;
    if (immediate) { this._cleanup(); return; }
    this.scene.tweens.add({
      targets: this.ui,
      x: this.scene.scale.width + 420,
      duration: 280,
      ease: 'Power2',
      onComplete: () => this._cleanup(),
    });
  }

  _cleanup() {
    if (this.backdrop) { this.backdrop.destroy(); this.backdrop = null; }
    if (this.ui) { this.ui.destroy(true); this.ui = null; }
    this._closing = false;
    if (this.onClose) {
      const cb = this.onClose;
      this.onClose = null;
      cb();
    }
  }

  // 当前是否有弹窗在显示（供场景判断是否冻结移动）
  isShowing() {
    return !!this.ui;
  }

  // 立即关闭（场景切换/清理时调用）
  destroy() {
    if (this.ui) this._cleanup();
  }

  _contentHeight(messages) {
    const perMsg = 21 + 48 + 24; // sender 行 + 气泡(最小) + 间隔
    return messages.length * perMsg + 16; // 底部留白
  }
}
