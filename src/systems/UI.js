// UI.js — 统一 UI 工具：自适应按钮工厂。
// 根治"文字被框挡/溢出"：先创建文本量出真实宽高，再画比文字大一圈的框，
// 框永远包住文字（padX/padY 冗余），文字与框严格居中。全场景复用，杜绝硬编码框尺寸。

/**
 * 自适应按钮：框尺寸由 label 实测决定，绝不溢出。
 * @param {Phaser.Scene} scene
 * @param {object} o
 *   x,y            按钮中心
 *   label          文本
 *   fontSize       字号（数字 px，默认 22）
 *   color          文字色（默认 #e8e8f4）
 *   fill           填充色（默认 0x2a2a44）
 *   stroke         描边色（默认 0x5a5a8a）
 *   minW           最小宽度（默认 0）
 *   padX,padY      内边距（默认 32 / 18）
 *   fontStyle      默认 'bold'
 *   letterSpacing  默认 2
 *   depth          默认不设
 *   onClick        点击回调
 *   sound          点击音（AudioSystem.uiClick），传 fn
 * @returns {{btn, label, width, height, setLabel}}
 */
export function makeButton(scene, o) {
  const fontSize = o.fontSize ?? 22;
  const padX = o.padX ?? 32;
  const padY = o.padY ?? 18;
  const style = {
    fontSize: `${fontSize}px`,
    color: o.color ?? '#e8e8f4',
    fontStyle: o.fontStyle ?? 'bold',
    letterSpacing: o.letterSpacing ?? 2,
    align: 'center',
  };
  // 先量文字定框尺寸
  const label = scene.add.text(0, 0, o.label, style).setOrigin(0.5);
  const w = Math.max(o.minW ?? 0, Math.ceil(label.width) + padX * 2);
  const h = Math.ceil(label.height) + padY * 2;
  const fill = o.fill ?? 0x2a2a44;
  const stroke = o.stroke ?? 0x5a5a8a;
  const hi = Phaser.Display.Color.IntegerToColor(fill).lighten(16).color;
  const radius = Math.min(18, Math.floor(h / 2));
  const c = scene.add.container(o.x, o.y);
  if (o.depth != null) c.setDepth(o.depth);
  const g = scene.add.graphics();
  let selected = false;
  const draw = (state) => {
    g.clear();
    g.fillStyle(state === 'hover' ? hi : fill, o.alpha ?? 0.96);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, radius);
    g.lineStyle(selected ? 4 : 2.5, selected ? 0xfff0a0 : stroke, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
  };
  draw('normal');
  c.add(g); c.add(label);
  const zone = scene.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
  c.add(zone);
  zone.on('pointerover', () => { draw('hover'); scene.tweens.add({ targets: c, scale: 1.04, duration: 120, ease: 'Back.out' }); });
  zone.on('pointerout', () => { draw('normal'); scene.tweens.add({ targets: c, scale: selected ? 1.05 : 1, duration: 120 }); });
  if (o.onClick) zone.on('pointerdown', () => { if (o.sound) o.sound(); o.onClick(); });
  return {
    btn: c, container: c, label, width: w, height: h,
    setLabel: (s) => { label.setText(s); },
    setSelected: (v) => {
      selected = v; draw('normal');
      scene.tweens.add({ targets: c, scale: v ? 1.05 : 1, duration: 150, ease: 'Back.out' });
    },
    destroy: () => { c.destroy(true); },
  };
}

/**
 * 可爱圆角选项框：圆角底板 + 彩色序号徽章 + 弹入 + hover 放大。
 * 返回一个 Container（调用方 add 到父容器或直接留在场景，destroy 时随父容器一起销毁）。
 * @param {Phaser.Scene} scene
 * @param {object} o
 *   x,y      中心
 *   w,h      尺寸
 *   label    文本
 *   index    从 0 起的序号（画彩色徽章 index+1；null 则不画徽章）
 *   tone     主题色（描边/徽章）
 *   fontSize 字号（默认 22）
 *   onClick  点击回调
 *   sound    点击音（fn）
 *   popDelay 弹入延迟 ms（交错动画用，默认 0）
 * @returns {Phaser.GameObjects.Container}
 */
export function makeCuteChoice(scene, o) {
  const tone = o.tone ?? 0x6fb2e8;
  const w = o.w, h = o.h;
  const hasBadge = o.index != null;
  const c = scene.add.container(o.x, o.y).setScrollFactor(0);
  const g = scene.add.graphics().setScrollFactor(0);
  const radius = Math.min(16, Math.floor(h / 2));
  const draw = (hover) => {
    g.clear();
    g.fillStyle(hover ? 0x33334e : 0x232338, 0.98);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, radius);
    g.lineStyle(3, hover ? tone : 0x5a5a7a, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
  };
  draw(false);
  c.add(g);
  let labelX = 0;
  if (hasBadge) {
    const bx = -w / 2 + 28;
    c.add(scene.add.circle(bx, 0, 14, tone, 1).setScrollFactor(0));
    c.add(scene.add.text(bx, 0, `${o.index + 1}`, {
      fontSize: '16px', color: '#16161f', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0));
    labelX = 16;
  }
  c.add(scene.add.text(labelX, 0, o.label, {
    fontSize: `${o.fontSize ?? 22}px`, color: '#ffffff', align: 'center',
    wordWrap: { width: w - (hasBadge ? 96 : 44), useAdvancedWrap: true },
  }).setOrigin(0.5).setScrollFactor(0));
  const zone = scene.add.zone(0, 0, w, h).setScrollFactor(0).setInteractive({ useHandCursor: true });
  c.add(zone);
  zone.on('pointerover', () => { draw(true); scene.tweens.add({ targets: c, scale: 1.04, duration: 120, ease: 'Back.out' }); });
  zone.on('pointerout', () => { draw(false); scene.tweens.add({ targets: c, scale: 1, duration: 120 }); });
  zone.on('pointerdown', () => { if (o.sound) o.sound(); if (o.onClick) o.onClick(); });
  // 弹入
  c.setScale(0);
  scene.tweens.add({ targets: c, scale: 1, duration: 300, delay: o.popDelay ?? 0, ease: 'Back.out' });
  c._zone = zone;
  return c;
}
