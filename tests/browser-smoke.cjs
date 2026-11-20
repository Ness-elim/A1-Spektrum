// Optional real-browser checks, using a temporary Edge profile and local HTTP server.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const {spawn}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'spektrum-browser-'));
  const server=http.createServer(async(req,res)=>{
    try{
      const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '')||'index.html';
      const file=path.resolve(root,rel);
      if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}
      const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.jpg':'image/jpeg','.png':'image/png','.mp3':'audio/mpeg'};
      const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(body);
    }catch{res.writeHead(404);res.end('Not found')}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port+'/index.html';
  const executable=process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const browser=spawn(executable,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let ws;
  try{
    let port;
    for(let i=0;i<100;i++){
      try{port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await wait(100)}
    }
    assert.ok(port,'Browser debugging endpoint started');
    const tab=await fetch('http://127.0.0.1:'+port+'/json/new?about:blank',{method:'PUT'}).then(r=>r.json());
    ws=new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
    let seq=0;const pending=new Map(),errors=[];
    ws.onmessage=event=>{
      const message=JSON.parse(event.data);
      if(message.id){const p=pending.get(message.id);pending.delete(message.id);if(p){clearTimeout(p.timer);message.error?p.reject(new Error(JSON.stringify(message.error))):p.resolve(message.result)}}
      if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);
    };
    const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Timeout: '+method))},15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))});
    const evaluate=async(expression,awaitPromise=false)=>{
      const r=await send('Runtime.evaluate',{expression,awaitPromise,returnByValue:true});
      if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
      return r.result.value;
    };
    const until=async expr=>{for(let i=0;i<100;i++){if(await evaluate(expr))return;await wait(50)}throw new Error('Timed out waiting for '+expr)};
    await send('Runtime.enable');await send('Page.enable');
    await send('Page.navigate',{url});await until("document.readyState==='complete'&&!!document.querySelector('.hero')");
    assert.equal(await evaluate('window.SPEKTRUM_DATA.chapters.length'),12);
    for(const page of ['chapters','vocabulary','review','wordtest','audio','exam','structures','search','progress','settings','home']){
      await evaluate('document.querySelector(\'.nav-item[data-page="'+page+'"]\').click()');
      assert.ok(await evaluate('document.querySelector("#pageHost").textContent.trim().length>10'),page+' rendered');
    }
    await evaluate("document.querySelector('.nav-item[data-page=exam]').click();document.querySelectorAll('[data-exam]').forEach(b=>b.click());document.querySelector('#examSpeaking3').value='Bitte helfen Sie mir.';document.querySelector('#saveExamOpenPage').click()");
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('spektrum-a1-study-v1')).answers['exam-p262'].speaking3"),'Bitte helfen Sie mir.','Exam page navigation and speaking save work');
    await evaluate("document.querySelector('[data-exam=exam-p255]').click();var field=window.SPEKTRUM_BANKS.CORRECTION_KEYS['exam-p255'].fields[0],row=document.querySelector('[data-correction-row=\"0\"]'),option=Array.from(row.querySelectorAll('.wb-corr-pill')).find(b=>b.dataset.value.toLowerCase()===field.answers[0].toLowerCase());if(option)option.click();else{row.querySelector('.wb-line').value=field.answers[0];row.querySelector('.wb-line').dispatchEvent(new Event('input',{bubbles:true}))}row.querySelector('[data-check-field]').click()");
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('spektrum-a1-study-v1')).answers['exam-p255'].check.checkedCount"),1,'Exam correction is independent per question');
    assert.equal(await evaluate("document.querySelector('.startdeutsch-page-toolbar .muted').textContent.includes('1/')"),true,'Exam progress updates immediately after one check');
    await evaluate("window.testActivity=window.SPEKTRUM_DATA.activities.find(a=>a.chapter===1&&a.section==='Main course'&&window.SPEKTRUM_BANKS.CORRECTION_KEYS[a.id]?.fields.length>=3);document.querySelector('.nav-item[data-page=chapters]').click();document.querySelector('[data-ch=\"1\"]').click();document.querySelector('[data-aid=\"'+window.testActivity.id+'\"]').click()");
    await evaluate("var spec=window.SPEKTRUM_BANKS.CORRECTION_KEYS[window.testActivity.id],input=document.querySelector('.wb-line');input.value=spec.fields[0].unordered?spec.fields[0].unordered.join(', '):spec.fields[0].answers[0];input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-check-field=\"0\"]').click()");
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('spektrum-a1-study-v1')).answers[window.testActivity.id].check.checkedCount"),1,'One answer can be checked without completing the page');
    assert.equal(await evaluate("Array.from(document.querySelectorAll('[data-correction-feedback]')).slice(1).every(e=>e.textContent==='')"),true,'Untouched answers are not marked wrong or revealed');
    await evaluate("var input=document.querySelectorAll('.wb-line')[1];input.value='wrong answer';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
    assert.equal(await evaluate("JSON.stringify(JSON.parse(localStorage.getItem('spektrum-a1-study-v1')).answers[window.testActivity.id].check.results.slice(0,3))"),'[true,false,null]','Enter checks only the focused answer');
    const partialId=await evaluate('window.testActivity.id');
    await send('Page.reload');await until("document.readyState==='complete'&&!!document.querySelector('#activityHost')");
    assert.equal(await evaluate("document.querySelector('[data-correction-row=\"0\"]').classList.contains('is-correct')&&document.querySelector('[data-correction-row=\"1\"]').classList.contains('is-wrong')"),true,'Partial results survive reload');
    assert.equal(await evaluate("document.querySelector('[data-correction-feedback=\"2\"]').textContent"),'','Unchecked answer stays neutral after reload');
    await evaluate('window.testActivity=window.SPEKTRUM_DATA.activities.find(a=>a.id==='+JSON.stringify(partialId)+');var spec=window.SPEKTRUM_BANKS.CORRECTION_KEYS[window.testActivity.id];document.querySelectorAll(".wb-line").forEach((input,i)=>{input.value=spec.fields[i].unordered?spec.fields[i].unordered.join(", "):spec.fields[i].answers[0];input.dispatchEvent(new Event("input",{bubbles:true}));document.querySelectorAll("[data-check-field]")[i].click()})');
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('spektrum-a1-study-v1')).completed[window.testActivity.id]"),true,'Checking correct answers completes activity');
    const activityId=await evaluate('window.testActivity.id');
    await evaluate("document.querySelector('#completeBtn').click()");
    assert.equal(await evaluate('JSON.parse(localStorage.getItem("spektrum-a1-study-v1")).completed['+JSON.stringify(activityId)+']'),false,'Activity can be unmarked');
    await send('Page.reload');await until("document.readyState==='complete'&&!!document.querySelector('#activityHost')");
    assert.equal(await evaluate('JSON.parse(localStorage.getItem("spektrum-a1-study-v1")).completed['+JSON.stringify(activityId)+']'),false,'Unmark survives reload and feedback rendering');
    await evaluate("document.querySelector('.wb-line').value='new draft';document.querySelector('.wb-line').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#saveCorrection').click()");
    await send('Page.reload');await until("document.readyState==='complete'&&!!document.querySelector('#saveCorrection')");
    assert.equal(await evaluate("document.querySelector('.wb-line').value"),'new draft','Draft survives reload');
    assert.equal(await evaluate('JSON.parse(localStorage.getItem("spektrum-a1-study-v1")).answers['+JSON.stringify(activityId)+'].check.results[0]'),null,'Editing a checked answer removes only its own stale result');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'Mobile exercise has no page-wide overflow');
    await evaluate("window.scrollTo({top:window.scrollY+document.querySelector('.correction-row').getBoundingClientRect().top-470,behavior:'instant'})");
    assert.equal(await evaluate("innerWidth<=391&&Array.from(document.querySelectorAll('[data-check-field]')).every(b=>b.getBoundingClientRect().right<=391)"),true,'Individual check buttons fit the 390px screen');
    const screenshot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(profile,'per-question-mobile.png'),Buffer.from(screenshot.data,'base64'));
    await evaluate('navigator.serviceWorker.ready.then(()=>true)',true);
    const cacheInfo=await evaluate("caches.open('spektrum-a1-shell-2-10-1').then(async c=>({sync:!!await c.match('./state-sync.js'),banks:!!await c.match('./data/study-banks.js'),requests:(await c.keys()).map(r=>r.url)}))",true);
    assert.ok(cacheInfo.sync&&cacheInfo.banks,'Offline shell includes new scripts');
    assert.equal(cacheInfo.requests.some(u=>u.includes('user-progress.json')),false,'Progress fetches are not cached');
    await send('Network.enable');
    await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    await send('Page.reload');await until("document.readyState==='complete'&&!!document.querySelector('#activityHost')");
    assert.equal(await evaluate("document.querySelector('.wb-line').value"),'new draft','Offline app and saved draft load');
    await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await evaluate("window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='spektrum-a1-study-v1')throw new DOMException('Storage full','QuotaExceededError');return window.originalSetItem.call(this,k,v)};document.querySelector('.wb-line').value='recoverable draft';document.querySelector('#saveCorrection').click()");
    assert.equal(await evaluate("!!document.querySelector('#storageNotice[role=alert]')"),true,'Storage failure is visible');
    await evaluate("Storage.prototype.setItem=window.originalSetItem;document.querySelectorAll('#storageNotice button')[1].click()");
    assert.equal(await evaluate("!!document.querySelector('#storageNotice')"),false,'Retry removes the warning after a successful save');
    assert.equal(await evaluate('JSON.parse(localStorage.getItem("spektrum-a1-study-v1")).answers['+JSON.stringify(activityId)+'].lines[0]'),'recoverable draft','Retry saves the in-memory draft');
    await evaluate("document.querySelector('.nav-item[data-page=settings]').click();document.querySelector('#clickToReviewSetting').value='on';document.querySelector('#clickToReviewSetting').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.nav-item[data-page=chapters]').click();document.querySelector('[data-ch=\"1\"]').click()");
    await evaluate('document.querySelector(\'[data-aid="'+activityId+'"]\').click()');
    await until("document.querySelector('.source-canvas')?.width>300");
    assert.equal(await evaluate("document.querySelector('[data-source-panel=image]').getBoundingClientRect().width>0&&!document.querySelector('[data-source-panel=image]').hidden&&!document.querySelector('[data-study-word-text]').open"),true,'Book image is shown by default when word collection is enabled');
    await evaluate("document.querySelector('[data-source-panel=image]').scrollIntoView({block:'start',behavior:'instant'})");
    const imageScreenshot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(profile,'book-image-default.png'),Buffer.from(imageScreenshot.data,'base64'));

    const manualBefore=await evaluate("JSON.parse(localStorage.getItem('spektrum-a1-study-v1')).vocabDiscovery.manual.length");
    await evaluate("if(!document.querySelector('[data-study-word-text]').open)document.querySelector('[data-study-word-text] summary').click();document.querySelector('[data-study-word]').click()");
    assert.equal(await evaluate("document.querySelector('#studyWordDialog').open"),true,'Clicking a word asks before adding it');
    await evaluate("document.querySelector('#studyWordCancel').click();if(!document.querySelector('[data-study-word-text]').open)document.querySelector('[data-study-word-text] summary').click();document.querySelector('[data-study-word]').click()");
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('spektrum-a1-study-v1')).vocabDiscovery.manual.length"),manualBefore,'Cancelling does not create a word');
    await evaluate("document.querySelector('#studyWordTerm').value='Prüfnebelwort';document.querySelector('#studyWordMeaning').value='';document.querySelector('#studyWordSubmit').click()");
    assert.equal(await evaluate("document.querySelector('#studyWordDialog').open&&document.querySelector('#studyWordError').textContent.includes('meaning')"),true,'Unknown words require a meaning');
    const selectedSentence=await evaluate("document.querySelector('#studyWordContext').value");
    await evaluate("document.querySelector('#studyWordMeaning').value='a test word';document.querySelector('#studyWordSubmit').click()");
    assert.equal(await evaluate("document.querySelector('#studyWordDialog').open"),false,'Confirming adds the word and closes the dialog: '+await evaluate("document.querySelector('#studyWordError').textContent"));
    const addedId=await evaluate("JSON.parse(localStorage.getItem('spektrum-a1-study-v1')).vocabDiscovery.manual.find(v=>v.term==='Prüfnebelwort').id");
    assert.equal(await evaluate('JSON.parse(localStorage.getItem("spektrum-a1-study-v1")).vocab['+JSON.stringify(addedId)+'].studyContext'),selectedSentence,'Source sentence is saved');
    await evaluate("document.querySelector('#reviewSavedStudyWords').click()");
    assert.equal(await evaluate("document.querySelector('#reviewPoolSelect').value"),'saved','Saved-word review opens directly');
    assert.equal(await evaluate("document.querySelector('.card-face.front h2').textContent.includes('Prüfnebelwort')"),true,'New word is available as a review card');
    assert.equal(await evaluate("document.querySelector('.card-face.back').textContent.includes('a test word')"),true,'Review card includes the meaning');
    await evaluate("document.querySelector('.nav-item[data-page=chapters]').click();document.querySelector('[data-ch=\"1\"]').click()");
    await evaluate('document.querySelector(\'[data-aid="'+activityId+'"]\').click()');
    await evaluate("if(!document.querySelector('[data-study-word-text]').open)document.querySelector('[data-study-word-text] summary').click();document.querySelector('[data-study-word]').click()");
    assert.equal(await evaluate("document.querySelector('#studyWordStatus').textContent.includes('Already')"),true,'Clicking the same source word recognizes the saved card');
    assert.equal(await evaluate("document.querySelector('#studyWordTerm').value"),'Prüfnebelwort','Edited dictionary form is remembered');
    const wordScreenshot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(profile,'word-picker-mobile.png'),Buffer.from(wordScreenshot.data,'base64'));
    await evaluate("document.querySelector('#studyWordSubmit').click()");
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('spektrum-a1-study-v1')).vocabDiscovery.manual.length"),manualBefore+1,'Adding again does not create a duplicate');

    assert.equal(await evaluate("document.querySelector('[data-study-word-text]').open&&document.querySelector('[data-source-panel=image]').getBoundingClientRect().width>0&&!document.querySelector('[data-source-panel=image]').hidden"),true,'Opening clickable text keeps the book image visible');
    await evaluate("document.querySelector('.full-page').click();document.querySelector('#viewer [data-study-word-text] summary').click();document.querySelector('#viewer [data-study-word]').click()");
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    assert.equal(await evaluate("!document.querySelector('#studyWordDialog').open&&document.querySelector('#viewer').classList.contains('open')"),true,'Escape dismisses the word dialog without closing the reading page');
    await evaluate("document.querySelector('#viewerClose').click();document.querySelector('.nav-item[data-page=settings]').click();document.querySelector('#clickToReviewSetting').value='off';document.querySelector('#clickToReviewSetting').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.nav-item[data-page=chapters]').click();document.querySelector('[data-ch=\"1\"]').click()");
    await evaluate('document.querySelector(\'[data-aid="'+activityId+'"]\').click()');
    assert.equal(await evaluate("document.querySelectorAll('[data-study-word]').length"),0,'Turning the setting off disables clickable words');
    assert.equal(await evaluate('JSON.parse(localStorage.getItem("spektrum-a1-study-v1")).vocab['+JSON.stringify(addedId)+'].savedForReview'),true,'Turning the setting off keeps saved words');
    await send('Page.reload');await until("document.readyState==='complete'&&!!document.querySelector('#activityHost')");
    assert.equal(await evaluate("document.querySelectorAll('[data-study-word]').length"),0,'Setting remains off after reload');
    await send('Page.navigate',{url:pathToFileURL(path.join(root,'index.html')).href});
    await until("document.readyState==='complete'&&!!document.querySelector('.hero')");
    assert.equal(await evaluate('window.SPEKTRUM_DATA.chapters.length'),12,'Direct file launch works');
    assert.deepEqual(errors,[],'No browser JavaScript exceptions');
    console.log(JSON.stringify({passed:true,pages:11,screenshot:path.join(profile,'book-image-default.png'),checks:['book images shown by default','image remains with clickable text','click-to-review setting','cancel and confirm','saved-word review','no duplicate cards','full-page reading','per-answer checking','partial result persistence','keyboard checking','exercise checking','unmark and reload','draft and reload','mobile layout','offline shell','offline reload','file launch','no JS exceptions']}));
  }finally{
    ws?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    // Keep the isolated profile in the system temp directory for browser shutdown.
  }
}
main().catch(error=>{console.error(error.stack);process.exitCode=1});
