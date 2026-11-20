const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const sources=Object.fromEntries(['data/content.js','data/study-banks.js','state-sync.js','app.js'].map(f=>[f,fs.readFileSync(path.join(root,f),'utf8')]));
function harness(initial){
  const storage=new Map(initial||[]),elements=new Map(),timers=new Map();let failWrites=false,timerId=0;
  function node(){return {children:[],className:'',textContent:'',setAttribute(){},appendChild(el){this.children.push(el);if(el.id)elements.set(el.id,el)},querySelector(selector){return this.children.find(x=>'.'+x.className===selector)||null},remove(){elements.delete(this.id)},click(){}};}
  const document={body:node(),createElement:node,getElementById:id=>elements.get(id)||null,querySelector:()=>null,querySelectorAll:()=>[]};
  const context=vm.createContext({document,console,Date,Blob,URL,TextEncoder,TextDecoder,location:{hostname:'localhost',pathname:'/index.html',protocol:'http:'},setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id),localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(failWrites)throw new Error('QuotaExceededError');storage.set(k,v)}},btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary')});
  context.window=context;
  for(const f of ['data/content.js','data/study-banks.js','state-sync.js'])vm.runInContext(sources[f],context);
  const start=sources['app.js'].indexOf('removeLegacyWordReviewUI();applyLevelBranding();');
  assert.ok(start>0);
  vm.runInContext(sources['app.js'].slice(0,start)+
    "updateStreakUI=()=>{};applySidebar=()=>{};updateStartDeutschNavIcon=()=>{};applyThemeWithoutSave=()=>{};showPage=()=>{globalThis.rendered++};openChapter=showPage;cloudBootstrapping=false;globalThis.rendered=0;globalThis.api={get state(){return state},get meta(){return syncMeta},baseState,save,saveViewOnly,persistState,addManualBookWord,allStudyWordCandidates,studyWordKey,studyWordTokens,studyWordContext,findStudyWord,addStudyWordToReview,savedStudyWords,wordReviewPool,wordTestPool,renderStudyText,buildReviewQueue,setReviewMode(mode){reviewPoolMode=mode;reviewSelectedChapter='auto'},get reviewQueue(){return reviewQueue},mergeStudyStates,applyCorrectionFeedback,correctionProgress,prepareCorrectionRecord,storeCorrectionAnswers,showStorageStatus,cloudSyncNow,tryLoadRepoProgressSeed,get busy(){return syncBusy},get pending(){return syncPending},setState(s){state=normalizeLoadedState(s);progressBaseline=Sync.capture(state)},ready(on){cloudReady=()=>on},page(p){current.page=p},remote(fn){fetchRemoteRecord=fn},push(fn){pushRemoteRecord=fn},invalidate(){syncEpoch++},capture:Sync.capture,stamp:Sync.stamp};})();",context);
  return {api:context.api,context,storage,elements,timers,fail(on){failWrites=on}};
}
test('storage failure is visible and does not discard in-memory answers',()=>{
  const h=harness();h.api.ready(false);h.fail(true);h.api.state.answers.a={text:'unsaved draft'};
  assert.equal(h.api.save(),false);assert.equal(h.api.state.answers.a.text,'unsaved draft');
  assert.match(h.elements.get('storageNotice').querySelector('.storage-message').textContent,/could not be saved/);
  h.fail(false);assert.equal(h.api.persistState(),true);
  assert.equal(h.elements.has('storageNotice'),false);
  assert.equal(JSON.parse(h.storage.get('spektrum-a1-study-v1')).answers.a.text,'unsaved draft');
});
test('unreadable saved data is preserved until explicit recovery',()=>{
  const h=harness([['spektrum-a1-study-v1','{broken']]);h.api.ready(false);
  assert.equal(h.api.persistState(),false);
  assert.equal(h.storage.get('spektrum-a1-study-v1'),'{broken');
  assert.match(h.elements.get('storageNotice').querySelector('.storage-message').textContent,/could not be read/);
});
test('opening a view does not mark progress as newer',()=>{
  const h=harness();h.api.ready(false);const before=h.api.meta.localUpdatedAt;
  h.api.state.last.page='settings';h.api.saveViewOnly();
  assert.equal(h.api.meta.localUpdatedAt,before);assert.deepEqual(Object.keys(h.api.state.revisions),[]);
});
test('the normal save path stamps an intentional unmark',()=>{
  const h=harness();h.api.ready(false);h.api.state.completed.a=true;h.api.save();
  const remote=JSON.parse(JSON.stringify(h.api.state));h.api.state.completed.a=false;h.api.save();
  assert.equal(h.api.mergeStudyStates(h.api.state,remote).completed.a,false);
});
test('changes during an upload trigger another sync instead of being lost',async()=>{
  const h=harness();h.api.ready(true);h.api.state.completed.a=true;h.api.save();h.timers.clear();
  h.api.remote(async()=>({found:false}));let release,started;
  const uploading=new Promise(resolve=>{started=resolve});
  h.api.push(()=>new Promise(resolve=>{release=resolve;started()}));
  const sync=h.api.cloudSyncNow({silent:true});await uploading;
  assert.equal(h.api.busy,true);assert.equal(typeof release,'function');
  h.api.state.answers.b={text:'typed during upload'};h.api.save();assert.equal(h.api.pending,true);
  release();assert.equal(await sync,true);assert.equal(h.api.busy,false);assert.ok(h.timers.size>0);
  assert.equal(h.api.state.answers.b.text,'typed during upload');
});
test('sync keeps an unmark even when its richness score decreases',async()=>{
  const h=harness();h.api.ready(true);h.api.state.completed.a=true;h.api.save();
  const remote=JSON.parse(JSON.stringify(h.api.state));h.api.state.completed.a=false;h.api.save();
  h.api.remote(async()=>({found:true,state:remote,updatedAt:Date.now()}));let uploaded;
  h.api.push(async s=>{uploaded=s});assert.equal(await h.api.cloudSyncNow({silent:true}),true);
  assert.equal(h.api.state.completed.a,false);assert.equal(uploaded.completed.a,false);
});
test('automatic sync does not redraw an exercise with unsaved input',async()=>{
  const h=harness();h.api.ready(true);h.api.page('chapter');
  const remote=h.api.baseState();remote.completed.other=true;
  h.api.remote(async()=>({found:true,state:remote}));h.api.push(async()=>{});
  await h.api.cloudSyncNow({silent:true});
  assert.equal(h.context.rendered,0);assert.equal(h.api.state.completed.other,true);
});
test('a late remote response is ignored after disconnect or reset',async()=>{
  const h=harness();h.api.ready(true);let release;
  h.api.remote(()=>new Promise(resolve=>{release=resolve}));
  const syncing=h.api.cloudSyncNow({silent:true});h.api.invalidate();
  const old=h.api.baseState();old.completed.a=true;release({found:true,state:old});
  assert.equal(await syncing,false);assert.equal(h.api.state.completed.a,undefined);
});
test('rendering saved correction feedback cannot re-complete an unmarked exercise',()=>{
  const h=harness();h.api.ready(false);h.api.state.completed.a=false;
  h.context.document.querySelector=()=>({querySelector:()=>null});
  h.api.applyCorrectionFeedback({id:'a'},{fields:[]},[],false);
  assert.equal(h.api.state.completed.a,false);
});

