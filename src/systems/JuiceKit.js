import Phaser from 'phaser';
import { AudioSystem } from './AudioSystem.js';

// JuiceKit：统一的游戏手感工具库——把"重要事件有重量"的视觉/听觉反馈封装成一处。
// 全场景共用，调用方传 scene 引用即可。每个方法都自带空值保护，安全无副作用。
//
// 设计原则（对标 Celeste/死亡细胞/Hades 的 juice 三件套）：
// - 屏震(camera.shake) + 粒子(particles) + 顿帧(hitstop) 组合用，单用一个不够
// - 飘字(floatText) 是数值驱动 RPG 的核心反馈——状态变化必须看得见
// - 所有效果都短促(50~300ms)，不拖沓、不阻塞玩家操作太久
//
// 用法：import { Juice } from '../systems/JuiceKit.js';  Juice.shake(this, 0.01, 200);

// 屏震：赋予冲击/危机事件以"重量"。intensity 建议 0.005~0.02，duration 100~300ms。
function shake(scene, intensity = 0.01, duration = 200) {
  if (!scene?.cameras?.main) return;
  scene.cameras.main.shake(duration, intensity);
}

// 粒子爆发：视觉确认一个正面事件(答对/完成任务/疗愈)。
// 在 (x,y) 世界坐标爆发 count 个 color 色点，向外扩散后淡出。
function burst(scene, x, y, color = 0xffd24d, count = 12) {
  if (!scene?.add?.particles) return;
  try {
    // 用一个 1x1 白色 texture 作粒子源（按 color 着色）；复用 scene 缓存避免重复建
    let key = '__juice_dot';
    if (!scene.textures.exists(key)) {
      const g = scene.add.graphics();
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2);
      g.generateTexture(key, 2, 2);
      g.destroy();
    }
    const p = scene.add.particles(x, y, key, {
      speed: { min: 60, max: 180 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 500,
      quantity: count,
      tint: color,
      emitting: false,
    });
    p.setDepth(9500);
    p.explode(count);
    // 粒子寿命结束后自动销毁 emitter
    scene.time.delayedCall(600, () => { if (p && p.scene) p.destroy(); });
  } catch (e) { /* 粒子不可用时静默降级 */ }
}

// 顿帧：冻结物理 ms 毫秒，让冲击有"停顿感"（hitstop）。
// 原理：暂停 arcade physics.world，ms 后恢复。对话/动画继续（只冻物理体）。
let _hitstopTimer = null;
function hitstop(scene, ms = 80) {
  if (!scene?.physics?.world) return;
  if (_hitstopTimer) return; // 已在顿帧中，不叠加
  scene.physics.world.pause();
  _hitstopTimer = scene.time.delayedCall(ms, () => {
    if (scene.physics && scene.physics.world) scene.physics.world.resume();
    _hitstopTimer = null;
  });
}

// 飘字：状态变化 +5/-3 的浮起淡出。数值驱动 RPG 的核心反馈。
// text 形如 '+5'/'-3'/'完成!'，color 正面绿/负面红。
function floatText(scene, x, y, text, color = '#6aaa6a') {
  if (!scene?.add?.text) return;
  const t = scene.add.text(x, y, text, {
    fontSize: '22px', color, fontStyle: 'bold',
  }).setOrigin(0.5).setDepth(9600);
  scene.tweens.add({
    targets: t,
    y: y - 40, alpha: 0,
    duration: 700, ease: 'Cubic.out',
    onComplete: () => t.destroy(),
  });
}

// 弹跳/缩放：让按钮/卡片/选项入场有弹性（squash-stretch 模拟）。
// obj 先 scale 到 1.15 再回弹到 1.0，造成"嘭"的弹性感。
function pop(scene, obj, scale = 1.0) {
  if (!scene?.tweens || !obj) return;
  obj.setScale(scale * 0.7);
  scene.tweens.add({
    targets: obj,
    scale,
    duration: 220, ease: 'Back.out',
  });
}

// 闪光：全屏一闪，用于疗愈/升级/重大正面瞬间。
function flash(scene, color = 0xffffff, duration = 120) {
  if (!scene?.cameras?.main) return;
  scene.cameras.main.flash(duration, (color >> 16) & 255, (color >> 8) & 255, color & 255);
}

// 组合：正面事件全套（粒子+弹跳+音效），一处调用搞定"答对/完成"的庆祝反馈。
function celebrate(scene, x, y, color = 0x6aaa6a) {
  burst(scene, x, y, color, 14);
  AudioSystem.success();
}

// 组合：负面事件全套（屏震+顿帧+音效），一处调用搞定"答错/危机"的冲击反馈。
function impact(scene, intensity = 0.012) {
  shake(scene, intensity, 200);
  hitstop(scene, 80);
  AudioSystem.error();
}

export const Juice = { shake, burst, hitstop, floatText, pop, flash, celebrate, impact };
