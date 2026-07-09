// 三个职业场景对比截图:programmer/designer/doctor
const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless:'new', args:['--no-sandbox','--disable-gpu'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1600, height: 900 });
  p.on('pageerror', e => console.log('[err]', String(e).slice(0,120)));
  await p.goto('http://localhost:5173/', { waitUntil:'networkidle2' });
  await sleep(1500);
  for (const c of ['designer','doctor','lawyer']) {
    await p.evaluate((cc) => { window.__game.scene.start('WorldScene', { career: cc, act: 1 }); }, c);
    await sleep(2500);
    await p.screenshot({ path: `/tmp/career_${c}.png` });
    console.log('shot', c);
  }
  await b.close();
})();
