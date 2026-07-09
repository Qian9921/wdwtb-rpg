// ThoughtSystem 单元测试（纯 Node，无 Phaser）。用真实 monologues.json 验证。
// 运行：node scripts/test-thoughtsystem.mjs
import { readFileSync } from 'fs';
import { ThoughtSystem, VOICES } from '../src/systems/ThoughtSystem.js';

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ' → ' + d : ''}`); } };

const MONO = JSON.parse(readFileSync(new URL('../public/data/monologues.json', import.meta.url), 'utf8'));

// 状态工厂（默认健康）
const S = (over = {}) => ({ health: 80, energy: 100, san: 80, stress: 20, skill: 30, performance: 50, money: 0, passion: 70, ...over });

console.log('\n=== ThoughtSystem 单元测试 ===\n');

// load
{
  const ts = new ThoughtSystem();
  ok('未 load 时 isReady=false', ts.isReady() === false);
  ts.load(MONO);
  ok('load 后 isReady=true', ts.isReady() === true);
  ok('load 后 pools 含 high_stress', Array.isArray(ts.pools.high_stress) && ts.pools.high_stress.length > 0);
}

// pickVoice：压力高 → analyst
{
  const ts = new ThoughtSystem(); ts.load(MONO);
  const v = ts.pickVoice(S({ stress: 80 }));
  ok('压力80 触发 analyst(理性)', v && v.id === 'analyst', v && v.id);
}

// pickVoice：健康+精力低 → weary
{
  const ts = new ThoughtSystem(); ts.load(MONO);
  const v = ts.pickVoice(S({ health: 25, energy: 20, stress: 20, san: 80, passion: 70 }));
  ok('健康25精力20 触发 weary(疲惫)', v && v.id === 'weary', v && v.id);
}

// pickVoice：热情高技能够 → dreamer
{
  const ts = new ThoughtSystem(); ts.load(MONO);
  const v = ts.pickVoice(S({ passion: 80, skill: 50, stress: 20, san: 80, health: 80 }));
  ok('热情80技能50 触发 dreamer(追光)', v && v.id === 'dreamer', v && v.id);
}

// pickVoice：中性状态（不高不低）→ 无触发
{
  const ts = new ThoughtSystem(); ts.load(MONO);
  // 热情55(未达dreamer的70)、压力40(未达analyst的65)、其余中位 → 无人触发
  const v = ts.pickVoice(S({ stress: 40, san: 60, passion: 55, health: 60, energy: 60, performance: 50, skill: 35 }));
  ok('中性状态无声音触发', v === null, v && v.id);
}

// think：返回完整思维对象
{
  const ts = new ThoughtSystem(); ts.load(MONO);
  const t = ts.think(S({ stress: 85 }));
  ok('think 返回 voice', t && t.voice && t.voice.id === 'analyst');
  ok('think 返回 text（真实台词）', t && typeof t.text === 'string' && t.text.length > 0);
  ok('think 返回 scene', t && t.scene === 'high_stress');
}

// think：无触发返回 null
{
  const ts = new ThoughtSystem(); ts.load(MONO);
  const t = ts.think(S());
  ok('健康状态 think 返回 null', t === null);
}

// 避免同人格连续刷屏
{
  const ts = new ThoughtSystem(); ts.load(MONO);
  const stats = S({ stress: 85, health: 25, energy: 20 }); // analyst + weary 都触发
  const t1 = ts.think(stats);
  const t2 = ts.think(stats);
  ok('连续 think 换不同人格（防刷屏）', t1 && t2 && t1.voice.id !== t2.voice.id, `${t1 && t1.voice.id} vs ${t2 && t2.voice.id}`);
}

// pickLine 从正确的池取
{
  const ts = new ThoughtSystem(); ts.load(MONO);
  const analyst = VOICES.find(v => v.id === 'analyst');
  const line = ts.pickLine(analyst);
  ok('pickLine 从 high_stress 池取台词', MONO.scenes.high_stress.includes(line));
}

// buildAIPrompt
{
  const ts = new ThoughtSystem(); ts.load(MONO);
  const analyst = VOICES.find(v => v.id === 'analyst');
  const { sys, user } = ts.buildAIPrompt(analyst, S({ stress: 80 }), '反复加班3次');
  ok('buildAIPrompt 返回 sys（含人格设定）', sys.includes('理性'));
  ok('buildAIPrompt 返回 user（含状态）', user.includes('压力80'));
  ok('buildAIPrompt user 含选择历史', user.includes('反复加班3次'));
}

// serialize / restore
{
  const ts = new ThoughtSystem(); ts.load(MONO);
  ts.think(S({ stress: 85 }));
  const data = ts.serialize();
  ok('serialize 返回 recentVoices', Array.isArray(data.recentVoices) && data.recentVoices.length > 0);
  const ts2 = new ThoughtSystem(); ts2.load(MONO);
  ts2.restore(data);
  ok('restore 恢复 recentVoices', ts2._recentVoices.length === data.recentVoices.length);
  ts2.restore(null); ok('restore null 不抛错', true);
}

// 容错
{
  const ts = new ThoughtSystem();
  ok('未 load 时 think 返回 null', ts.think(S({ stress: 85 })) === null);
  ok('pickVoice null stats 返回 null', ts.pickVoice(null) === null);
  ts.load(null); ok('load null 不抛错', ts.isReady() === false);
}

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
