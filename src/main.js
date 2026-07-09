import Phaser from 'phaser';
import { config } from './config.js';
import { AudioSystem } from './systems/AudioSystem.js';

// 全局文字高清：pixelArt:true 会关抗锯齿；配合 config 的 zoom:2（backing 1920），
// 文字再按 max(2, dpr) 光栅化 → 与 backing 匹配甚至超采样，逐字锐利。一处生效、零遗漏。
const TEXT_RESOLUTION = Math.max(2, Math.ceil(window.devicePixelRatio || 1) * 2);
Phaser.GameObjects.GameObjectFactory.register('text', function (x, y, text, style) {
  const t = new Phaser.GameObjects.Text(this.scene, x, y, text, style);
  t.setResolution(TEXT_RESOLUTION);
  this.displayList.add(t);
  this.updateList.add(t);
  return t;
});

const game = new Phaser.Game(config); window.__game = game;

// 音频解锁：浏览器要求 AudioContext 在用户手势后创建。
// 首次点击/按键时 unlock，之前各场景声明的 BGM 会自动开播。
const unlockOnce = () => {
  AudioSystem.unlock();
  window.removeEventListener('pointerdown', unlockOnce);
  window.removeEventListener('keydown', unlockOnce);
};
window.addEventListener('pointerdown', unlockOnce);
window.addEventListener('keydown', unlockOnce);

// 调试钩子:?s=场景key 启动指定场景(仅开发用)
const _s = new URLSearchParams(location.search).get('s');
if (_s) {
  game.events.once('ready', () => {
    setTimeout(() => { try { game.scene.start(_s); } catch(e){ console.error(e); } }, 100);
  });
}
