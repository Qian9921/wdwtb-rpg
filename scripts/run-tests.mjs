#!/usr/bin/env node
// 统一测试入口：跑全部 unit 测试；若存在校验脚本则一并运行。
// 用法：node scripts/run-tests.mjs  |  npm test
import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = join(ROOT, 'scripts');

const UNIT = readdirSync(SCRIPTS)
  .filter(f => f.startsWith('test-') && f.endsWith('.mjs'))
  .sort();

function runNode(scriptRel, extraArgs = []) {
  const scriptPath = join(SCRIPTS, scriptRel);
  if (!existsSync(scriptPath)) {
    console.log(`  ⏭ 跳过缺失脚本: ${scriptRel}`);
    return 0;
  }
  console.log(`\n▶ ${scriptRel}`);
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

// 可选内容校验：仅 validate-content（名册/工单/链文件存在性）。
// validate-taskchains 依赖 peer 侧 SUBROLES/WorldScene 全量 wiring，不作为默认 unit 门禁。
if (existsSync(join(SCRIPTS, 'validate-content.mjs'))) {
  const code = runNode('validate-content.mjs');
  results.push({ name: 'validate-content.mjs', code });
  if (code !== 0) failed++;
}

console.log('\n──────── 汇总 ────────');
for (const r of results) {
  console.log(`${r.code === 0 ? '✅' : '❌'} ${r.name}`);
}
console.log(`\n${failed === 0 ? '✅ 全部通过' : `❌ ${failed} 项失败`} (${results.length} suites)\n`);
process.exit(failed === 0 ? 0 : 1);
