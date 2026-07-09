// 解析 hook：把 import 'phaser' 重定向到全局 __PHASER_STUB__（最小 EventEmitter + Math.Clamp）。
// 让 StateSystem 等依赖 Phaser 的模块能在纯 Node 下被单测，无需加载真实 Phaser（它要 window）。
export async function load(url, context, nextLoad) {
  if (url.endsWith('/node_modules/phaser/dist/phaser.esm.js') || url.endsWith('phaser/src/phaser.js')) {
    return {
      format: 'module',
      source: 'export default globalThis.__PHASER_STUB__; export const Phaser = globalThis.__PHASER_STUB__;',
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}

export async function resolve(specifier, context, nextResolve) {
  // 让裸 'phaser' 指向一个我们拦截 load 的虚拟路径
  if (specifier === 'phaser') {
    return { url: 'file:///node_modules/phaser/dist/phaser.esm.js', shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
