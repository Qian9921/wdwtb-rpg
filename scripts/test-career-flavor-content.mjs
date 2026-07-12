// 职业感内容门禁：产品/律师任务链 + 办公室事件须有足够「职业动词」与对话质感
// （服务初衷：让毕业生试得真，而不是换皮模板）
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'public/data');
let pass = 0, fail = 0;
const ok = (n, c, d) => {
  if (c) { pass++; console.log(`  ✓ ${n}`); }
  else { fail++; console.log(`  ✗ ${n}${d ? ' → ' + d : ''}`); }
};

function load(name) {
  return JSON.parse(readFileSync(join(DATA, name), 'utf8'));
}

function quests(data) {
  return Array.isArray(data.quests) ? data.quests : [];
}

function events(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.events)) return data.events;
  return [];
}

/** 文本是否含职业关键词（至少命中 min 个不同词） */
function hits(text, words, min = 1) {
  const t = text || '';
  let n = 0;
  for (const w of words) if (t.includes(w)) n++;
  return n >= min;
}

function blobOfQuests(qs) {
  return qs.map(q => [
    q.title, q.desc, q.acceptLine, q.doneLine,
    JSON.stringify(q.talkLines || {}),
    JSON.stringify(q.objectives || []),
  ].join(' ')).join(' ');
}

function assertChain(label, file, {
  minQuests = 3,
  words = [],
  minWordHits = 4,
  requireWork = true,
  requireTalkLines = false,
} = {}) {
  const data = load(file);
  const qs = quests(data);
  ok(`${label} ≥${minQuests} 环`, qs.length >= minQuests, `got ${qs.length}`);
  let blob = '';
  for (const q of qs) {
    blob += [q.title, q.desc, q.acceptLine, q.doneLine, JSON.stringify(q.talkLines || {})].join(' ');
    ok(`${q.id} acceptLine≥12`, (q.acceptLine || '').length >= 12);
    ok(`${q.id} doneLine≥8`, (q.doneLine || '').length >= 8);
    ok(`${q.id} ordered`, q.ordered === true);
    ok(`${q.id} talk 目标`, (q.objectives || []).some(o => o.kind === 'talk'));
    if (requireWork) {
      ok(`${q.id} work 小游戏`, (q.objectives || []).some(o => o.kind === 'minigame' && o.target === 'work'));
    }
    if (requireTalkLines) {
      ok(`${q.id} talkLines 非空`, q.talkLines && Object.keys(q.talkLines).length >= 1);
    }
  }
  if (words.length) {
    ok(`${label} 职业词≥${minWordHits}`, hits(blob, words, minWordHits), blob.slice(0, 100));
  }
  return { qs, blob };
}

function assertEvents(label, file, { min = 6, words = [], minWordHits = 3 } = {}) {
  const ev = events(load(file));
  ok(`${label} 事件≥${min}`, ev.length >= min, `got ${ev.length}`);
  let blob = '';
  let withChoice = 0;
  let withActGate = 0;
  for (const e of ev) {
    ok(`${e.id || '?'} 有 title`, !!(e.title && String(e.title).length >= 2));
    ok(`${e.id || '?'} 有 text`, !!(e.text && String(e.text).length >= 12));
    blob += [e.title, e.text, JSON.stringify(e.choices || [])].join(' ');
    if (Array.isArray(e.choices) && e.choices.length >= 2) withChoice++;
    if (e.minAct != null || e.maxAct != null) withActGate++;
    for (const c of (e.choices || [])) {
      ok(`${e.id} choice label`, !!(c.label && c.label.length >= 2));
    }
  }
  ok(`${label} 双选项事件≥3`, withChoice >= 3);
  ok(`${label} 幕次门槛≥1`, withActGate >= 1);
  if (words.length) {
    ok(`${label} 事件职业词≥${minWordHits}`, hits(blob, words, minWordHits));
  }
  return blob;
}

console.log('\n=== Career flavor content (product / lawyer) ===\n');

