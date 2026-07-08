const puppeteer = require('puppeteer');
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-gpu'] });
  const p = await b.newPage();
  p.on('console', m => console.log('[console]', m.text().slice(0,160)));
  p.on('pageerror', e => console.log('[PAGEERROR]', String(e).slice(0,200)));
  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2500));
  const hasGame = await p.evaluate(() => typeof window.__game);
  console.log('window.__game type:', hasGame);
  await b.close();
})();
