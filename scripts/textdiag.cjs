// 运行时诊断:同一场景,分别在 pixelated / auto 两种 image-rendering 下截图对比
const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless:'new', args:['--no-sandbox','--disable-gpu','--force-device-scale-factor=1'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await p.goto('http://localhost:5173/', { waitUntil:'networkidle2' });
  await sleep(2500);
  // 态1: 当前(pixelated) 标题页局部放大
  await p.screenshot({ path: '/tmp/text_pixelated.png', clip: { x: 560, y: 240, width: 800, height: 180 } });
  // 态2: 动态改成 auto(平滑)
  await p.evaluate(() => { document.querySelector('canvas').style.imageRendering = 'auto'; });
  await sleep(300);
  await p.screenshot({ path: '/tmp/text_auto.png', clip: { x: 560, y: 240, width: 800, height: 180 } });
  // 报告 canvas 实际尺寸 vs 显示尺寸(拉伸倍数)
  const info = await p.evaluate(() => {
    const c = document.querySelector('canvas');
    return { backingW: c.width, backingH: c.height, cssW: c.clientWidth, cssH: c.clientHeight, dpr: window.devicePixelRatio };
  });
  console.log(JSON.stringify(info));
  await b.close();
})();
