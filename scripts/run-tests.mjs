#!/usr/bin/env node
// 统一测试入口：unit + content + story 校验（AC1 门禁）。
// 用法：node scripts/run-tests.mjs  |  npm test
import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = join(ROOT, 'scripts');
const DATA = join(ROOT, 'public/data');

const UNIT = readdirSync(SCRIPTS)
  .filter(f => f.startsWith('test-') && f.endsWith('.mjs'))
  .sort();

// 与 package.json validate:story 对齐的深度剧情 + 轻量 light_*（若存在）
const STORY_FILES = [
  'programmer_act1', 'programmer_act2', 'programmer_act3', 'programmer_act4', 'programmer_act5',
  'product_act1', 'product_act2', 'product_act3', 'product_act4', 'product_act5',
  'admin_act1', 'admin_act2', 'admin_act3', 'admin_act4', 'admin_act5',
  'light_designer', 'light_operation', 'light_teacher', 'light_doctor',
  'light_civilservant', 'light_sales', 'light_lawyer',
].map(f => join(DATA, f + '.json')).filter(p => existsSync(p));

function runNode(scriptRel, extraArgs = []) {
  const scriptPath = join(SCRIPTS, scriptRel);
  if (!existsSync(scriptPath)) {
    console.log(`  ⏭ 跳过缺失脚本: ${scriptRel}`);
    return 0;
  }
  console.log(`\n▶ ${scriptRel}${extraArgs.length ? ' …' : ''}`);
  const r = spawnSync(process.execPath, [scriptPath, ...extraArgs], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.error) {
    console.error(`  启动失败: ${r.error.message}`);
    return 1;
  }
  return r.status ?? 1;
}

console.log('╔══════════════════════════════════════╗');
console.log('║  你想成为谁 · 测试套件               ║');
console.log('╚══════════════════════════════════════╝');

let failed = 0;
const results = [];

for (const f of UNIT) {
  const code = runNode(f);
  results.push({ name: f, code });
  if (code !== 0) failed++;
}

// content 完整性
{
  const code = runNode('validate-content.mjs');
  results.push({ name: 'validate-content.mjs', code });
  if (code !== 0) failed++;
}

// story 图可达性（AC1 要求）
if (STORY_FILES.length === 0) {
  console.log('\n▶ validate-story.mjs');
  console.error('  ❌ 未找到任何剧情 JSON（public/data/*_act*.json / light_*.json）');
  results.push({ name: 'validate-story.mjs', code: 1 });
  failed++;
} else {
  const code = runNode('validate-story.mjs', STORY_FILES);
  results.push({ name: 'validate-story.mjs', code });
  if (code !== 0) failed++;
}

console.log('\n──────── 汇总 ────────');
for (const r of results) {
  console.log(`${r.code === 0 ? '✅' : '❌'} ${r.name}`);
}
console.log(`\n${failed === 0 ? '✅ 全部通过' : `❌ ${failed} 项失败`} (${results.length} suites)\n`);
process.exit(failed === 0 ? 0 : 1);
