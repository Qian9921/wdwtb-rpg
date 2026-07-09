const puppeteer = require('puppeteer');
(async () => {
  const b = await puppeteer.launch({ headless:'new', args:['--no-sandbox','--disable-gpu'] });
  const p = await b.newPage();
  p.on('console', m => { const t = m.text(); if (/miss|fail|error|not found|texture/i.test(t)) console.log('[console]', t.slice(0,150)); });
  await p.goto('http://localhost:5173/', { waitUntil:'networkidle2' });
  await p.evaluate(() => window.__game.scene.start('WorldScene', { career:'programmer', act:1 }));
  await new Promise(r=>setTimeout(r,2500));
  await b.close();
})();
