import Phaser from 'phaser';
import { config } from './config.js';

const game = new Phaser.Game(config); window.__game = game;

// 调试钩子:?s=场景key 启动指定场景(仅开发用)
const _s = new URLSearchParams(location.search).get('s');
if (_s) {
  game.events.once('ready', () => {
    setTimeout(() => { try { game.scene.start(_s); } catch(e){ console.error(e); } }, 100);
  });
}
