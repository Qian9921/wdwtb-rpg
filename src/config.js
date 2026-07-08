import Phaser from 'phaser';
import { TitleScene } from './scenes/TitleScene.js';
import { OpeningScene } from './scenes/OpeningScene.js';
import { HubScene } from './scenes/HubScene.js';
import { WorldScene } from './scenes/WorldScene.js';
import { MindscapeScene } from './scenes/MindscapeScene.js';
import { MinigameScene } from './scenes/MinigameScene.js';
import { EndingScene } from './scenes/EndingScene.js';
import { PauseScene } from './scenes/PauseScene.js';

// Phaser 游戏配置：引擎参数写一次共用。
// 剧情与职业内容不在此处，统一从 data/ 目录的 JSON 读取。
// 缩放：FIT 模式——设计分辨率固定 960×540，等比放大填满窗口并居中（letterbox）。
//       所有场景 UI 坐标按 960×540 布局即可，无需响应式重排。
export const config = {
  type: Phaser.AUTO,
  backgroundColor: '#12121c',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent: 'game',
    width: 960,
    height: 540,
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scene: [
    TitleScene,
    OpeningScene,
    HubScene,
    WorldScene,
    MindscapeScene,
    MinigameScene,
    EndingScene,
    PauseScene,
  ],
};
