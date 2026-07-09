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
  // 先量文字
  const txt = scene.add.text(o.x, o.y, o.label, style).setOrigin(0.5);
  const w = Math.max(o.minW ?? 0, Math.ceil(txt.width) + padX * 2);
  const h = Math.ceil(txt.height) + padY * 2;
  const fill = o.fill ?? 0x2a2a44;
  const stroke = o.stroke ?? 0x5a5a8a;
  const btn = scene.add.rectangle(o.x, o.y, w, h, fill, o.alpha ?? 0.96)
    .setStrokeStyle(2, stroke).setInteractive({ useHandCursor: true });
  // 让文字压在框上层
  txt.setDepth((o.depth ?? 0) + 1);
  if (o.depth != null) btn.setDepth(o.depth);
  // hover
  const hi = Phaser.Display.Color.IntegerToColor(fill).lighten(14).color;
  btn.on('pointerover', () => btn.setFillStyle(hi));
  btn.on('pointerout', () => btn.setFillStyle(fill));
  if (o.onClick) btn.on('pointerdown', () => { if (o.sound) o.sound(); o.onClick(); });
  return {
    btn, label: txt, width: w, height: h,
    setLabel: (s) => { txt.setText(s); },
    destroy: () => { btn.destroy(); txt.destroy(); },
  };
}