test('a failed check clears a previously marked completion',()=>{
  const h=harness();h.api.ready(false);h.api.state.completed.a=true;
  h.context.document.querySelector=()=>({querySelector:()=>null});
  h.api.storeCorrectionAnswers({id:'a',tags:[],chapter:1,kind:'fill'},{fields:[{answers:['richtig']}]},['falsch'],0);
  assert.equal(h.api.state.completed.a,false);
});
test('the repository seed applies a newer unmark even with a smaller richness score',async()=>{
  const h=harness();h.api.ready(false);h.api.state.completed.a=true;h.api.save();
  const seed=JSON.parse(JSON.stringify(h.api.state));const baseline=h.api.capture(seed);
  seed.completed.a=false;h.api.stamp(seed,baseline,Date.now()+1000);
  h.context.fetch=async()=>({ok:true,json:async()=>({state:seed})});
  assert.equal(await h.api.tryLoadRepoProgressSeed(),true);
  assert.equal(h.api.state.completed.a,false);
});
test('a delayed repository seed cannot undo a reset or disconnect',async()=>{
  const h=harness();h.api.ready(false);let release;
  h.context.fetch=()=>new Promise(resolve=>{release=resolve});
  const loading=h.api.tryLoadRepoProgressSeed();h.api.invalidate();
  const remote=h.api.baseState();remote.completed.a=true;
  release({ok:true,json:async()=>({state:remote})});
  assert.equal(await loading,false);assert.equal(h.api.state.completed.a,undefined);
});

