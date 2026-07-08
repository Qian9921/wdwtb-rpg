import Phaser from 'phaser';
import { config } from './config.js';

// 全局文字高清：pixelArt:true 会关抗锯齿，导致文字被 FIT 放大后发糊。
// 覆盖 add.text 工厂，让所有场景的文字默认以 2× 分辨率光栅化——一处生效、零遗漏。
const TEXT_RESOLUTION = 2;
Phaser.GameObjects.GameObjectFactory.register('text', function (x, y, text, style) {
  const t = new Phaser.GameObjects.Text(this.scene, x, y, text, style);
  t.setResolution(TEXT_RESOLUTION);
  this.displayList.add(t);
  this.updateList.add(t);
  return t;
});

const game = new Phaser.Game(config); window.__game = game;

// 调试钩子:?s=场景key 启动指定场景(仅开发用)
const _s = new URLSearchParams(location.search).get('s');
if (_s) {
  game.events.once('ready', () => {
    setTimeout(() => { try { game.scene.start(_s); } catch(e){ console.error(e); } }, 100);
  });
}
