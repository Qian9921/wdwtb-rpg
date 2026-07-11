// WorkValues 单元测试（纯 Node）。运行：node scripts/test-work-values.mjs
import { WorkValues, VALUE_KEYS, workGain } from '../src/systems/WorkValues.js';

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ' → ' + d : ''}`); } };

console.log('\n=== WorkValues 单元测试 ===\n');

{
  const wv = new WorkValues();
  ok('初始五维为0', VALUE_KEYS.every(k => wv.get(k) === 0));
  wv.gain({ pro: 6, comm: 3 });
  ok('gain 累加', wv.get('pro') === 6 && wv.get('comm') === 3);
  wv.gain({ pro: 200 });
  ok('封顶100', wv.get('pro') === 100);
  wv.gain({ nonexist: 5 });
  ok('忽略非法键', wv.vector().nonexist === undefined);
}

{
  const wv = new WorkValues({ pro: 40, exec: 50 });
  ok('初值可传', wv.get('pro') === 40 && wv.get('exec') === 50);
  const t = wv.top();
  ok('top 返回最强维', t.key === 'exec' && t.value === 50, JSON.stringify(t));
}

{
  const wv = new WorkValues();
  wv.gain({ pro: 30 });
  const data = wv.serialize();
  const wv2 = new WorkValues();
  wv2.restore(data);
  ok('serialize/restore 往返', wv2.get('pro') === 30);
  wv2.restore(null); ok('restore null 不抛错', wv2.get('pro') === 30);
}

// workGain 纯函数
{
  const g1 = workGain({ quality: 1, kind: 'work', subRole: 'dev' });
  ok('高质量→专业增益高', g1.pro >= 6, JSON.stringify(g1));
  const g2 = workGain({ quality: 0, kind: 'work', subRole: 'dev' });
  ok('低质量→专业增益低', g2.pro < g1.pro, `${g2.pro} vs ${g1.pro}`);
  const talk = workGain({ kind: 'talk' });
  ok('talk→沟通增益', talk.comm === 3);
  const gate = workGain({ quality: 0.8, kind: 'gate', subRole: 'test' });
  ok('test 把关→执行更高', gate.exec >= 3, JSON.stringify(gate));
}

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
