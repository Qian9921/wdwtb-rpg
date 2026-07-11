// validate-taskchains.mjs：任务链×名册 数据完整性校验（全职业）。
// 检查项：
//  1. 每条 taskchain_{career}_{sub}.json 结构合法（quests[]、id 唯一、ordered、objectives）
//  2. requires 引用的任务 id 存在且无环（拓扑可排序）
//  3. giver / talk 目标 都能在对应 roster_{career}.json 的 npc id 里找到
//  4. talkLines 的 key 是本任务某个 talk 目标（不然台词永远不显示）
//  5. minigame 目标 target 必须是 'work'（WorldScene 只上报这个）
//  6. progressGain 合计=100（链走完=项目 100%，里程碑 25/50/75/100 全能触发）
//  7. 每环有 acceptLine/doneLine（派活/交付话术不缺）
//  8. HubScene SUBROLES 里每个 (career,subKey) 都有对应 taskchain 文件，反之亦然
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(root, 'public/data');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; }
  else { fail++; console.error(`✗ ${name}${detail ? ' → ' + detail : ''}`); }
};

// ---- 收集 taskchain / roster 文件 ----
const files = readdirSync(dataDir);
const chains = files.filter(f => /^taskchain_[a-z]+_[a-z]+\.json$/.test(f));
const rosters = {};
for (const f of files.filter(f => /^roster_[a-z]+\.json$/.test(f))) {
  const career = f.match(/^roster_([a-z]+)\.json$/)[1];
  try {
    const d = JSON.parse(readFileSync(join(dataDir, f), 'utf8'));
    rosters[career] = new Set((d.npcs || []).map(n => n.id));
    ok(`${f} npcs 非空且含 senior`, rosters[career].size > 0 && rosters[career].has('senior'));
    // linesByAct：非导师 NPC 应有随幕台词；结构必须是 {数字幕: 非空字符串数组}
    for (const n of (d.npcs || [])) {
      if (n.id === 'senior') continue; // 导师走剧情/派活，不需要寒暄池
      ok(`${f} ${n.id} 有 linesByAct 随幕台词`, !!n.linesByAct, '缺 linesByAct');
      if (!n.linesByAct) continue;
      let structOk = true, hasAct1 = false;
      for (const [k, v] of Object.entries(n.linesByAct)) {
        const kn = Number(k);
        if (!Number.isInteger(kn) || kn < 1 || kn > 5) structOk = false;
        if (kn === 1) hasAct1 = true;
        if (!Array.isArray(v) || v.length === 0 || v.some(s => typeof s !== 'string' || !s.trim())) structOk = false;
      }
      ok(`${f} ${n.id} linesByAct 结构合法(幕1-5,池非空)`, structOk);
      ok(`${f} ${n.id} 覆盖第1幕(开局不哑)`, hasAct1 || !!n.line, '无幕1台词也无兜底 line');
    }
  } catch (e) {
    ok(`${f} JSON 可解析`, false, e.message);
  }
}

console.log(`发现 ${chains.length} 条任务链 / ${Object.keys(rosters).length} 份名册\n`);

for (const f of chains) {
  const [, career, sub] = f.match(/^taskchain_([a-z]+)_([a-z]+)\.json$/);
  let d;
  try { d = JSON.parse(readFileSync(join(dataDir, f), 'utf8')); }
  catch (e) { ok(`${f} JSON 可解析`, false, e.message); continue; }

  const quests = d.quests || [];
  const tag = `${career}/${sub}`;
  ok(`[${tag}] quests 非空`, quests.length > 0);

  const ids = new Set();
  let gainSum = 0;
  const roster = rosters[career];
  ok(`[${tag}] 有对应名册 roster_${career}.json`, !!roster);

  for (const q of quests) {
    const qt = `[${tag}] ${q.id}`;
    ok(`${qt} id 唯一`, q.id && !ids.has(q.id));
    ids.add(q.id);
    ok(`${qt} 有 title/desc`, !!q.title && !!q.desc);
    ok(`${qt} 有 acceptLine`, typeof q.acceptLine === 'string' && q.acceptLine.length > 0);
    ok(`${qt} 有 doneLine`, typeof q.doneLine === 'string' && q.doneLine.length > 0);
    ok(`${qt} ordered=true`, q.ordered === true);
    ok(`${qt} giver 在名册`, !roster || roster.has(q.giver), `giver=${q.giver}`);
    ok(`${qt} progressGain 为正数`, typeof q.progressGain === 'number' && q.progressGain > 0);
    gainSum += q.progressGain || 0;

    const objs = q.objectives || [];
    ok(`${qt} objectives 非空`, objs.length > 0);
    const talkTargets = new Set();
    for (const o of objs) {
      ok(`${qt}.${o.id} 有 kind/text`, !!o.kind && !!o.text);
      if (o.kind === 'talk') {
        talkTargets.add(o.target);
        ok(`${qt}.${o.id} talk 目标在名册`, !roster || roster.has(o.target), `target=${o.target}`);
      }
      if (o.kind === 'minigame') {
        ok(`${qt}.${o.id} minigame 目标='work'`, o.target === 'work', `target=${o.target}`);
      }
    }
    // talkLines 的 key 必须是本任务的 talk 目标
    for (const k of Object.keys(q.talkLines || {})) {
      ok(`${qt} talkLines[${k}] 对应某 talk 目标`, talkTargets.has(k));
    }
  }

  // requires 引用存在 + 无环（Kahn 拓扑）
  const indeg = {}; const adj = {};
  for (const q of quests) { indeg[q.id] = 0; adj[q.id] = []; }
  let refsOk = true;
  for (const q of quests) {
    for (const r of (q.requires || [])) {
      if (!ids.has(r)) { refsOk = false; ok(`[${tag}] ${q.id} requires 引用存在`, false, `缺 ${r}`); continue; }
      adj[r].push(q.id); indeg[q.id]++;
    }
  }
  if (refsOk) ok(`[${tag}] requires 引用全部存在`, true);
  const queue = quests.filter(q => indeg[q.id] === 0).map(q => q.id);
  let seen = 0;
  while (queue.length) {
    const id = queue.shift(); seen++;
    for (const nx of adj[id]) { if (--indeg[nx] === 0) queue.push(nx); }
  }
  ok(`[${tag}] requires 无环(拓扑可排序)`, seen === quests.length);
  ok(`[${tag}] 首环无前置(可开局)`, quests.some(q => !(q.requires || []).length));
  ok(`[${tag}] progressGain 合计=100`, gainSum === 100, `实际=${gainSum}`);
}

