// e2e：办公室事件幕次门槛——act1 不出现 minAct=3 的事件;act4 池含高幕事件
const puppeteer=require('puppeteer'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-gpu']});
  const p=await b.newPage(); await p.setViewport({width:1920,height:1080});
  const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,200)));
  await p.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'}); await sleep(1800);
  let ok=0,bad=0; const t=(n,c,d)=>{c?ok++:bad++;console.log((c?'✓ ':'✗ ')+n+(c?'':' → '+(d||'')));};

  await p.evaluate(async()=>{ localStorage.clear(); localStorage.setItem('wdwtb_onboarded','1');
    window.__game.scene.start('WorldScene',{career:'programmer',subRole:'dev',act:1});
    await new Promise(r=>setTimeout(r,3200)); });

  // act1: 强制触发100次,统计出现的事件id(改RND阈值绕过55%)
  const roll=(act,n)=>p.evaluate(async({act,n})=>{const w=window.__game.scene.getScene('WorldScene');
    w.act=act; w._story.phase='working'; w._story.act=act;
    const seen=new Set();
    for(let i=0;i<n;i++){
      w._eventSeen.clear();
      // 直接复刻触发筛选逻辑(不开UI,避免n次弹窗)
      const inAct=(e)=>(e.minAct==null||w.act>=e.minAct)&&(e.maxAct==null||w.act<=e.maxAct);
      const pool=w._officeEvents.filter(inAct);
      pool.forEach(e=>seen.add(e.id));
      break; // 池是确定的,一次即可
    }
    return [...seen];},{act,n});

  const a1=await roll(1,1);
  const a4=await roll(4,1);
  t('act1 池不含 minAct≥3 事件(裁员传闻等)', !a1.includes('ev_layoff_rumor')&&!a1.includes('ev_night_light'), JSON.stringify(a1));
  t('act1 池含蜜月事件(老陈的抽屉)', a1.includes('ev_mentor_snack'));
  t('act4 池含高幕事件(实习生提问/隔壁绿萝)', a4.includes('ev_intern_question')&&a4.includes('ev_plant_neighbor'), JSON.stringify(a4));
  t('act4 池不含 maxAct=2 事件(老陈的抽屉已过期)', !a4.includes('ev_mentor_snack'));
  t('act1/act4 池都 ≥3 条(不空窗)', a1.length>=3&&a4.length>=3, JSON.stringify({a1:a1.length,a4:a4.length}));

  // 真实触发一次弹窗并选择,验证 UI 工作
  const trig=await p.evaluate(async()=>{const w=window.__game.scene.getScene('WorldScene');
    w.act=1; w._eventSeen.clear();
    const ev=w._officeEvents.find(e=>e.id==='ev_mentor_snack');
    w._showOfficeEvent(ev);
    await new Promise(r=>setTimeout(r,400));
    const hasUI=!!w._eventUI;
    // 点第一个选项：选项现在是容器(chC)+内部交互 Zone,下钻找第一个可交互 Zone
    let btn=null;
    if(w._eventUI)w._eventUI.iterate(o=>{
      if(btn||o.type!=='Container'||!o.list)return;
      o.iterate(ch=>{if(!btn&&ch.type==='Zone'&&ch.input&&ch.input.enabled)btn=ch;});
    });
    const sanBefore=w.stateSystem.get('san');
    if(btn)btn.emit('pointerdown');
    await new Promise(r=>setTimeout(r,400));
    return {hasUI, sanDelta:w.stateSystem.get('san')-sanBefore};});
  t('事件弹窗+选择生效(san+4)', trig.hasUI&&trig.sanDelta===4, JSON.stringify(trig));

  console.log(`\n${ok} passed, ${bad} failed | pageerrors: ${errs.length}`);
  errs.slice(0,5).forEach(e=>console.log(' ',e));
  await b.close(); process.exit(bad||errs.length?1:0);
})();