test('checking one answer leaves all other answers unchecked',()=>{
  const h=harness(),spec={fields:[{answers:['eins']},{answers:['zwei']},{answers:['drei']}]};
  const record=h.api.prepareCorrectionRecord(spec,{},['eins','',''],0,1800000000000);
  assert.equal(JSON.stringify(record.check.results),JSON.stringify([true,null,null]));
  assert.equal(record.check.score,1);assert.equal(record.check.checkedCount,1);
});
test('checking a second answer preserves the first and does not grade another filled draft',()=>{
  const h=harness(),spec={fields:[{answers:['eins']},{answers:['zwei']},{answers:['drei']}]};
  const first=h.api.prepareCorrectionRecord(spec,{},['eins','',''],0,1800000000000);
  const second=h.api.prepareCorrectionRecord(spec,first,['eins','wrong','drei'],1,1800000000100);
  assert.equal(JSON.stringify(second.check.results),JSON.stringify([true,false,null]));
});
test('editing a checked answer invalidates only that answer',()=>{
  const h=harness(),spec={fields:[{answers:['eins']},{answers:['zwei']}]};
  let record=h.api.prepareCorrectionRecord(spec,{},['eins','zwei'],0,1800000000000);
  record=h.api.prepareCorrectionRecord(spec,record,record.lines,1,1800000000100);
  const changed=h.api.prepareCorrectionRecord(spec,record,['new draft','zwei'],null,1800000000200);
  assert.equal(JSON.stringify(changed.check.results),JSON.stringify([null,true]));
  assert.equal(changed.check.score,1);
});
test('legacy complete checks survive migration and blank legacy answers stay neutral',()=>{
  const h=harness(),spec={fields:[{answers:['eins']},{answers:['zwei']}]};
  const legacy={lines:['eins',''],savedAt:'2026-11-18T10:00:00Z',check:{results:[true,false],score:1,total:2,checkedAt:'2026-11-18T10:00:00Z'}};
  const progress=h.api.correctionProgress(spec,legacy);
  assert.equal(JSON.stringify(progress.results),JSON.stringify([true,null]));
});
test('each successful answer is saved before the remaining activity is completed',()=>{
  const h=harness();h.api.ready(false);
  const activity={id:'partial',tags:[],chapter:1,kind:'fill'},spec={fields:[{answers:['eins']},{answers:['zwei']}]};
  h.api.storeCorrectionAnswers(activity,spec,['eins',''],0);
  let saved=JSON.parse(h.storage.get('spektrum-a1-study-v1'));
  assert.equal(saved.answers.partial.check.score,1);assert.equal(saved.completed.partial,false);
  h.api.storeCorrectionAnswers(activity,spec,['eins','zwei'],1);
  saved=JSON.parse(h.storage.get('spektrum-a1-study-v1'));
  assert.equal(saved.answers.partial.check.score,2);assert.equal(saved.completed.partial,true);
});

test('word picking is opt-in and preserves German word spelling',()=>{
  const h=harness();h.api.ready(false);
  assert.equal(h.api.state.settings.clickToReview,false);
  const tokens=h.api.studyWordTokens('Grüße, Öl und geht’s!');
  assert.equal(JSON.stringify(tokens.map(t=>t.word)),JSON.stringify(['Grüße','Öl','und','geht’s']));
  assert.notEqual(h.api.studyWordKey('schon'),h.api.studyWordKey('schön'));
  assert.equal(h.api.studyWordKey('der Arzt'),h.api.studyWordKey('Arzt'));
});
test('study text is escaped and only clickable while enabled',()=>{
  const h=harness(),source={text:'Hallo <script>alert("test")</script>',page:12,chapter:1};
  assert.equal(h.api.renderStudyText(source).includes('data-study-word='),false);
  h.api.state.settings.clickToReview=true;
  const html=h.api.renderStudyText(source);
  assert.ok(html.includes('data-study-word="Hallo"'));
  assert.equal(html.includes('<script>'),false);assert.ok(html.includes('&lt;'));
});
test('a new study word enters review with context but does not enter testing',()=>{
  const h=harness();h.api.ready(false);
  const {word}=h.api.addStudyWordToReview({term:'Prüfnebelwort',meaning:'a test word',context:'Das Prüfnebelwort steht hier.',chapter:3,page:55,sourceId:'reading-55'});
  assert.equal(h.api.savedStudyWords().some(v=>v.id===word.id),true);
  assert.equal(h.api.wordReviewPool().some(v=>v.id===word.id),true);
  assert.equal(h.api.wordTestPool().some(v=>v.id===word.id),false);
  const record=JSON.parse(h.storage.get('spektrum-a1-study-v1')).vocab[word.id];
  assert.equal(record.studyContext,'Das Prüfnebelwort steht hier.');assert.equal(record.studyPage,55);
  h.api.setReviewMode('saved');h.api.buildReviewQueue();
  assert.equal(h.api.reviewQueue.some(v=>v.id===word.id),true);
});
test('adding the same word twice updates one card and recognizes its clicked form',()=>{
  const h=harness();h.api.ready(false);
  const first=h.api.addStudyWordToReview({term:'Prüfnebelwort',meaning:'first',pickedTerm:'Prüfnebelwörter'});
  const second=h.api.addStudyWordToReview({term:'prüfnebelwort',meaning:'updated',pickedTerm:'Prüfnebelwörter'});
  assert.equal(first.word.id,second.word.id);assert.equal(h.api.state.vocabDiscovery.manual.length,1);
  assert.equal(h.api.state.vocab[first.word.id].en,'updated');
  assert.equal(h.api.findStudyWord('Prüfnebelwörter',true).id,first.word.id);
});
test('saving a known dictionary word reuses its existing card',()=>{
  const h=harness();h.api.ready(false);const known=h.api.findStudyWord('Arabisch');assert.ok(known);
  const {word}=h.api.addStudyWordToReview({term:'Arabisch',meaning:'Arabic',context:'Ich spreche Arabisch.'});
  assert.equal(word.id,known.id);assert.equal(h.api.state.vocabDiscovery.manual.length,0);
  assert.equal(h.api.savedStudyWords()[0].context,'Ich spreche Arabisch.');
});
test('missing meaning is rejected without creating a partial card',()=>{
  const h=harness();h.api.ready(false);const before=JSON.stringify(h.api.state);
  assert.throws(()=>h.api.addStudyWordToReview({term:'Prüfnebelwort',meaning:' '}),/meaning/);
  assert.equal(JSON.stringify(h.api.state),before);
});
test('the chosen sentence is kept and saved words survive reload and disabling',()=>{
  const h=harness();h.api.ready(false);const text='Guten Tag. Ich lese Bücher! Bis bald.';
  assert.equal(h.api.studyWordContext(text,text.indexOf('Bücher'),text.indexOf('Bücher')+6),'Ich lese Bücher!');
  const {word}=h.api.addStudyWordToReview({term:'Prüfnebelwort',meaning:'test'});
  h.api.state.settings.clickToReview=false;h.api.save();
  const restored=harness([...h.storage]);
  assert.equal(restored.api.savedStudyWords().some(v=>v.id===word.id),true);
  assert.equal(restored.api.state.settings.clickToReview,false);
});

