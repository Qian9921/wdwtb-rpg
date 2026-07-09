// SaveSystem：localStorage 存读档。纯浏览器存储，不依赖 Phaser。
//
// 存档结构（增强版，向后兼容旧 {career, act}）：
//   {
//     version: 2,
//     career: 'programmer',           // 当前职业
//     act: 3,                         // 当前幕次
//     stats: { health, energy, ... }, // StateSystem 的 8 项数值（续档恢复用）
//     updatedAt: 1234567890           // 存档时间戳
//   }
// 捏人画像单独存 wdwtb_profile（OpeningScene 维护，不与此处耦合）。
const SAVE_KEY = 'wdwtb_save';

export class SaveSystem {
  // 存档：合并写（保留旧档中本次未提供的字段），失败返回 false，不抛错。
  // 关键：改成"读旧档 + 合并"而非整体覆盖——根治"某个写档点漏字段就丢数据"的地雷
  // （比如下班回家漏存 story 导致剧情进度被抹、深度职业卡在第一幕重播）。
  static save(data) {
    try {
      const prev = SaveSystem.load() || {};
      const payload = { ...prev, ...data, version: 2, updatedAt: Date.now() };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      return false;
    }
  }

  // 读档：返回解析后的对象；无存档或出错返回 null
  static load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw === null) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  // 便捷存档：封装常用字段（career/act/stats）。其余字段可选经 extra 合并。
  static saveProgress({ career, act, stats, extra }) {
    return SaveSystem.save({ career, act, stats, ...(extra || {}) });
  }

  // 删除存档
  static clear() {
    try {
      localStorage.removeItem(SAVE_KEY);
      return true;
    } catch (e) {
      return false;
    }
  }

  // 是否存在存档
  static has() {
    try {
      return localStorage.getItem(SAVE_KEY) !== null;
    } catch (e) {
      return false;
    }
  }
}
