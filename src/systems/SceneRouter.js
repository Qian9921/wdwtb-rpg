import { AudioSystem } from './AudioSystem.js';

// SceneRouter：统一的场景转场路由——消除硬切，给所有场景切换加淡入淡出。
// 转场前可选存档，保证跨场景状态连续。所有场景共用一处转场逻辑。
//
// 用法：SceneRouter.goto(this, 'HomeScene', { day, phase, career, act });
//   this = 当前场景实例；fadeMs 控制淡出时长（默认 400ms）。

const DEFAULT_FADE = 400;

// 淡出当前场景 → start 目标场景 → 目标场景自行淡入（create 里调 fadeIn）。
// onFadeOut 在淡出完成、切场景前调用（可在此存档）。
function goto(currentScene, targetKey, payload = {}, { fadeMs = DEFAULT_FADE, onFadeOut } = {}) {
  if (!currentScene?.cameras?.main) {
    // 兜底：无相机直接切（不应该发生）
    if (currentScene) currentScene.scene.start(targetKey, payload);
    return;
  }
  const cam = currentScene.cameras.main;
  cam.fadeOut(fadeMs, 0, 0, 0);
  cam.once('camerafadeoutcomplete', () => {
    if (typeof onFadeOut === 'function') {
      try { onFadeOut(); } catch (e) { /* 存档失败不阻塞转场 */ }
    }
    currentScene.scene.start(targetKey, payload);
  });
}

// 淡入：目标场景 create 开头调用，从黑淡入。
function fadeIn(scene, fadeMs = DEFAULT_FADE) {
  if (!scene?.cameras?.main) return;
  scene.cameras.main.fadeIn(fadeMs, 0, 0, 0);
}

// 带转场效果的存档切换：淡出 → 存档 → 切场景。组合常用操作。
// SaveSystem 通过 onFadeOut 注入，避免本模块硬依赖存储层。
function gotoWithSave(currentScene, targetKey, payload, saveFn, opts) {
  return goto(currentScene, targetKey, payload, {
    ...opts,
    onFadeOut: () => { if (saveFn) saveFn(); },
  });
}

export const SceneRouter = { goto, fadeIn, gotoWithSave };
