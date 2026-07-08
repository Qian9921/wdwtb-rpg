const puppeteer = require('puppeteer');
(async () => {
  const url = process.argv[2] || 'http://localhost:5173/';
  const out = process.argv[3] || '/tmp/ls.png';
  const wait = parseInt(process.argv[4] || '3000');
  const [w,h] = (process.argv[5]||'1280x800').split('x').map(Number);
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h });
  page.on('pageerror', e => console.log('[err]', String(e).slice(0,150)));
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, wait));
  await page.screenshot({ path: out });
  await browser.close();
  console.log('saved', out);
})();
