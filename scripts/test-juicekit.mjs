// JuiceKit 单元测试。
// JuiceKit 依赖 Phaser（scene.add.particles / cameras.main 等），
// 用最小 scene stub 验证：各方法存在、无场景时安全降级、参数边界。
// 视觉效果本身需 E2E 截图验证，这里测"不崩 + 接口正确"。
// 运行：node scripts/test-juicekit.mjs

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' → ' + detail : ''}`); }
}

// --- 最小 Phaser + scene stub ---
// AudioSystem 被 JuiceKit import，在下方 data-URL 加载时内联替换成空函数对象
globalThis.Phaser = { Math: { Clamp: (v,lo,hi)=>Math.max(lo,Math.min(hi,v)) } };

// scene stub：模拟 Phaser.Scene 的最小子集
function makeScene() {
  const tweens = [];
  const delayedCalls = [];
  return {
    cameras: { main: { shake(d,i){}, flash(d,r,g,b){}, fadeIn(){} } },
    add: {
      particles(x,y,key,cfg){ return { setDepth(){}, explode(){}, destroy(){}, scene: {} }; },
      text(x,y,t,s){ const o={ x,y,text:t,setOrigin(){return o;},setDepth(){return o;},setScale(){return o;},setAlpha(a){o._a=a;return o;},destroy(){},scale:1}; return o; },
      graphics(){ return { fillStyle(){return this;},fillRect(){return this;},generateTexture(){},destroy(){} }; },
    },
    textures: { exists(){return false;}, },
    time: { delayedCall(ms,cb){ delayedCalls.push({ms,cb}); return { remove(){} }; } },
    tweens: { add(cfg){ tweens.push(cfg); if(cfg.onComplete) {/* 不自动调，测时手动 */} } },
    physics: { world: { pause(){}, resume(){} } },
    _tweens: tweens, _delayed: delayedCalls,
  };
}

// 用 data-URL 加载 JuiceKit（拦截 Phaser 和 AudioSystem import）
import { readFileSync } from 'fs';
const juiceSrc = readFileSync(new URL('../src/systems/JuiceKit.js', import.meta.url), 'utf8');
// 替换两个 import 行：Phaser 用全局 stub，AudioSystem 用内联空函数对象
const audioInline = `const AudioSystem = { notify(){},success(){},error(){},footstep(){},questDone(){},levelUp(){},uiClick(){},blip(){} };`;
const patched = juiceSrc
  .replace(/^import Phaser from 'phaser';/m, 'const Phaser = globalThis.Phaser;')
  .replace(/^import \{ AudioSystem \} from '\.\/AudioSystem\.js';/m, audioInline);
const blob = 'data:text/javascript;base64,' + Buffer.from(patched).toString('base64');
const { Juice } = await import(blob);

console.log('\n=== JuiceKit 单元测试 ===\n');

// --- 接口完整性 ---
ok('Juice.shake 存在', typeof Juice.shake === 'function');
ok('Juice.burst 存在', typeof Juice.burst === 'function');
ok('Juice.hitstop 存在', typeof Juice.hitstop === 'function');
ok('Juice.floatText 存在', typeof Juice.floatText === 'function');
ok('Juice.pop 存在', typeof Juice.pop === 'function');
ok('Juice.flash 存在', typeof Juice.flash === 'function');
ok('Juice.celebrate 存在', typeof Juice.celebrate === 'function');
ok('Juice.impact 存在', typeof Juice.impact === 'function');

// --- 无场景安全降级（不抛错）---
let threw = false;
try {
  Juice.shake(null);
  Juice.burst(null, 0, 0);
  Juice.hitstop(null);
  Juice.floatText(null, 0, 0, '+5');
  Juice.pop(null, null);
  Juice.flash(null);
  Juice.celebrate(null, 0, 0);
  Juice.impact(null);
} catch (e) { threw = true; console.log('   err:', e.message); }
ok('所有方法传 null scene 不抛错', !threw);

// --- shake 正常调用 ---
{
  const s = makeScene();
  let shaked = false;
  s.cameras.main.shake = (d, i) => { shaked = true; };
  Juice.shake(s, 0.015, 200);
  ok('shake 调用了 cameras.main.shake', shaked);
}

// --- floatText 创建文本并 tween ---
{
  const s = makeScene();
  Juice.floatText(s, 100, 200, '+5', '#6aaa6a');
  ok('floatText 创建了 tween', s._tweens.length === 1);
}

// --- pop 设置初始 scale + tween ---
{
  const s = makeScene();
  const obj = { setScale(v){ this.scale = v; return this; }, scale: 1 };
  Juice.pop(s, obj, 1.0);
  ok('pop 设置了初始 scale 0.7', obj.scale === 0.7);
  ok('pop 创建了 tween', s._tweens.length === 1);
}

// --- hitstop 暂停物理 + delayedCall 恢复 ---
{
  const s = makeScene();
  let paused = false, resumed = false;
  s.physics.world.pause = () => { paused = true; };
  s.physics.world.resume = () => { resumed = true; };
  Juice.hitstop(s, 80);
  ok('hitstop 暂停了物理', paused);
  // 手动触发 delayedCall 回调（模拟时间流逝）
  ok('hitstop 注册了 1 个 delayedCall', s._delayed.length === 1);
  s._delayed[0].cb();
  ok('hitstop 回调后恢复了物理', resumed);
}

// --- celebrate 调用 burst（创建 texture + particles）---
{
  const s = makeScene();
  Juice.celebrate(s, 100, 100, 0x6aaa6a);
  // celebrate 内部调 burst（加 delayedCall 销毁粒子）+ AudioSystem.success（stub 空）
  ok('celebrate 注册了 delayedCall（粒子销毁）', s._delayed.length >= 1);
}

// --- impact 调用 shake + hitstop ---
{
  const s = makeScene();
  let shaked = false;
  s.cameras.main.shake = () => { shaked = true; };
  Juice.impact(s, 0.012);
  ok('impact 触发了 shake', shaked);
  ok('impact 触发了 hitstop（delayedCall）', s._delayed.length >= 1);
}

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
