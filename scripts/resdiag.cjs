// 决定性实验:用 deviceScaleFactor=2 让 canvas backing 翻倍,看文字是否变清晰
const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless:'new', args:['--no-sandbox','--disable-gpu'] });
  const p = await b.newPage();
  // DPR=2 模拟高分屏:Phaser Scale.FIT 会据此把 backing 提高吗?
  await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
  await p.goto('http://localhost:5173/', { waitUntil:'networkidle2' });
  await sleep(2500);
  const info = await p.evaluate(() => {
    const c = document.querySelector('canvas');
    return { backingW: c.width, backingH: c.height, cssW: c.clientWidth, dpr: window.devicePixelRatio,
             gameW: window.__game?.scale?.gameSize?.width, gameH: window.__game?.scale?.gameSize?.height,
             mode: window.__game?.scale?.scaleMode };
  });
  console.log('DPR=2:', JSON.stringify(info));
  await p.screenshot({ path: '/tmp/res_dpr2.png', clip: { x: 560, y: 240, width: 800, height: 180 } });
  await b.close();
})();
