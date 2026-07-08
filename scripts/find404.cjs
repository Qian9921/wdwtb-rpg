const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless:'new', args:['--no-sandbox','--disable-gpu'] });
  const p = await b.newPage();
  p.on('response', r => { if (r.status() === 404) console.log('404:', r.url()); });
  await p.goto('http://localhost:5173/', { waitUntil:'networkidle2' });
  await p.evaluate(() => { window.__game.scene.start('WorldScene', { career:'programmer', act:1 }); });
  await sleep(3000);
  await b.close();
})();