test('duplicate matching handles surrounding punctuation, spacing, articles and Unicode composition',()=>{
  const h=harness();h.api.ready(false);
  const first=h.api.addStudyWordToReview({term:'Prüfnebelwort',meaning:'test'});
  for(const term of ['  das PRÜFNEBELWORT  ','Prüfnebelwort.','Prüfnebelwort']){
    assert.equal(h.api.addStudyWordToReview({term,meaning:'test'}).word.id,first.word.id);
  }
  assert.equal(h.api.state.vocabDiscovery.manual.length,1);
});
test('words already in the original or review vocabulary are reused instead of copied',()=>{
  const h=harness();h.api.ready(false);
  for(const source of [h.context.SPEKTRUM_DATA.reviewVocabulary,h.context.SPEKTRUM_DATA.vocabulary]){
    const candidate=source.find(v=>v.term&&h.api.studyWordKey(v.term).length>2&&v.term.length<=120);
    const existing=h.api.findStudyWord(candidate.term);assert.ok(existing);
    const added=h.api.addStudyWordToReview({term:candidate.term,meaning:'review meaning'});
    assert.equal(added.word.id,existing.id);assert.equal(added.reused,true);
    assert.ok(h.api.savedStudyWords().some(v=>v.id===existing.id));
  }
  assert.equal(h.api.state.vocabDiscovery.manual.length,0);
});
test('all vocabulary banks, including entries absent from the test bank, participate in duplicate detection',()=>{
  const h=harness();h.api.ready(false);
  const testIds=new Set(h.api.wordTestPool().map(v=>v.id));
  const reviewOnly=h.context.SPEKTRUM_DATA.reviewVocabulary.find(v=>!testIds.has(v.id)&&h.api.findStudyWord(v.term)?.id===v.id);
  assert.ok(reviewOnly,'There is a review-bank entry outside the test bank');
  const added=h.api.addStudyWordToReview({term:reviewOnly.term,meaning:reviewOnly.en||'meaning'});
  assert.equal(added.word.id,reviewOnly.id);assert.equal(h.api.state.vocabDiscovery.manual.length,0);
  assert.ok(h.api.wordReviewPool().some(v=>v.id===reviewOnly.id));
});

test('the existing Add missing word action also rejects duplicates from every bank',()=>{
  const h=harness();h.api.ready(false);
  const candidate=h.context.SPEKTRUM_DATA.reviewVocabulary.find(v=>h.api.findStudyWord(v.term)?.id===v.id);
  assert.ok(candidate);const inputs=[candidate.term,'1','12','source sentence','meaning',''];let message='';
  h.context.prompt=()=>inputs.shift();h.context.alert=text=>{message=text};
  assert.equal(h.api.addManualBookWord(),false);assert.equal(h.api.state.vocabDiscovery.manual.length,0);
  assert.match(message,/already in Vocabulary Bank/);
});
