// 验证 zoom:2 效果:backing 尺寸 + 标题页/办公室清晰度局部放大
const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless:'new', args:['--no-sandbox','--disable-gpu'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await p.goto('http://localhost:5173/', { waitUntil:'domcontentloaded' });
  await sleep(2500);
  const info = await p.evaluate(() => { const c = document.querySelector('canvas'); return { backingW: c.width, backingH: c.height, cssW: c.clientWidth }; });
  console.log('backing:', JSON.stringify(info));
  await p.screenshot({ path: '/tmp/sharp_title.png' });
  await p.screenshot({ path: '/tmp/sharp_title_zoom.png', clip: { x: 560, y: 240, width: 800, height: 180 } });
  // 办公室
  await p.evaluate(() => { window.__game.scene.start('WorldScene', { career:'programmer', act:1 }); });
  await sleep(2500);
  await p.screenshot({ path: '/tmp/sharp_world.png' });
  await b.close();
})();