// ---- 办公室随机事件：结构 + 幕次门槛 + effects 键合法 ----
const VALID_STATS = new Set(['health', 'energy', 'san', 'stress', 'skill', 'performance', 'money', 'passion']);
for (const f of files.filter(f => /^office_events_[a-z]+\.json$/.test(f))) {
  let d;
  try { d = JSON.parse(readFileSync(join(dataDir, f), 'utf8')); }
  catch (e) { ok(`${f} JSON 可解析`, false, e.message); continue; }
  const evts = d.events || [];
  ok(`${f} 事件≥10条(重复感门槛)`, evts.length >= 10, `实际=${evts.length}`);
  const ids = new Set();
  for (const e of evts) {
    const et = `${f} ${e.id}`;
    ok(`${et} id 唯一`, e.id && !ids.has(e.id));
    ids.add(e.id);
    ok(`${et} 有 title/text`, !!e.title && !!e.text);
    ok(`${et} 2-3 个选项`, Array.isArray(e.choices) && e.choices.length >= 2 && e.choices.length <= 3);
    if (e.minAct != null) ok(`${et} minAct 1-5`, e.minAct >= 1 && e.minAct <= 5);
    if (e.maxAct != null) ok(`${et} maxAct 1-5`, e.maxAct >= 1 && e.maxAct <= 5);
    for (const c of (e.choices || [])) {
      ok(`${et} 选项有 label/result`, !!c.label && !!c.result);
      for (const k of Object.keys(c.effects || {})) {
        ok(`${et} effects 键合法(${k})`, VALID_STATS.has(k));
      }
    }
  }
  // act1-5 每幕都至少有 3 个可触发事件(不空窗)
  for (let act = 1; act <= 5; act++) {
    const n = evts.filter(e => (e.minAct == null || act >= e.minAct) && (e.maxAct == null || act <= e.maxAct)).length;
    ok(`${f} 第${act}幕可触发事件≥3`, n >= 3, `实际=${n}`);
  }
}

// ---- HubScene SUBROLES ↔ taskchain 文件 双向对齐 ----
const hub = readFileSync(join(root, 'src/scenes/HubScene.js'), 'utf8');
const subrolesBlock = hub.slice(hub.indexOf('this.SUBROLES = {'), hub.indexOf('};', hub.indexOf('this.SUBROLES = {')));
const declared = [];
{
  // 逐职业解析 SUBROLES: career: [ {key:'x'},... ]
  const careerRe = /(\w+):\s*\[/g;
  let m;
  while ((m = careerRe.exec(subrolesBlock))) {
    const career = m[1];
    const seg = subrolesBlock.slice(m.index, subrolesBlock.indexOf(']', m.index));
    const keyRe = /key:\s*'(\w+)'/g;
    let k;
    while ((k = keyRe.exec(seg))) declared.push(`${career}_${k[1]}`);
  }
}
const chainKeys = chains.map(f => f.replace(/^taskchain_/, '').replace(/\.json$/, ''));
for (const dk of declared) {
  ok(`SUBROLES ${dk} 有 taskchain 文件`, chainKeys.includes(dk));
}
for (const ck of chainKeys) {
  ok(`taskchain_${ck}.json 在 SUBROLES 声明`, declared.includes(ck));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
