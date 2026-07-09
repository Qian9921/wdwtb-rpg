const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless:'new', args:['--no-sandbox','--disable-gpu'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  const errors = [];
  p.on('pageerror', e => errors.push(String(e).slice(0,150)));
  await p.goto('http://localhost:5173/', { waitUntil:'domcontentloaded' });
  await sleep(2000);
  await p.evaluate(async () => {
    window.__game.scene.start('WorldScene', { career:'programmer', act:1 });
    await new Promise(r => setTimeout(r, 2500));
    const ws = window.__game.scene.getScene('WorldScene');
    ws.dialogueActive = true;
    ws.dialogueEngine.start({ start:'a', nodes:{
      a:{ speaker:'老陈', text:'欢迎来到团队。这里的活不轻松,但我会带你。先坐下,我给你讲讲我们在做什么。', choices:[{label:'(继续)', next:'b'}] },
      b:{ speaker:'', text:'完', choices:[] }
    }});
  });
  await sleep(2500);
  await p.screenshot({ path: '/tmp/dlg_cam.png' });
  console.log('ERRORS:', errors.length); errors.forEach(e=>console.log(e));
  await b.close();
})();
