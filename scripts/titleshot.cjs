const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-gpu'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1920, height: 1080 });
  p.on('pageerror', e => console.log('[err]', String(e).slice(0,160)));

  // 态1：无存档
  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
  await p.evaluate(() => localStorage.removeItem('wdwtb_save'));
  await p.reload({ waitUntil: 'networkidle2' });
  await sleep(2500);
  await p.screenshot({ path: '/tmp/title_nosave.png' });
  console.log('shot nosave');

  // 态2：有存档
  await p.evaluate(() => localStorage.setItem('wdwtb_save', JSON.stringify({ career:'programmer', act:3 })));
  await p.reload({ waitUntil: 'networkidle2' });
  await sleep(2500);
  await p.screenshot({ path: '/tmp/title_save.png' });
  console.log('shot save');

  await b.close(); console.log('done');
})();
