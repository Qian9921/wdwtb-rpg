import Phaser from 'phaser';

// CharacterPortrait：用现成 SkyOffice 角色图(MIT)拼「半身立绘」——放大 idle 帧 + 圆角画框 +
// 名牌 + 呼吸浮动。对话时出现在文本框一侧,让同事「有脸」,大幅提升代入感与精致度。
// 纯 Phaser 工具,无外部依赖;找不到皮肤/帧时安全降级(不画立绘,不报错)。

/** 稳健地为某皮肤挑一个 idle 帧（兼容有/无 .png 后缀的 atlas 键名） */
export function pickIdleFrame(scene, skin) {
  try {
    if (!scene.textures || !scene.textures.exists(skin)) return null;
    const tex = scene.textures.get(skin);
    const names = tex.getFrameNames();
    if (!names || !names.length) return null;
    return names.find(n => /idle.*1(\.png)?$/i.test(n))
      || names.find(n => /idle/i.test(n))
      || names[0];
  } catch (e) { return null; }
}

/**
 * 造一个立绘容器（圆角画框 + 放大角色 + 名牌）。
 * @param {Phaser.Scene} scene
 * @param {object} o  { skin, name, x, y, w, h, scale, accent }
 * @returns {Phaser.GameObjects.Container|null}  找不到皮肤返回 null（调用方据此降级）
 */
export function makePortrait(scene, o = {}) {
  const skin = o.skin;
  const frame = pickIdleFrame(scene, skin);
  if (!frame) return null;
  const w = o.w || 150, h = o.h || 164;
  const accent = o.accent || 0xd4a353;
  const c = scene.add.container(o.x || 0, o.y || 0).setScrollFactor(0);

  // 画框（圆角 + 渐层底 + 描边）
  const g = scene.add.graphics().setScrollFactor(0);
  g.fillStyle(0x10101a, 0.98); g.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
  g.fillStyle(0x1c2a3a, 0.6); g.fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h * 0.62, 10); // 上半冷光底
  g.lineStyle(3, accent, 1); g.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
  c.add(g);

  // 角色（origin 底部中心，坐进画框下缘）
  const scale = o.scale || (h * 0.017);
  const spr = scene.add.sprite(0, h / 2 - 24, skin, frame).setOrigin(0.5, 1).setScale(scale).setScrollFactor(0);
  c.add(spr);
  // 呼吸浮动
  scene.tweens.add({ targets: spr, y: spr.y - 3, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

  // 名牌
  if (o.name) {
    const plate = scene.add.rectangle(0, h / 2 - 12, w - 16, 22, 0x0a0a14, 0.9).setScrollFactor(0);
    const nameT = scene.add.text(0, h / 2 - 12, o.name, {
      fontSize: '15px', color: '#ffe08a', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0);
    c.add(plate); c.add(nameT);
  }
  return c;
}
