import { TitleScene } from "./scenes/TitleScene.js";
import { FurnCheck } from "./scenes/FurnCheck.js";
import { CharCheck } from "./scenes/CharCheck.js";
import { FloorTest } from "./scenes/FloorTest.js";
import Phaser from 'phaser';
import { OfficeScene } from './scenes/OfficeScene.js';
import { MindscapeScene } from './scenes/MindscapeScene.js';
import { OpeningScene } from './scenes/OpeningScene.js';
import { HubScene } from './scenes/HubScene.js';
import { MinigameScene } from './scenes/MinigameScene.js';
import { EndingScene } from './scenes/EndingScene.js';
import { WorldScene } from './scenes/WorldScene.js';
import { AssetBrowserScene } from './scenes/AssetBrowserScene.js';

// Phaser 游戏配置：引擎参数写一次共用。
// 剧情与职业内容不在此处，统一从 data/ 目录的 JSON 读取。
export const config = {
  type: Phaser.AUTO,
  width: 960,
  height: 540,
  parent: 'game',
  backgroundColor: '#1a1a2e',
  pixelArt: true,
  roundPixels: true,
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
  scene: [TitleScene, WorldScene, MindscapeScene, OpeningScene, HubScene, OfficeScene, MinigameScene, EndingScene],
};