const productWords = ['PRD', '需求', '漏斗', '转化', '研发', '路径', '优先级', '用户', '指标', '评审', '原型', '验收'];
const lawWords = ['争点', '阅卷', '证据', '开庭', '原件', '证明', '诉讼', '庭', '对方', '事实', '尽调', '合同', '意见书'];
const productEventWords = ['需求', '数据', '评审', '用户', 'PRD', '迭代', '转化', '入口'];
const lawEventWords = ['时效', '证据', '委托', '律师', '冲突', '败诉', '代理', '案'];

const biz = assertChain('product biz', 'taskchain_product_biz.json', {
  words: productWords, minWordHits: 4, requireWork: true,
});
const ux = assertChain('product ux', 'taskchain_product_ux.json', {
  words: ['体验', '走查', '原型', '可用性', '验收', '交互', '竞品', '用户'],
  minWordHits: 4, requireWork: true,
});
const lit = assertChain('lawyer lit', 'taskchain_lawyer_litigation.json', {
  words: lawWords, minWordHits: 4, requireWork: false, requireTalkLines: true,
});
const corp = assertChain('lawyer corp', 'taskchain_lawyer_corporate.json', {
  words: ['尽调', '合同', '清单', '意见', '条款', '交易', '审查', '归档'],
  minWordHits: 3, requireWork: false, requireTalkLines: true,
});

const pev = assertEvents('product office', 'office_events_product.json', {
  words: productEventWords, minWordHits: 3,
});
const lev = assertEvents('lawyer office', 'office_events_lawyer.json', {
  words: lawEventWords, minWordHits: 3,
});

// 产品 vs 律师：防换皮
ok('产品/律师任务链不全同', biz.blob.slice(0, 200) !== lit.blob.slice(0, 200));
ok('律师含争点或阅卷', lit.blob.includes('争点') || lit.blob.includes('阅卷'));
ok('产品含 PRD 或需求或漏斗',
  biz.blob.includes('PRD') || biz.blob.includes('需求') || biz.blob.includes('漏斗'));
ok('ux 含体验/走查', ux.blob.includes('体验') || ux.blob.includes('走查'));
ok('corp 含尽调或合同', corp.blob.includes('尽调') || corp.blob.includes('合同'));
ok('产品/律师办公室事件不全同', pev.slice(0, 120) !== lev.slice(0, 120));

// WorldScene juice 关键路径：静态扫描，防止手感回退
{
  const ws = readFileSync(join(DATA, '../../src/scenes/WorldScene.js'), 'utf8');
  ok('WS 交付 celebrate', ws.includes("Juice.celebrate") && ws.includes('✓ 交付'));
  ok('WS 接任务 floatText 新任务', ws.includes('新任务接取'));
  ok('WS 里程碑 floatText', ws.includes('📊 ${pct}%') || ws.includes('📊'));
  ok('WS 一天结束 flash/float', ws.includes('一天结束'));
  // impact 必须是 intensity 签名，不能把坐标当第二参
  ok('WS impact 用 intensity', /Juice\.impact\(\s*this\s*,\s*0\.\d+/.test(ws));
  ok('WS 用 tryPickOfficeEvent', ws.includes('tryPickOfficeEvent'));
  ok('WS 事件弹出 floatText', ws.includes('办公室事件'));
  ok('WS 用 seniorInteractAction', ws.includes('seniorInteractAction'));
  ok('WS 用 applySeniorAction', ws.includes('applySeniorAction'));
  const ps = readFileSync(join(DATA, '../../src/scenes/PauseScene.js'), 'utf8');
  ok('Pause 用 buildPauseInsight', ps.includes('buildPauseInsight'));
  const es = readFileSync(join(DATA, '../../src/scenes/EndingScene.js'), 'utf8');
  ok('Ending 用 history 对照', es.includes('REPORT_HISTORY_KEY') && es.includes('contrast'));
  ok('Ending 渲染对照行', es.includes('contrastLine') || es.includes('contrast.line'));
}

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
