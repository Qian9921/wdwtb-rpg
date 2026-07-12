import Phaser from 'phaser';
import { config } from './config.js';
import { AudioSystem } from './systems/AudioSystem.js';

// 全局文字高清：pixelArt:true 会关抗锯齿；配合 config 的 zoom:2（backing 1920），
// 文字再按 max(2, dpr) 光栅化 → 与 backing 匹配甚至超采样，逐字锐利。一处生效、零遗漏。
// 全局像素字体：所有 Text 默认 'Fusion Pixel'（OFL 许可中文像素字体），一处生效。
const TEXT_RESOLUTION = Math.max(2, Math.ceil(window.devicePixelRatio || 1) * 2);
const PIXEL_FONT = '"Fusion Pixel", "Courier New", monospace';
Phaser.GameObjects.GameObjectFactory.register('text', function (x, y, text, style) {
  const st = { fontFamily: PIXEL_FONT, ...(style || {}) };
  const t = new Phaser.GameObjects.Text(this.scene, x, y, text, st);
  t.setResolution(TEXT_RESOLUTION);
  // P4 修复：像素字体（Fusion Pixel）渲染中文时，Phaser 用拉丁测试串估出的 ascent
  // 比实际中文字形墨迹矮一点，导致所有文字上边缘被 Canvas 裁掉一丝。
  // 顶部叠加一点 padding 抵消——按字号比例算、限定 2~6px，视觉几乎无感：
  // setOrigin(0.5) 的文字最多因此下移 padTop/2（≤3px），背景框也只增高这一点点，
  // 且是叠加在已有的 style.padding 之上（不覆盖左右下三边）。
  // 中文墨迹顶部超出 Phaser 用拉丁测试串估的 ascent,【上溢量随字号线性增长】(约字号的
  // 15~20%)。旧公式 min(6, ceil(fs*0.12)) 把补偿钉死在 6px 上限,大字号(首页80px标题、
  // MBTI 32px)补偿缺口大→顶部被裁。改为 20% 比例、上限抬到 20px:32px→7、80px→16,
  // 覆盖上溢缺口。副作用:setOrigin(0.5) 居中文字整体下移 padTop/2(80px 标题≤8px),
  // 标题多有留白无碍;origin(0,0) 逐行堆叠布局自适应。
  const fs = parseInt(st.fontSize, 10) || 16;
  const padTop = Math.max(2, Math.min(20, Math.round(fs * 0.2)));
  const p = t.padding;
  t.setPadding(p.left, p.top + padTop, p.right, p.bottom);
  this.displayList.add(t);
  this.updateList.add(t);
  return t;
});

// 等像素字体就绪再启动游戏（最多等 3s，超时降级启动，不阻塞）。
// 不等的话首屏文字会先用系统字体光栅化，字体到位后 Phaser 不会自动重绘。
let game = null;
function startGame() {
  if (game) return;
  game = new Phaser.Game(config); window.__game = game;
  // 引擎就绪后移除 HTML 启动加载层（index.html 的 #boot-loader）
  const hide = () => { if (window.__hideBootLoader) window.__hideBootLoader(); };
  if (game.isBooted) hide(); else game.events.once('ready', hide);
}
try {
  const wait = document.fonts.load('12px "Fusion Pixel"', '你想成为谁');
  Promise.race([wait, new Promise(r => setTimeout(r, 3000))]).then(startGame, startGame);
} catch (e) { startGame(); }

// 音频解锁：浏览器要求 AudioContext 在用户手势后创建。
// 首次点击/按键时 unlock，之前各场景声明的 BGM 会自动开播。
const unlockOnce = () => {
  AudioSystem.unlock();
  window.removeEventListener('pointerdown', unlockOnce);
  window.removeEventListener('keydown', unlockOnce);
};
window.addEventListener('pointerdown', unlockOnce);
window.addEventListener('keydown', unlockOnce);

// 调试钩子:?s=场景key 启动指定场景(仅开发用)。game 异步启动,轮询到就绪再挂。
const _s = new URLSearchParams(location.search).get('s');
if (_s) {
  const hook = setInterval(() => {
    if (!game) return;
    clearInterval(hook);
    const go = () => setTimeout(() => { try { game.scene.start(_s); } catch(e){ console.error(e); } }, 100);
    if (game.isBooted) go(); else game.events.once('ready', go);
  }, 50);
}
