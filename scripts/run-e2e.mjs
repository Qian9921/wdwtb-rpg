#!/usr/bin/env node
/**
 * 可选浏览器 e2e 入口（不默认挂在 npm test 上，避免无 Chrome 的 CI 失败）。
 *
 * 用法：
 *   npm run test:e2e
 *   # 或：
 *   node scripts/run-e2e.mjs
 *
 * 行为：
 * 1. 探测 http://localhost:5173 是否已有 dev server
 * 2. 没有则自动 `vite --port 5173 --strictPort` 拉起，测完关掉
 * 3. 跑 e2e-mainline.cjs + e2e-career-smoke.cjs（E2E_SUITE=main|careers|all）
 *
 * 环境变量：
 *   E2E_BASE_URL   默认 http://localhost:5173
 *   E2E_SKIP_SERVER=1  不自动起服，连不上直接失败（适合外部已起服）
 *   E2E_PORT       默认 5173
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.E2E_PORT || 5173);
const BASE = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;
const SKIP_SERVER = process.env.E2E_SKIP_SERVER === '1';

function portFree(port) {
  return new Promise((resolve) => {
    const s = createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

async function waitForHttp(url, ms = 60000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(url, { method: 'GET' });
      if (r.ok || r.status === 304) return true;
    } catch {
      /* not up */
    }
    await sleep(400);
  }
  return false;
}

function runNode(scriptRel, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(ROOT, scriptRel)], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: 'inherit',
    });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      console.error('启动失败:', err.message);
      resolve(1);
    });
  });
}

function startVite(port) {
  const child = spawn(
    process.execPath,
    [join(ROOT, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: ROOT,
      env: { ...process.env, BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let log = '';
  child.stdout.on('data', (d) => { log += d.toString(); });
  child.stderr.on('data', (d) => { log += d.toString(); });
  return {
    child,
    dump: () => log.slice(-2000),
    stop: () => new Promise((resolve) => {
      if (child.exitCode != null) return resolve();
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* */ }
        resolve();
      }, 3000).unref?.();
    }),
  };
}

console.log('╔══════════════════════════════════════╗');
console.log('║  你想成为谁 · 浏览器 e2e             ║');
console.log('╚══════════════════════════════════════╝');
console.log(`目标: ${BASE}`);
console.log('(单元/内容校验请用 npm test；本命令可选、需 Chromium)\n');

let server = null;
let weStarted = false;

try {
  const free = await portFree(PORT);
  const alreadyUp = !free ? await waitForHttp(BASE, 3000) : false;

  if (alreadyUp) {
    console.log(`✓ 检测到已有服务 ${BASE}，复用\n`);
  } else if (SKIP_SERVER) {
    console.error(`❌ E2E_SKIP_SERVER=1 且 ${BASE} 不可达`);
    process.exit(1);
  } else {
    if (!free) {
      console.error(`❌ 端口 ${PORT} 被占用但 HTTP 不可达，请手动处理或改 E2E_PORT`);
      process.exit(1);
    }
    console.log(`▶ 自动启动 vite --port ${PORT} …`);
    server = startVite(PORT);
    weStarted = true;
    const ok = await waitForHttp(BASE, 90000);
    if (!ok) {
      console.error('❌ vite 启动超时\n--- 日志尾 ---\n' + server.dump());
      await server.stop();
      process.exit(1);
    }
    console.log(`✓ vite 就绪 ${BASE}\n`);
  }

  // e2e 脚本默认连 E2E_BASE_URL（见各 cjs）
  if (!BASE.includes(`:${PORT}`) && PORT !== 5173) {
    console.warn('⚠ 自定义端口请设置 E2E_BASE_URL 与 E2E_PORT 一致');
  }

  // E2E_SUITE=main|careers|chain|full|deep|all（默认 all）
  //   main    主线剧情推进
  //   careers 非程序员职业冒烟
  //   chain   任务链接线 + 全日循环 + 新功能 + 回流
  //   full    全程通关(dev+test 双链,较慢)
  //   deep    chain + full + 全职业运行时烟测(最全,最慢)
  const suite = (process.env.E2E_SUITE || 'all').toLowerCase();
  const SUITES = {
    main:    ['scripts/e2e-mainline.cjs'],
    careers: ['scripts/e2e-career-smoke.cjs'],
    chain:   ['scripts/e2e-taskchain.cjs', 'scripts/e2e-fullloop.cjs',
              'scripts/e2e-newfeatures.cjs', 'scripts/e2e-replay.cjs',
              'scripts/e2e-events.cjs', 'scripts/e2e-title.cjs', 'scripts/e2e-items.cjs'],
    full:    ['scripts/e2e-fullgame.cjs', 'scripts/e2e-fullgame-test.cjs'],
    all:     ['scripts/e2e-mainline.cjs', 'scripts/e2e-career-smoke.cjs',
              'scripts/e2e-taskchain.cjs', 'scripts/e2e-fullloop.cjs'],
  };
  SUITES.deep = [...SUITES.all, ...SUITES.chain.filter(s => !SUITES.all.includes(s)),
    ...SUITES.full, 'scripts/e2e-allcareers.cjs', 'scripts/e2e-shortstory.cjs',
    'scripts/e2e-title.cjs', 'scripts/e2e-items.cjs'];
  const scripts = SUITES[suite] || SUITES.main;

  let code = 0;
  for (const s of scripts) {
    console.log(`\n—— 运行 ${s} ——`);
    const c = await runNode(s, { E2E_BASE_URL: BASE });
    if (c !== 0) code = c;
  }

  if (weStarted && server) await server.stop();
  process.exit(code);
} catch (e) {
  console.error('崩溃:', e);
  if (weStarted && server) await server.stop();
  process.exit(1);
}
