// 截图首页(OFFERED标题) + 大厅(灰度职业)
const puppeteer = require('/home/liangyu/wdwtb-transfer/node_modules/puppeteer');
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 720 });
  await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__game && window.__game.scene, { timeout: 10000 });
  await new Promise(r => setTimeout(r, 2500)); // 等标题动画播完
  await p.screenshot({ path: '/tmp/shot-title.png' });
  console.log('首页截图 → /tmp/shot-title.png');
  // 进大厅看灰度
  await p.evaluate(() => {
    localStorage.setItem('wdwtb_profile', JSON.stringify({ riasec: { R: 3, I: 4 }, name: '测试' }));
    window.__game.scene.start('HubScene');
  });
  await new Promise(r => setTimeout(r, 1800));
  await p.screenshot({ path: '/tmp/shot-hub.png' });
  console.log('大厅截图 → /tmp/shot-hub.png');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
