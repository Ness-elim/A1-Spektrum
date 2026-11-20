// Spektrum A1+ — study interface and persistence.
(()=>{
'use strict';
const APP_VERSION='v2.11.1';
const Sync=window.SpektrumSync;
// Spektrum A1+ patch v2.0 — cumulative v1.9 base; Word Review removed from UI; Vocabulary Bank split into words vs sentences/phrases
const D=window.SPEKTRUM_DATA;
const V=D.reviewVocabulary||D.vocabulary||[];
const RAW_V=D.vocabulary||[];
// Stage 1 vocabulary audit: an independent lexical-word bank is kept separate from the book's phrase/sentence review cards.
const TEST_WORDS=window.SPEKTRUM_BANKS.TEST_WORDS;
const DISCOVERED_WORDS=window.SPEKTRUM_BANKS.DISCOVERED_WORDS;
const TEST_WORD_ID_SET=new Set(TEST_WORDS.map(v=>v.id));
const REVIEW_ID_SET=new Set(V.map(v=>v.id));
let PHRASE_TESTS=[];
let TEST_ITEM_BY_ID=new Map();
let ALL_VOCAB_ID_SET=new Set();
PHRASE_TESTS=V.filter(isPhraseTestCard).map(v=>({...v,testKind:'phrase'}));
TEST_ITEM_BY_ID=new Map([...V,...TEST_WORDS,...DISCOVERED_WORDS,...PHRASE_TESTS].map(v=>[v.id,v]));
ALL_VOCAB_ID_SET=new Set(TEST_ITEM_BY_ID.keys());
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s??'').toLocaleLowerCase('de-DE').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
// v1.3 — structured automatic correction for deterministic workbook activities
const CORRECTION_KEYS=window.SPEKTRUM_BANKS.CORRECTION_KEYS;
const MODEL_ANSWERS=window.SPEKTRUM_BANKS.MODEL_ANSWERS;
function correctionSpec(a){return CORRECTION_KEYS[a?.id]||null}
function modelAnswer(a){return MODEL_ANSWERS[a?.id]||''}
function correctionNorm(value){return String(value??'').toLocaleLowerCase('de-DE').normalize('NFC').replace(/[„“”"'’]/g,'').replace(/[.,!?;:()\[\]{}]/g,' ').replace(/ß/g,'ss').replace(/\s+/g,' ').trim()}
function correctionMatches(value,accepted){const got=correctionNorm(value);return !!got&&(accepted||[]).some(answer=>got===correctionNorm(answer))}
function correctionFieldMatches(value,field){if(field?.unordered?.length){const expected=field.unordered.map(correctionNorm).filter(Boolean).sort(),got=String(value??'').split(/[,;|/]+|\s+/).map(correctionNorm).filter(Boolean).sort();return got.length===expected.length&&got.every((x,i)=>x===expected[i])}return correctionMatches(value,field?.answers||[])}
function correctionDisplay(field){return field?.unordered?.length?field.unordered.join(', '):(field.answers||[]).join(' / ')}
function injectStreakStyles(){if($('#spektrumStreakStyles'))return;const style=document.createElement('style');style.id='spektrumStreakStyles';style.textContent=`
.streak{transition:background-color .18s ease,border-color .18s ease,color .18s ease,box-shadow .18s ease,opacity .18s ease}
.streak .streak-flame{display:inline-block;transition:filter .18s ease,opacity .18s ease,transform .18s ease}
.streak.pending{opacity:1!important;background:color-mix(in srgb,var(--panel) 52%,#111 48%)!important;border-color:color-mix(in srgb,var(--border) 45%,#111 55%)!important;color:#c7cfcc!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.18)}
.streak.pending .streak-flame{filter:grayscale(1) brightness(.38) saturate(.15);opacity:.58}
html[data-theme="dark"] .streak.pending{background:#0b0f0e!important;border-color:#28302d!important;color:#707c78!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.025)}
html[data-theme="dark"] .streak.pending .streak-flame{filter:grayscale(1) brightness(.5) saturate(.1);opacity:.5}
`;
document.head.appendChild(style)}
function injectCorrectionStyles(){if($('#spektrumCorrectionStyles'))return;const style=document.createElement('style');style.id='spektrumCorrectionStyles';style.textContent=`
.correction-note{display:inline-flex;align-items:center;gap:7px;margin:0 0 12px;padding:7px 10px;border:1px solid rgba(49,193,142,.32);border-radius:10px;color:#73dab7;background:rgba(49,193,142,.08);font-size:13px;font-weight:700}
.correction-grid{gap:9px}
.correction-row{display:grid;grid-template-columns:minmax(125px,.85fr) minmax(170px,1.15fr);gap:8px 14px;align-items:center;padding:10px 11px;border:1px solid var(--border);border-radius:12px;background:rgba(255,255,255,.018)}
.correction-row.is-correct{border-color:rgba(55,190,126,.8);background:rgba(55,190,126,.08)}
.correction-row.is-wrong{border-color:rgba(226,86,86,.88);background:rgba(226,86,86,.08)}
.correction-prompt{font-weight:650;line-height:1.45}
.correction-row.is-correct .answer-input{border-color:rgba(55,190,126,.9)}
.correction-row.is-wrong .answer-input{border-color:rgba(226,86,86,.95)}
.correction-feedback{grid-column:2;min-height:18px;font-size:13px;font-weight:650}
.correction-feedback.good{color:#63d8a4}
.correction-feedback.bad{color:#ff8585}
.correction-summary{margin-top:10px;padding:10px 12px;border-radius:11px;font-weight:700}
.correction-summary.good{background:rgba(55,190,126,.1);color:#72deb0;border:1px solid rgba(55,190,126,.35)}
.correction-summary.bad{background:rgba(226,86,86,.08);color:#ff9a9a;border:1px solid rgba(226,86,86,.3)}
.model-check{margin-top:12px;padding:12px;border:1px solid var(--border);border-radius:12px;background:rgba(255,255,255,.02)}.model-check summary{cursor:pointer;font-weight:750}
@media(max-width:700px){.correction-row{grid-template-columns:1fr}.correction-feedback{grid-column:1}}
`;document.head.appendChild(style)}
function injectWordTestStyles(){if($('#spektrumWordTestStyles'))return;const style=document.createElement('style');style.id='spektrumWordTestStyles';style.textContent=`
#wordTestFeedback.feedback.good{color:var(--text)!important}
#wordTestFeedback.feedback.good .answer-study-card{border-color:rgba(55,190,126,.62)!important;background:rgba(55,190,126,.09)!important;color:var(--text)!important}
#wordTestFeedback.feedback.good .answer-study-card>b:first-child{color:#43c98e!important}
#wordTestFeedback.feedback.bad .answer-study-card>b:first-child{color:#ff8585}
.word-test-session-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.clean-text{white-space:pre-wrap!important;line-height:1.65!important;overflow-wrap:anywhere}
@media(max-width:620px){.word-test-session-actions{justify-content:stretch}.word-test-session-actions button{flex:1}}
`;document.head.appendChild(style)}
function fieldChoiceOptions(field,spec){if(Array.isArray(field?.options)&&field.options.length)return field.options;const ans=(field?.answers||[]).map(x=>String(x||'').trim()).filter(Boolean);if(!ans.length)return null;const upper=ans.map(x=>x.toUpperCase());if(upper.every(x=>['R','F','RICHTIG','FALSCH','TRUE','FALSE'].includes(x)))return['R','F'];if(ans.every(x=>['A','B','C'].includes(x)))return Array.isArray(spec?.options)&&spec.options.length?spec.options:['A','B','C'];return null}
function renderCorrectionFieldInput(field,i,val,spec){
  const opts=fieldChoiceOptions(field,spec),inputId='correction-input-'+i;
  if(!opts)return '<input id="'+inputId+'" class="answer-input wb-line" value="'+esc(val||'')+'" placeholder="Type your answer" autocomplete="off" aria-labelledby="correction-prompt-'+i+'" aria-describedby="correction-feedback-'+i+'">';
  const normVal=correctionNorm(val);
  return '<div class="choice-pills wb-choice-group" data-correction-choice="'+i+'" role="group" aria-labelledby="correction-prompt-'+i+'"><input id="'+inputId+'" type="hidden" class="wb-line" value="'+esc(val||'')+'"><div class="choice-pills">'+opts.map(o=>{
    const selected=normVal===correctionNorm(o);
    return '<button type="button" class="wb-corr-pill '+(selected?'selected':'')+'" aria-pressed="'+selected+'" data-value="'+esc(o)+'">'+esc(o==='R'?'R · richtig':o==='F'?'F · falsch':o)+'</button>';
  }).join('')+'</div></div>';
}
function renderCorrectionWorkbench(a,ans,spec){
  const vals=ans.lines||[],model=modelAnswer(a);
  return '<div class="correction-note">✓ Check one answer at a time. Each result is saved.</div><div class="answer-grid correction-grid" id="lineAnswers">'+spec.fields.map((field,i)=>
    '<div class="correction-row" data-correction-row="'+i+'"><div class="correction-prompt" id="correction-prompt-'+i+'">'+esc(field.prompt||field.label||String(i+1))+'</div><div class="correction-entry">'+renderCorrectionFieldInput(field,i,vals[i],spec)+'<button type="button" class="primary correction-check" data-check-field="'+i+'" aria-describedby="correction-prompt-'+i+'">Check answer</button></div><div class="correction-feedback" id="correction-feedback-'+i+'" data-correction-feedback="'+i+'" role="status" aria-live="polite"></div></div>'
  ).join('')+'</div><div class="correction-summary hidden" id="checkSummary" role="status" aria-live="polite"></div><div class="button-row" style="margin-top:10px"><button class="ghost" id="saveCorrection">Save for later</button></div>'+(model?'<details class="model-check"><summary>Self-check / model guidance</summary><p>'+esc(model)+'</p></details>':'');
}
function correctionProgress(spec,record={},values=record.lines||[]){
  const previous=record.check||{},results=[],checkedValues=[],checkedAtByField=[];
  spec.fields.forEach((field,i)=>{
    const value=String(values[i]??''),savedValue=String(previous.checkedValues?.[i]??record.lines?.[i]??'');
    const checked=typeof previous.results?.[i]==='boolean'&&value.trim()!==''&&value===savedValue;
    results.push(checked?previous.results[i]:null);
    checkedValues.push(checked?value:null);
    checkedAtByField.push(checked?(previous.checkedAtByField?.[i]||previous.checkedAt||record.savedAt||null):null);
  });
  return {results,checkedValues,checkedAtByField,score:results.filter(r=>r===true).length,total:spec.fields.length,checkedCount:results.filter(r=>r!==null).length};
}
function prepareCorrectionRecord(spec,record,values,index=null,now=Date.now()){
  const lines=spec.fields.map((_,i)=>String(values[i]??'')),progress=correctionProgress(spec,record,lines);
  const oldTimes=record.lineUpdatedAt||record.lines?.map(()=>Date.parse(record.savedAt||record.check?.checkedAt)||0)||[];
  const tick=Math.max(now,...oldTimes.map(t=>Number(t)||0))+1,iso=new Date(tick).toISOString();
  const next={...record,lines,savedAt:iso,lineUpdatedAt:lines.map((value,i)=>value!==String(record.lines?.[i]??'')?tick:(oldTimes[i]||0))};
  if(index!==null&&Number.isInteger(index)&&index>=0&&index<spec.fields.length&&lines[index].trim()){
    progress.results[index]=correctionFieldMatches(lines[index],spec.fields[index]);
    progress.checkedValues[index]=lines[index];progress.checkedAtByField[index]=iso;next.lineUpdatedAt[index]=tick;
  }
  progress.score=progress.results.filter(r=>r===true).length;
  progress.checkedCount=progress.results.filter(r=>r!==null).length;
  if(progress.checkedCount)next.check={...progress,checkedAt:progress.checkedAtByField.filter(Boolean).sort().pop()};
  else delete next.check;
  const lastChecks = {};
  spec.fields.forEach((field, i) => {
    if (progress.results[i] !== null) return;
    const previous = Sync.lastFieldCheck(record, i);
    if (previous) lastChecks[i] = previous;
  });
  if (Object.keys(lastChecks).length) next.lastChecks = lastChecks;
  else delete next.lastChecks;
  return next;
}
function applyCorrectionFeedback(a,spec,values){
  const host=$('#activityHost')||$('#examHost'),progress=correctionProgress(spec,state.answers[a.id]||{},values);
  if(!host)return progress;
  spec.fields.forEach((field,i)=>{
    const result=progress.results[i],row=$('[data-correction-row="'+i+'"]',host),feedback=$('[data-correction-feedback="'+i+'"]',host),button=$('[data-check-field="'+i+'"]',host);
    if(row){row.classList.toggle('is-correct',result===true);row.classList.toggle('is-wrong',result===false)}
    if(feedback){feedback.className='correction-feedback'+(result===null?'':result?' good':' bad');feedback.textContent=result===null?'':result?'✓ Correct':'Answer: '+correctionDisplay(field)}
    if(button){button.textContent=result===null?'Check answer':'Check again';button.disabled=!String(values[i]??'').trim()}
  });
  const summary=$('#checkSummary',host),perfect=progress.total>0&&progress.score===progress.total;
  if(summary){
    summary.classList.toggle('hidden',!progress.checkedCount);summary.classList.toggle('good',perfect);summary.classList.remove('bad');
    summary.textContent=perfect?'✓ All '+progress.total+' answers correct.':progress.score+' / '+progress.total+' correct · '+progress.checkedCount+' checked';
  }
  ['#completeBtn','#completeBtnTop'].forEach(selector=>{
    const button=$(selector,host);if(!button)return;
    const done=completed(a.id);button.textContent=done?'✓ Completed':'Mark complete';button.classList.toggle('primary',!done);button.classList.toggle('secondary',done);
  });
  return progress;
}
function storeCorrectionAnswers(a,spec,values,index=null){
  const previous=state.answers[a.id]||{},next=prepareCorrectionRecord(spec,previous,values,index);
  const changed=JSON.stringify(previous.lines||[])!==JSON.stringify(next.lines);
  state.answers[a.id]=next;
  if(index!==null)state.completed[a.id]=next.check?.score===spec.fields.length&&spec.fields.length>0;
  else if(changed)state.completed[a.id]=false;
  event(primaryContributionForActivity(a),a.id);markStudyVocabulary(a);
  return save();
}

const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const addDays=(date,n)=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const storageKey='spektrum-a1-study-v1';
const syncConfigKey='spektrum-a1-cloud-sync-v1';
const syncMetaKey='spektrum-a1-cloud-meta-v1';
const snapshotsKey='spektrum-a1-snapshots-v1';
const CONTRIBUTION_SECTIONS=['Practice','Reading','Listening','Vocabulary','Word Test','Grammar','Writing','Speaking'];
const baseState=()=>({schema:3,revisions:{},completed:{},answers:{},events:{},vocab:{},vocabExposure:{review:[],study:[],test:[],book:[]},vocabDiscovery:{included:[],excluded:[],manual:[]},learningDB:{words:{}},settings:{theme:'light',arabicHelp:false,clickToReview:false,sidebarCollapsed:false,studyLayout:'split',studyRatio:'55-45',studySwap:false,sourceZoom:100,activityListCollapsed:true},last:{page:'home',chapter:1,section:'Main course',activity:null}});
function stateRichness(s){
  if(!s||typeof s!=='object')return {completed:0,answers:0,vocab:0,events:0,score:0};
  const comp=Object.values(s.completed||{}).filter(Boolean).length;
  const ans=Object.values(s.answers||{}).filter(r=>r&&(r.savedAt||r.check||(Array.isArray(r.lines)&&r.lines.some(Boolean))||(Array.isArray(r.choices)&&r.choices.some(Boolean))||String(r.text||r.email||r.speaking1||'').trim())).length;
  const voc=Object.values(s.vocab||{}).filter(r=>r&&(r.status&&r.status!=='new'||r.reviews>0||r.repetitions>0)).length;
  const ldb=Object.values(s.learningDB?.words||{}).filter(w=>w&&((w.fullRecallCorrect||0)+(w.missingCorrect||0)+(w.contextCorrect||0)+(w.articleCorrect||0))>0).length;
  const ev=Object.keys(s.events||{}).length;
  return {completed:comp,answers:ans,vocab:Math.max(voc,ldb),events:ev,score:comp*10+ans*6+Math.max(voc,ldb)*4+ev*5};
}
function mergeStudyStates(localRaw,remoteRaw,prefer='auto'){
  const local=normalizeLoadedState(localRaw||baseState()),remote=normalizeLoadedState(remoteRaw||baseState());
  const merged=Sync.merge(local,remote);
  if(prefer==='remote')merged.settings={...local.settings,...remote.settings};
  return normalizeLoadedState(merged);
}
function loadSnapshots(){try{const arr=JSON.parse(localStorage.getItem(snapshotsKey)||'[]');return Array.isArray(arr)?arr:[]}catch{return[]}}
function saveSnapshot(reason='Auto-backup',customState=null){
  try{
    const target=customState||state,r=stateRichness(target);
    if(r.score<=0)return false;
    const list=loadSnapshots();
    if(list.length&&list[0].richness?.score===r.score&&Date.now()-list[0].createdAt<60000)return false;
    const entry={id:'snap-'+Date.now().toString(36),createdAt:Date.now(),reason,richness:r,state:JSON.parse(JSON.stringify(target))};
    const next=[entry,...list].slice(0,12);
    localStorage.setItem(snapshotsKey,JSON.stringify(next));
    return true;
  }catch{return false}
}
let storageError=null,unreadableStoredState=null;
let state=loadState();
let progressBaseline=Sync.capture(state); let reviewQueue=[],cardIndex=0,reviewChapter=null,reviewQueueInfo=null,reviewAutoFlipTimer=null,wordTestSession=null,wordAdvanceTimer=null,wordCountdownTimer=null,vocabularyBankMode='words'; let current={page:'home',chapter:1,section:'Main course',activity:null};
let syncConfig=loadSyncConfig(),syncMeta=loadSyncMeta(),syncSaveTimer=null,syncBusy=false,cloudBootstrapping=true,lastCloudCheck=0,syncPending=false,syncEpoch=0;
if(!syncMeta.localUpdatedAt&&stateRichness(state).score>0){syncMeta.localUpdatedAt=Date.now();saveSyncMeta()}
function discoverySearchText(text){return ` ${norm(text).replace(/[^a-z0-9äöüß-]+/gi,' ').replace(/\s+/g,' ').trim()} `}
function discoveryTextContains(text,term){const target=norm(term).replace(/[^a-z0-9äöüß-]+/gi,' ').trim();return target.length>=3&&text.includes(` ${target} `)}
function backfillDiscoveredState(target){
  if(!target||!DISCOVERED_WORDS.length)return target;
  const completedIds=new Set(Object.entries(target.completed||{}).filter(([,done])=>!!done).map(([id])=>id));
  if(!completedIds.size)return target;
  const found=new Set(target.vocabExposure?.book||[]);
  for(const a of D.activities||[]){
    if(!completedIds.has(a.id))continue;
    const hay=discoverySearchText(`${a.title||''} ${a.text||''}`);
    for(const v of DISCOVERED_WORDS){
      if(v.chapter!==a.chapter||!discoveryTextContains(hay,v.term))continue;
      found.add(v.id);
      const old=target.vocab[v.id]||{};
      if(!old.status||old.status==='new')target.vocab[v.id]={...old,status:'seen'};
    }
  }
  target.vocabExposure={...(target.vocabExposure||{}),book:[...found]};
  return target;
}
function manualDiscoveredWords(){return Array.isArray(state.vocabDiscovery?.manual)?state.vocabDiscovery.manual:[]}
function userTestIncluded(v){return state.vocabDiscovery.included.includes(v.id)}
function discoveryIncluded(v){return !!v?.discovered&&userTestIncluded(v)}
function wordTestExcluded(v){return !!v&&state.vocabDiscovery.excluded.includes(v.id)}
function discoveryExcluded(v){return !!v?.discovered&&wordTestExcluded(v)}
function wordNeedsTestOptIn(v){return !!v?.discovered||v?.testable===false}
function bankWordPool(){return [...TEST_WORDS,...DISCOVERED_WORDS,...manualDiscoveredWords()].filter(v=>!v.discoveryNoise||userTestIncluded(v)||!!String(state.vocab?.[v.id]?.en||state.vocab?.[v.id]?.ar||'').trim())}
function wordHasMeaning(v){const r=state.vocab?.[v.id]||{};return !!(String(r.en||v.en||'').trim()||String(r.ar||v.ar||'').trim())}
function wordTestPool(){const base=[...TEST_WORDS].filter(v=>!wordTestExcluded(v)),ids=new Set(TEST_WORDS.map(v=>v.id)),extras=bankWordPool().filter(v=>!ids.has(v.id)&&wordNeedsTestOptIn(v)&&userTestIncluded(v)&&!wordTestExcluded(v)&&wordHasMeaning(v)).map(v=>({...v,sourceTerm:v.term,term:v.lemma||v.term,testable:true,testKind:'word'}));return [...base,...extras]}
function ensureDiscoveryMeaning(v){
  if(wordHasMeaning(v))return true;
  const old=state.vocab[v.id]||{},en=prompt('English meaning — add English or Arabic before putting this word in the test:',old.en||v.en||'');
  if(en===null)return false;
  const ar=prompt('Arabic meaning (optional if English was entered):',old.ar||v.ar||'');
  if(ar===null)return false;
  if(!String(en).trim()&&!String(ar).trim()){alert('Add at least one meaning before putting a discovered word in Vocabulary Testing.');return false}
  state.vocab[v.id]={...old,en:String(en).trim(),ar:String(ar).trim()};
  return true;
}
function setDiscoveryChoice(v,action){
  if(!v)return false;
  const d=state.vocabDiscovery;
  if(action==='include'){
    if(!wordNeedsTestOptIn(v))return false;
    if(!ensureDiscoveryMeaning(v))return false;
    d.included=unique([...d.included,v.id]);d.excluded=d.excluded.filter(id=>id!==v.id)
  }
  else if(action==='remove'){
    if(!wordNeedsTestOptIn(v))return false;
    d.included=d.included.filter(id=>id!==v.id)
  }
  else if(action==='exclude'){
    d.included=d.included.filter(id=>id!==v.id);d.excluded=unique([...d.excluded,v.id])
  }
  else if(action==='restore')d.excluded=d.excluded.filter(id=>id!==v.id);
  else return false;
  save();return true;
}


function addManualBookWord(){
  const term=String(prompt('German word exactly as it appears in the book:','')||'').trim();if(!term)return false;
  const chapterRaw=prompt('Chapter number (1–12):',String(current.chapter||state.last?.chapter||1));if(chapterRaw===null)return false;const chapter=Math.max(1,Math.min(12,parseInt(chapterRaw,10)||1));
  const pageRaw=prompt('Book page number (optional):','');if(pageRaw===null)return false;const page=parseInt(pageRaw,10)||null;
  const context=String(prompt('Source sentence / context (optional):','')||'').trim();
  const en=String(prompt('English meaning (optional — you can add it later):','')||'').trim();
  const ar=String(prompt('Arabic meaning (optional):','')||'').trim();
  const duplicate=findStudyWord(term);if(duplicate){alert(`“${term}” is already in Vocabulary Bank.`);return false}
  const id=`manual-book-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  const item={id,chapter,term,en,ar,page,hint:'Manually added book word',set:1,kind:'word',testKind:'word',source:'Manually captured from the book',context,tip:'Manually added from the book. Add a standalone meaning before using it in Vocabulary Testing.',discovered:true,manualDiscovery:true,testable:false,discoveryType:'manual',discoveryConfidence:'manual',bookOrder:999998};
  state.vocabDiscovery.manual=[...manualDiscoveredWords(),item];save();return true;
}

// Optional word collection from selectable study text.
function studyWordKey(text){return String(text||'').normalize('NFC').toLocaleLowerCase('de-DE').replace(/’/g,"'").replace(/\s+/g,' ').trim().replace(/^[„“"'«»]+|[.!?,;:„“"'«»]+$/g,'').trim().replace(/^(der|die|das)\s+/i,'')}
function allStudyWordCandidates(){
  const byId=new Map();
  for(const word of [...manualDiscoveredWords(),...TEST_WORDS,...DISCOVERED_WORDS,...V,...RAW_V])if(!byId.has(word.id))byId.set(word.id,word);
  return [...byId.values()];
}
function studyWordTokens(text){
  return [...String(text||'').matchAll(/\p{L}[\p{L}\p{M}]*(?:[-'’][\p{L}\p{M}]+)*/gu)].filter(match=>[...match[0]].length>1).map(match=>({word:match[0],start:match.index,end:match.index+match[0].length}));
}
function studyWordContext(text,start,end){
  text=String(text||'');let left=Math.max(0,start-140),right=Math.min(text.length,end+160);
  for(let i=start-1;i>=left;i--){if(/[.!?\n]/.test(text[i])){left=i+1;break}}
  for(let i=end;i<right;i++){if(/[.!?\n]/.test(text[i])){right=i+1;break}}
  return text.slice(left,right).replace(/\s+/g,' ').trim();
}
function findStudyWord(term,fromText=false){
  const key=studyWordKey(term);if(!key)return null;
  const pool=allStudyWordCandidates();
  if(fromText){const picked=pool.find(v=>state.vocab[v.id]?.savedForReview&&studyWordKey(state.vocab[v.id]?.pickedTerm)===key);if(picked)return picked}
  const exact=pool.filter(v=>studyWordKey(v.term)===key);
  if(exact.length)return exact.find(v=>state.vocab[v.id]?.savedForReview)||exact[0];
  const lemma=pool.filter(v=>v.lemma&&studyWordKey(v.lemma)===key);
  return lemma.find(v=>state.vocab[v.id]?.savedForReview)||lemma[0]||null;
}
function savedStudyWords(){
  return allStudyWordCandidates().filter(v=>state.vocab[v.id]?.savedForReview&&wordHasMeaning(v)).map(v=>({...v,term:v.lemma||v.term,context:state.vocab[v.id]?.studyContext||v.context}));
}
function wordReviewPool(){return [...new Map([...wordTestPool(),...savedStudyWords()].map(v=>[v.id,v])).values()]}
function addStudyWordToReview({term,meaning,context='',page=null,chapter=1,sourceId='',pickedTerm=''}){
  term=String(term||'').trim().normalize('NFC');meaning=String(meaning||'').trim();
  if(!term||term.length>120||!/[\p{L}]/u.test(term))throw new Error('Enter a German word (up to 120 characters).');
  if(!meaning)throw new Error('Add a meaning so this word is useful in review.');
  chapter=Math.max(1,Math.min(12,Number(chapter)||1));page=Number(page)||null;
  let word=findStudyWord(term);const reused=!!word;
  if(!word){
    word={id:'manual-book-'+encodeURIComponent(studyWordKey(term)),term,en:meaning,ar:'',chapter,page,context,
      hint:'Saved from study text',set:1,kind:'word',testKind:'word',source:'Saved from study text',
      tip:'Recall the meaning, then say the word in its source sentence.',discovered:true,manualDiscovery:true,
      testable:false,discoveryType:'manual',discoveryConfidence:'manual',bookOrder:999998};
    state.vocabDiscovery.manual=[...manualDiscoveredWords(),word];
  }
  const old=state.vocab[word.id]||{};
  state.vocab[word.id]={...old,en:meaning,savedForReview:true,studyContext:String(context||'').trim(),studyPage:page,
    studyActivity:sourceId,pickedTerm:pickedTerm||term,status:old.status&&old.status!=='new'?old.status:'seen',
    due:old.savedForReview?(old.due||today()):today()};
  state.vocabExposure.book=unique([...(state.vocabExposure.book||[]),word.id]);
  reviewQueue=[];reviewQueueInfo=null;cardIndex=0;
  const persisted=save();return {word,persisted,reused};
}
function renderStudyText(source){
  const text=String(source.text||'').replace(/\r\n?/g,'\n');let output='',position=0;
  if(state.settings.clickToReview){
    for(const token of studyWordTokens(text)){
      output+=esc(text.slice(position,token.start))+'<button type="button" class="study-word" data-study-word="'+esc(token.word)+'" data-word-start="'+token.start+'" data-word-end="'+token.end+'" aria-label="Add '+esc(token.word)+' to word review">'+esc(token.word)+'</button>';
      position=token.end;
    }
    output+=esc(text.slice(position));
  }else output=esc(text);
  return '<div class="clean-text study-text-content" lang="de" data-study-text data-study-source="'+esc(source.id||'')+'" data-study-page="'+esc(source.page||'')+'" data-study-chapter="'+esc(source.chapter||'')+'">'+output+'</div>';
}
function renderStudySource(source,fullPage=false){
  const visual=fullPage?'<img src="'+pageImage(source.page)+'" alt="Book page '+source.page+'">':sourceCanvas(source);
  if(!state.settings.clickToReview)return visual+(source.text?'<details class="accessible-text-details"><summary><b>Accessible text view</b> <span class="muted">(extracted text)</span></summary>'+renderStudyText(source)+'</details>':'');
  if(!source.text)return visual;
  return '<section class="study-reader" data-study-reader><div data-source-panel="image">'+visual+'</div><details class="study-word-text" data-study-word-text><summary><b>Study text · Add words</b></summary><p class="study-reader-hint">Click a word below to add it to review. The original book image stays visible above.</p>'+renderStudyText(source)+'</details></section>';
}

let studyWordSelection=null,studyWordReturnFocus=null,studyWordToastTimer=null;
function openStudyWordDialog(button){
  if(!state.settings.clickToReview)return;
  const passage=button.closest('[data-study-text]');if(!passage)return;
  const picked=button.dataset.studyWord,match=findStudyWord(picked,true),record=match?state.vocab[match.id]||{}:{};
  studyWordSelection={pickedTerm:picked,context:studyWordContext(passage.textContent,Number(button.dataset.wordStart),Number(button.dataset.wordEnd)),
    page:Number(passage.dataset.studyPage)||null,chapter:Number(passage.dataset.studyChapter)||state.last?.chapter||1,sourceId:passage.dataset.studySource||''};
  studyWordReturnFocus=button;
  $('#studyWordTerm').value=match?.lemma||match?.term||picked;
  $('#studyWordMeaning').value=record.en||match?.en||record.ar||match?.ar||'';
  $('#studyWordContext').value=studyWordSelection.context;
  $('#studyWordSource').textContent='From the text: '+picked+(studyWordSelection.page?' · p. '+studyWordSelection.page:'');
  $('#studyWordStatus').textContent=record.savedForReview?'Already in Saved from texts. You can update its meaning.':match?'This word is already in the word bank. Add it to your saved review list.':'Add this word and its meaning to your saved review list.';
  $('#studyWordError').textContent='';$('#studyWordSubmit').textContent=record.savedForReview?'Update review word':'Add to review';
  $('#studyWordDialog').showModal();$('#studyWordMeaning').focus();
}
function showStudyWordToast(message){
  clearTimeout(studyWordToastTimer);const toast=$('#studyWordToast');
  $('.study-word-toast-message',toast).textContent=message;toast.hidden=false;
  studyWordToastTimer=setTimeout(()=>{toast.hidden=true},7000);
}
function initStudyWordPicker(){
  const dialog=document.createElement('dialog');dialog.id='studyWordDialog';dialog.className='study-word-dialog';
  dialog.setAttribute('aria-labelledby','studyWordHeading');
  dialog.innerHTML='<form id="studyWordForm" novalidate><div class="study-word-dialog-head"><h2 id="studyWordHeading">Add to word review</h2><button type="button" class="ghost" id="studyWordClose" aria-label="Close">×</button></div><p class="muted" id="studyWordSource"></p><p id="studyWordStatus"></p><label class="field-label" for="studyWordTerm">German word</label><input class="answer-input" id="studyWordTerm" lang="de" maxlength="120" autocomplete="off" required><label class="field-label" for="studyWordMeaning">Meaning</label><input class="answer-input" id="studyWordMeaning" autocomplete="off" placeholder="Enter the meaning" required><label class="field-label" for="studyWordContext">Sentence from the text</label><textarea class="free-area" id="studyWordContext" lang="de" rows="3"></textarea><p class="study-word-error" id="studyWordError" role="alert"></p><div class="button-row"><button type="submit" class="primary" id="studyWordSubmit">Add to review</button><button type="button" class="ghost" id="studyWordCancel">Cancel</button></div></form>';
  document.body.appendChild(dialog);
  const toast=document.createElement('div');toast.id='studyWordToast';toast.className='study-word-toast';toast.hidden=true;
  toast.innerHTML='<span class="study-word-toast-message" role="status"></span><button type="button" class="secondary" id="reviewSavedStudyWords">Review saved words</button><button type="button" class="ghost" id="closeStudyWordToast" aria-label="Dismiss">×</button>';
  document.body.appendChild(toast);
  $('#studyWordClose').onclick=$('#studyWordCancel').onclick=()=>dialog.close();
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
  dialog.addEventListener('close',()=>{if(dialog.open)return;studyWordSelection=null;if(studyWordReturnFocus?.isConnected)studyWordReturnFocus.focus({preventScroll:true})});
  $('#studyWordTerm').addEventListener('input',()=>{
    const existing=findStudyWord($('#studyWordTerm').value),saved=!!state.vocab[existing?.id]?.savedForReview;
    $('#studyWordStatus').textContent=saved?'Already in Saved from texts. This updates the existing word.':existing?'Already in your word bank. The existing word will be saved for review.':'This is a new word. Add a meaning to save it for review.';
    $('#studyWordSubmit').textContent=saved?'Update review word':'Add to review';
  });
  $('#studyWordForm').onsubmit=event=>{
    event.preventDefault();if(!studyWordSelection)return;
    try{
      const result=addStudyWordToReview({...studyWordSelection,term:$('#studyWordTerm').value,meaning:$('#studyWordMeaning').value,context:$('#studyWordContext').value});
      dialog.close();showStudyWordToast(result.word.term+(result.reused?' saved for review. Existing word reused.':' added to review.')+(result.persisted?'':' Saving on this device failed — download a backup.'));
    }catch(error){$('#studyWordError').textContent=error.message}
  };
  $('#reviewSavedStudyWords').onclick=()=>{toast.hidden=true;closeViewer();reviewPoolMode='saved';reviewSelectedChapter='auto';reviewQueue=[];cardIndex=0;showPage('review')};
  $('#closeStudyWordToast').onclick=()=>{toast.hidden=true};
  document.addEventListener('click',event=>{
    const word=event.target.closest('[data-study-word]');if(word)openStudyWordDialog(word);
  });
}

function deleteManualBookWord(v){
  if(!v?.manualDiscovery)return false;if(!confirm(`Delete “${v.term}” from your manually added book words?`))return false;
  state.vocabDiscovery.manual=manualDiscoveredWords().filter(x=>x.id!==v.id);state.vocabDiscovery.included=state.vocabDiscovery.included.filter(id=>id!==v.id);state.vocabDiscovery.excluded=state.vocabDiscovery.excluded.filter(id=>id!==v.id);delete state.vocab[v.id];if(state.learningDB?.words)delete state.learningDB.words[v.id];Object.keys(state.vocabExposure||{}).forEach(k=>state.vocabExposure[k]=(state.vocabExposure[k]||[]).filter(id=>id!==v.id));save();return true;
}
function unique(a){return [...new Set((a||[]).filter(Boolean))]}
function normalizeContributionKind(kind){const k=String(kind||'').trim();if(CONTRIBUTION_SECTIONS.includes(k))return k;if(k==='Review')return'Vocabulary';if(k==='wordtest'||k==='WordTest')return'Word Test';if(k==='Pronunciation'||k==='Conversation')return'Speaking';if(['Exercise','Exam','Learn','Main course','Vertiefung','Abschlusstest','General'].includes(k))return'Practice';return null}
function normalizeEvents(raw){const out={};Object.entries(raw||{}).forEach(([day,e])=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return;const src=e&&typeof e==='object'?e:{};const sections=unique([...(src.sections||[]),...(src.kinds||[])].map(normalizeContributionKind));const items=unique(src.items||[]);if(sections.length||items.length)out[day]={sections,items};});return out}
function normalizeLoadedState(s){const b=baseState(),merged={...b,...((s&&typeof s==='object')?s:{}),settings:{...b.settings,...((s&&s.settings)||{})},last:{...b.last,...((s&&s.last)||{})}};merged.events=normalizeEvents(s&&s.events);merged.vocabExposure={...b.vocabExposure,...((s&&s.vocabExposure)||{})};Object.keys(merged.vocabExposure).forEach(k=>merged.vocabExposure[k]=unique(merged.vocabExposure[k]));merged.vocabDiscovery={included:unique(s&&s.vocabDiscovery&&s.vocabDiscovery.included),excluded:unique(s&&s.vocabDiscovery&&s.vocabDiscovery.excluded),manual:Array.isArray(s&&s.vocabDiscovery&&s.vocabDiscovery.manual)?s.vocabDiscovery.manual.filter(v=>v&&v.id&&v.term):[]};merged.vocabDiscovery.included=merged.vocabDiscovery.included.filter(id=>!merged.vocabDiscovery.excluded.includes(id));merged.learningDB={words:{...((s&&s.learningDB&&s.learningDB.words)||{})}};merged.revisions=s?.revisions&&typeof s.revisions==='object'?s.revisions:{};merged.schema=3;return backfillDiscoveredState(merged)}
function loadState(){
  let raw=null;
  try{
    raw=localStorage.getItem(storageKey);
    return raw?normalizeLoadedState(JSON.parse(raw)):baseState();
  }catch(error){
    unreadableStoredState=raw;
    storageError=raw?'Saved progress could not be read. Download a backup, then import a valid backup or reset progress in Settings.':'Browser storage is unavailable. Download a backup before closing this page.';
    return baseState();
  }
}
function downloadProgressBackup(){
  const payload=unreadableStoredState===null?state:{unreadableSavedData:unreadableStoredState,currentState:state};
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='spektrum-a1-progress-backup.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1200);
}
function showStorageStatus(){
  let notice=document.getElementById('storageNotice');
  if(!storageError){notice?.remove();return}
  if(!notice){
    notice=document.createElement('div');notice.id='storageNotice';notice.className='storage-notice';notice.setAttribute('role','alert');
    const message=document.createElement('span');message.className='storage-message';notice.appendChild(message);
    const download=document.createElement('button');download.type='button';download.className='secondary';download.textContent='Download backup';download.onclick=downloadProgressBackup;notice.appendChild(download);
    const retry=document.createElement('button');retry.type='button';retry.className='secondary';retry.textContent='Retry saving';retry.onclick=()=>persistState();notice.appendChild(retry);
    document.body.appendChild(notice);
  }
  notice.querySelector('.storage-message').textContent=storageError;
}
function persistState(){
  if(unreadableStoredState!==null){showStorageStatus();return false}
  try{
    localStorage.setItem(storageKey,JSON.stringify(state));
    storageError=null;showStorageStatus();return true;
  }catch(error){
    storageError='Your latest progress could not be saved on this device. Keep this page open and download a backup, or free browser storage and retry.';
    showStorageStatus();return false;
  }
}
function defaultUseStaticSeed(){try{const v=localStorage.getItem('spektrum-a1-use-seed');return v===null?true:v==='1'}catch{return true}}
function setUseStaticSeed(on){try{localStorage.setItem('spektrum-a1-use-seed',on?'1':'0')}catch{}}
function detectGithubRepoFromLocation(){
  try{
    const host=String(location.hostname||'').toLowerCase(),path=String(location.pathname||'').replace(/^\/+|\/+$/g,'').split('/');
    if(host.endsWith('.github.io')){
      const owner=host.replace(/\.github\.io$/,''),repo=path[0]&&!path[0].endsWith('.html')?path[0]:`${owner}.github.io`;
      if(owner&&repo)return `${owner}/${repo}`;
    }
  }catch{}
  return '';
}
function loadSyncConfig(){
  try{
    const s=JSON.parse(localStorage.getItem(syncConfigKey)||'null')||{};
    return {
      provider:String(s.provider||(s.ghToken?'github':'gas')),
      url:String(s.url||''),
      key:String(s.key||''),
      ghRepo:String(s.ghRepo||detectGithubRepoFromLocation()||''),
      ghBranch:String(s.ghBranch||'main'),
      ghPath:String(s.ghPath||'data/user-progress.json'),
      ghToken:String(s.ghToken||'')
    };
  }catch{
    return {provider:'github',url:'',key:'',ghRepo:detectGithubRepoFromLocation(),ghBranch:'main',ghPath:'data/user-progress.json',ghToken:''};
  }
}
function loadSyncMeta(){try{return {...{localUpdatedAt:0,lastPullAt:0,lastPushAt:0,lastError:'',ghSha:''},...(JSON.parse(localStorage.getItem(syncMetaKey)||'null')||{})}}catch{return {localUpdatedAt:0,lastPullAt:0,lastPushAt:0,lastError:'',ghSha:''}}}
function saveSyncConfig(){try{localStorage.setItem(syncConfigKey,JSON.stringify(syncConfig))}catch{}}
function saveSyncMeta(){try{localStorage.setItem(syncMetaKey,JSON.stringify(syncMeta))}catch{}}
function cleanSyncUrl(url){return String(url||'').trim().replace(/\?.*$/,'').replace(/\/$/,'')}
function gasReady(){return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/i.test(syncConfig.url||'')&&String(syncConfig.key||'').length>=16}
function githubReady(){return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(syncConfig.ghRepo||'').trim())&&String(syncConfig.ghToken||'').trim().length>=10}
function cloudReady(){return syncConfig.provider==='github'?githubReady():(gasReady()||githubReady())}
function generateSyncKey(){const bytes=new Uint8Array(18);if(globalThis.crypto?.getRandomValues)crypto.getRandomValues(bytes);else for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}
function syncTime(ts){if(!ts)return'Never';try{return new Date(ts).toLocaleString()}catch{return'Unknown'}}
function setCloudStatus(message,type=''){const el=$('#cloudSyncStatus');if(!el)return;el.textContent=message;el.dataset.state=type}
function scheduleCloudPush(){
  if(cloudBootstrapping||!cloudReady())return;
  if(syncBusy){syncPending=true;return}
  clearTimeout(syncSaveTimer);
  syncSaveTimer=setTimeout(()=>cloudSyncNow({silent:true}),1800);
}
function finishSync(){
  syncBusy=false;
  if(syncPending){syncPending=false;scheduleCloudPush()}
}
function saveViewOnly(){persistState();updateStreakUI()}
function save(){
  const change=Sync.stamp(state,progressBaseline);
  progressBaseline=change.baseline;
  const saved=persistState();
  if(change.changed&&!cloudBootstrapping){
    syncMeta.localUpdatedAt=change.updatedAt;syncMeta.lastError='';saveSyncMeta();scheduleCloudPush();
  }
  updateStreakUI();return saved;
}
function backgroundRefreshAllowed(){
  if(current.page==='mistakes')return !$('#mistakeAnswerForm');
  return !['chapter','exam','wordtest','review'].includes(current.page);
}
function applyMergedStateToUI(nextState,remoteAt,{render=true}={}){
  const prevBoot=cloudBootstrapping;cloudBootstrapping=true;
  try{
    state=normalizeLoadedState(nextState);
    progressBaseline=Sync.capture(state);
    setUseStaticSeed(true);persistState();
    syncMeta.localUpdatedAt=Math.max(Number(remoteAt)||0,Number(syncMeta.localUpdatedAt)||0);syncMeta.lastPullAt=Date.now();syncMeta.lastError='';saveSyncMeta();
    applyThemeWithoutSave(state.settings.theme||'light');applySidebar();updateStreakUI();updateStartDeutschNavIcon();
    if(render){
      const page=current.page||state.last?.page||'home';
      if(page==='chapter')openChapter(current.chapter||state.last.chapter||1,current.section||state.last.section||'Main course',current.activity||state.last.activity||null);
      else showPage(page);
    }
  }finally{cloudBootstrapping=prevBoot}
}
function utf8ToBase64(str){const bytes=new TextEncoder().encode(str);let bin='';for(let i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);return btoa(bin)}
function base64ToUtf8(b64){const bin=atob(String(b64||'').replace(/\s+/g,''));const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return new TextDecoder().decode(bytes)}
async function githubFetchRecord(){
  const repo=String(syncConfig.ghRepo||'').trim(),branch=String(syncConfig.ghBranch||'main').trim()||'main',path=String(syncConfig.ghPath||'data/user-progress.json').trim().replace(/^\/+/,'');
  const res=await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}&_=${Date.now()}`,{
    headers:{'Accept':'application/vnd.github+json','Authorization':`Bearer ${syncConfig.ghToken.trim()}`}
  });
  if(res.status===404)return {found:false};
  if(!res.ok){const err=await res.json().catch(()=>({}));throw new Error(err.message||`GitHub API error (${res.status})`)}
  const info=await res.json();
  syncMeta.ghSha=info.sha||'';saveSyncMeta();
  const raw=JSON.parse(base64ToUtf8(info.content||''));
  const record=raw&&raw.state?raw:{updatedAt:Date.now(),state:raw};
  return {found:true,sha:info.sha,updatedAt:Number(record.updatedAt||Date.now()),state:record.state};
}
async function githubPushRecord(stateToPush,updatedAt){
  const repo=String(syncConfig.ghRepo||'').trim(),branch=String(syncConfig.ghBranch||'main').trim()||'main',path=String(syncConfig.ghPath||'data/user-progress.json').trim().replace(/^\/+/,'');
  let sha=syncMeta.ghSha||'';
  if(!sha){try{const cur=await githubFetchRecord();if(cur.found)sha=cur.sha||''}catch{}}
  const payload={updatedAt:updatedAt||Date.now(),appVersion:APP_VERSION,richness:stateRichness(stateToPush),state:stateToPush};
  const body={message:`Sync study progress (${stateRichness(stateToPush).completed} exercises, ${stateRichness(stateToPush).vocab} words)`,content:utf8ToBase64(JSON.stringify(payload,null,2)),branch};
  if(sha)body.sha=sha;
  const res=await fetch(`https://api.github.com/repos/${repo}/contents/${path}`,{
    method:'PUT',
    headers:{'Accept':'application/vnd.github+json','Authorization':`Bearer ${syncConfig.ghToken.trim()}`,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  if(!res.ok){const err=await res.json().catch(()=>({}));throw new Error(err.message||`GitHub push failed (${res.status})`)}
  const out=await res.json();
  syncMeta.ghSha=out?.content?.sha||sha;syncMeta.lastPushAt=Date.now();syncMeta.lastError='';saveSyncMeta();
  return out;
}
function cloudJsonp(action,timeout=12000){return new Promise((resolve,reject)=>{if(!gasReady())return reject(new Error('Google Apps Script sync is not configured.'));const callback='__spektrumCloud_'+Date.now()+'_'+Math.random().toString(36).slice(2),script=document.createElement('script'),timer=setTimeout(()=>finish(new Error('Cloud request timed out.')),timeout);function finish(err,data){clearTimeout(timer);try{delete window[callback]}catch{}script.remove();err?reject(err):resolve(data)}window[callback]=data=>finish(null,data);script.onerror=()=>finish(new Error('Could not reach the cloud sync service.'));const sep=syncConfig.url.includes('?')?'&':'?';script.src=`${syncConfig.url}${sep}action=${encodeURIComponent(action)}&key=${encodeURIComponent(syncConfig.key)}&callback=${encodeURIComponent(callback)}&_=${Date.now()}`;document.head.appendChild(script)})}
async function fetchRemoteRecord(){
  if(syncConfig.provider==='github'&&githubReady())return await githubFetchRecord();
  if(gasReady()){
    const data=await cloudJsonp('pull');
    if(!data?.ok)throw new Error(data?.error||'Cloud pull failed.');
    if(!data.found||!data.record)return {found:false};
    return {found:true,updatedAt:Number(data.record.updatedAt||0),state:data.record.state};
  }
  if(githubReady())return await githubFetchRecord();
  throw new Error('Configure GitHub Sync or Google Apps Script URL first.');
}
async function pushRemoteRecord(stateToPush,updatedAt){
  if(syncConfig.provider==='github'&&githubReady())return await githubPushRecord(stateToPush,updatedAt);
  if(gasReady()){
    await fetch(syncConfig.url,{method:'POST',mode:'no-cors',cache:'no-store',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({action:'push',key:syncConfig.key,updatedAt,state:stateToPush})});
    syncMeta.lastPushAt=Date.now();syncMeta.lastError='';saveSyncMeta();
    return true;
  }
  if(githubReady())return await githubPushRecord(stateToPush,updatedAt);
  throw new Error('Configure GitHub Sync or Google Apps Script URL first.');
}
async function cloudPull({apply=true,silent=false,merge=true}={}){
  if(!apply)return fetchRemoteRecord();
  return cloudSyncNow({silent,prefer:merge?null:'remote',upload:false});
}
async function cloudPush({silent=false,force=false}={}){
  if(syncBusy){syncPending=true;return false}
  const richness=stateRichness(state);
  if(richness.score===0&&!force){if(!silent)setCloudStatus('Blocked empty upload to protect your remote progress.','ok');return false}
  syncBusy=true;
  try{
    await pushRemoteRecord(JSON.parse(JSON.stringify(state)),syncMeta.localUpdatedAt||Date.now());
    if(!silent)setCloudStatus('Uploaded progress · '+syncTime(syncMeta.lastPushAt),'ok');
    return true;
  }catch(error){
    syncMeta.lastError=String(error?.message||error);saveSyncMeta();
    if(!silent)setCloudStatus('Sync error: '+syncMeta.lastError,'error');
    return false;
  }finally{finishSync()}
}
async function cloudSyncNow({silent=false,prefer=null,upload=true}={}){
  if(!cloudReady())return false;
  if(syncBusy){syncPending=true;return false}
  syncBusy=true;const epoch=syncEpoch;
  try{
    if(!silent)setCloudStatus('Syncing progress…','busy');
    const remote=await fetchRemoteRecord();
    if(epoch!==syncEpoch)return false;
    syncMeta.lastPullAt=Date.now();
    if(!remote.found||!remote.state){
      if(upload&&stateRichness(state).score>0)await pushRemoteRecord(JSON.parse(JSON.stringify(state)),syncMeta.localUpdatedAt||Date.now());
      if(!silent)setCloudStatus('Connected · '+(stateRichness(state).score?'Progress saved.':'Waiting for study activity before first upload.'),'ok');
      return true;
    }
    const normalizedRemote=normalizeLoadedState(remote.state);
    const merged=prefer==='remote'?normalizedRemote:mergeStudyStates(state,normalizedRemote);
    const changed=Sync.signature(merged)!==Sync.signature(state);
    if(changed){
      saveSnapshot('Before sync merge');
      const render=!silent||backgroundRefreshAllowed();
      applyMergedStateToUI(merged,remote.updatedAt,{render});
    }
    if(upload&&prefer!=='remote'&&(prefer==='local'||Sync.signature(merged)!==Sync.signature(normalizedRemote))){
      await pushRemoteRecord(JSON.parse(JSON.stringify(state)),Math.max(Number(syncMeta.localUpdatedAt)||0,Number(remote.updatedAt)||0));
    }
    if(epoch!==syncEpoch)return false;
    syncMeta.lastError='';saveSyncMeta();
    if(!silent)setCloudStatus('Synced ('+stateRichness(state).completed+' exercises) · '+syncTime(Date.now()),'ok');
    return true;
  }catch(error){
    syncMeta.lastError=String(error?.message||error);saveSyncMeta();
    if(!silent)setCloudStatus('Sync error: '+syncMeta.lastError,'error');
    return false;
  }finally{finishSync()}
}
function applyThemeWithoutSave(t){state.settings.theme=t;document.documentElement.dataset.theme=t}
async function tryLoadRepoProgressSeed(){
  const epoch=syncEpoch;
  if(!defaultUseStaticSeed())return false;
  try{
    if(window.SPEKTRUM_USER_PROGRESS&&typeof window.SPEKTRUM_USER_PROGRESS==='object'){
      const seedState=window.SPEKTRUM_USER_PROGRESS.state||window.SPEKTRUM_USER_PROGRESS;
      if(Sync.signature(mergeStudyStates(state,seedState))!==Sync.signature(state)){
        saveSnapshot('Before repo seed merge');
        applyMergedStateToUI(mergeStudyStates(state,seedState,'remote'),Date.now());
        return true;
      }
    }
    if(/^https?:$/i.test(location.protocol)){
      const res=await fetch(`./data/user-progress.json?_=${Date.now()}`,{cache:'no-store'});
      if(res.ok){
        const raw=await res.json();
        if(epoch!==syncEpoch||!defaultUseStaticSeed())return false;
        const seedState=raw&&raw.state?raw.state:raw;
        if(seedState&&typeof seedState==='object'){
          const merged=mergeStudyStates(state,seedState,'auto');
          if(Sync.signature(merged)!==Sync.signature(state)){
            saveSnapshot('Before repo user-progress.json merge');
            applyMergedStateToUI(merged,Number(raw?.updatedAt||Date.now()),{render:backgroundRefreshAllowed()});
            return true;
          }
        }
      }
    }
  }catch{}
  return false;
}
async function cloudStartupSync(){cloudBootstrapping=false;await tryLoadRepoProgressSeed();if(!cloudReady())return;await cloudSyncNow({silent:true});lastCloudCheck=Date.now()}
function maybeCheckCloud(){if(!cloudReady()||document.hidden||Date.now()-lastCloudCheck<30000)return;lastCloudCheck=Date.now();cloudSyncNow({silent:true})}
function handleCloudOnline(){if(!cloudReady())return;clearTimeout(syncSaveTimer);lastCloudCheck=Date.now();cloudSyncNow({silent:true})}
function event(kind,id){const section=normalizeContributionKind(kind);if(!section)return;const d=today();const e=state.events[d]||{sections:[],items:[]};e.sections=unique([...(e.sections||[]),section]);if(id)e.items=unique([...(e.items||[]),id]);state.events[d]=e;save()}
function contributionSections(d){const e=state.events[d];return e?unique((e.sections||[]).map(normalizeContributionKind)):[]}
function contributionLevel(d){return Math.min(8,contributionSections(d).length)}
function streak(){const now=new Date();const key=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;let d=new Date(now),n=0;if(contributionLevel(key(d))===0)d.setDate(d.getDate()-1);for(let i=0;i<10000;i++){if(contributionLevel(key(d))>0){n++;d.setDate(d.getDate()-1)}else break}return n}
function ensureStreakFlame(){const pill=$('#streakPill');if(!pill||pill.querySelector('.streak-flame'))return;const node=[...pill.childNodes].find(x=>x.nodeType===Node.TEXT_NODE&&x.textContent.includes('🔥'));if(!node)return;const span=document.createElement('span');span.className='streak-flame';span.textContent='🔥';const rest=node.textContent.replace('🔥','');node.replaceWith(span,document.createTextNode(rest))}
function updateStreakUI(){const n=streak(),pill=$('#streakPill');$('#streakCount').textContent=n;ensureStreakFlame();pill.classList.toggle('pending',contributionLevel(today())===0)}
function completed(id){return !!state.completed[id]}
function toggleComplete(id,on=true){state.completed[id]=on;if(on){const a=D.activities.find(x=>x.id===id);event(a?primaryContributionForActivity(a):'Practice',id)}else save()}
function pageImage(p){return D.pageImagePattern.replace('{page}',String(p).padStart(3,'0'))}
function chapterActivities(ch){return D.activities.filter(a=>a.chapter===ch)}
function chapterPages(ch){return D.pages.filter(p=>p.chapter===ch)}
function chapterProgress(ch){const a=chapterActivities(ch).filter(x=>!['Overview','Übersichten'].includes(x.section));const done=a.filter(x=>completed(x.id)).length;return {done,total:a.length,pct:a.length?Math.round(done/a.length*100):0}}
function overallProgress(){const a=D.activities.filter(x=>x.chapter&&!['Overview','Übersichten'].includes(x.section));const done=a.filter(x=>completed(x.id)).length;return {done,total:a.length,pct:a.length?Math.round(done/a.length*100):0}}
function setTitle(title,eyebrow='Personal study app'){$('#pageTitle').textContent=title;$('#eyebrow').textContent=eyebrow}
function closeMenu(){$('#sidebar').classList.remove('open');$('#backdrop').classList.remove('active')}
function navActive(page){$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page))}
function removeLegacyWordReviewUI(){/* Word Review & Shadowing Lab restored in v2.5 */}
function showPage(page,arg){current.page=page;state.last.page=page;saveViewOnly();navActive(page);closeMenu();window.scrollTo(0,0);({home:renderHome,chapters:renderChapters,vocabulary:renderVocabulary,review:renderReview,mistakes:renderMistakeReview,wordtest:renderWordTest,audio:renderAudio,exam:renderExam,structures:renderStructures,search:renderSearch,progress:renderProgress,settings:renderSettings}[page]||renderHome)(arg)}

function renderHeatmap(){const cells=[],end=new Date();end.setHours(12,0,0,0);const start=new Date(end);start.setDate(end.getDate()-363);let active=0,total=0;for(let i=0;i<364;i++){const d=new Date(start);d.setDate(start.getDate()+i);const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;const sections=contributionSections(k),l=sections.length;if(l){active++;total+=l}cells.push(`<span class="heat-cell l${l}${k===today()?' today':''}" title="${k}: ${l}/8 sections${l?' · '+sections.join(', '):''}"></span>`)}const t=contributionSections(today()),avg=active?(total/active).toFixed(1):'0';return `<div class="contribution-summary">${active} contribution day${active===1?'':'s'} · average ${avg}/8 · today ${t.length}/8</div><div class="heat-wrap"><div class="heatmap">${cells.join('')}</div></div><div class="contribution-sections">${CONTRIBUTION_SECTIONS.map(x=>`<span class="${t.includes(x)?'active':''}">${t.includes(x)?'✓ ':''}${x}</span>`).join('')}</div>`}
function nextIncomplete(){return D.activities.find(a=>a.chapter&&a.section==='Main course'&&!completed(a.id))||D.activities.find(a=>a.chapter&&!completed(a.id))}
function dailyPlan(){const types=['Listening','Reading','Grammar','Speaking','Writing','Vocabulary','Practice'];const result=[];for(const t of types){const a=D.activities.find(x=>x.chapter&&x.tags.includes(t)&&!completed(x.id));if(a)result.push(a);if(result.length>=4)break}if(result.length<4){for(const a of D.activities){if(a.chapter&&!completed(a.id)&&!result.some(r=>r.id===a.id))result.push(a);if(result.length>=4)break}}return result}
function renderHome(){setTitle('Home');const p=overallProgress(),next=nextIncomplete(),plan=dailyPlan();$('#pageHost').innerHTML=`
<section class="hero"><div><span class="badge">SPEKTRUM DEUTSCH A1+</span><h2>Your book, rebuilt as a study app.</h2><p>All twelve chapters, reading, listening, pronunciation, Vertiefung, chapter tests, the Start Deutsch 1 practice section and the final structure reference are available without opening the PDF.</p><div class="button-row"><button class="primary" id="continueBtn">${next?'Continue studying':'Open chapters'}</button><button class="ghost" id="openChapters">All chapters</button></div></div><div class="progress-ring" style="--pct:${p.pct}%"><strong>${p.pct}%</strong></div></section>
<div class="grid stats-grid"><div class="stat"><small>Completed activities</small><strong>${p.done}</strong><span class="muted">of ${p.total}</span></div><div class="stat"><small>Audio tracks</small><strong>126</strong><span class="muted">supplied recordings</span></div><div class="stat"><small>Vocabulary bank</small><strong>${bankWordPool().filter(v=>!discoveryExcluded(v)).length} / ${PHRASE_TESTS.length}</strong><span class="muted">words / sentences & phrases</span></div><div class="stat"><small>Streak</small><strong>🔥 ${streak()}</strong><span class="muted">active study days</span></div></div>
<section class="panel"><div class="panel-head"><div><h2>Today's adaptive plan</h2><p class="muted">The plan follows unfinished material and mixes skills.</p></div></div><div class="grid daily-grid">${plan.map(a=>`<div class="daily-item ${completed(a.id)?'done':''}" data-open-activity="${a.id}"><b>Kapitel ${a.chapter} · ${esc(a.label)}</b><span>${esc(a.title)}</span><small class="muted">${a.tags.slice(0,2).join(' · ')}</small></div>`).join('')}</div></section>
<section class="panel"><div class="panel-head"><div><h2>Contribution</h2><p class="muted">Each of the 8 study sections adds at most one level per day. Repeating the same section never inflates the square, and unmarking an exercise never adds activity.</p></div><span class="badge">Today ${contributionLevel(today())}/8</span></div>${renderHeatmap()}</section>
<section class="panel"><div class="panel-head"><div><h2>Chapters</h2><p class="muted">Progress is calculated from actual activities.</p></div><button class="secondary" id="allCh">View all</button></div><div class="grid chapter-grid">${D.chapters.slice(0,6).map(ch=>chapterCard(ch)).join('')}</div></section>`;
$('#continueBtn').onclick=()=>next?openActivity(next.id):showPage('chapters');$('#openChapters').onclick=$('#allCh').onclick=()=>showPage('chapters');$$('[data-open-activity]').forEach(e=>e.onclick=()=>openActivity(e.dataset.openActivity));$$('[data-ch]').forEach(e=>e.onclick=()=>openChapter(+e.dataset.ch));}
function mistakeIndices(activity) {
  const record = state.answers[activity.id];
  const spec = correctionSpec(activity);
  if (!record || !spec) return [];
  return spec.fields.flatMap((_, index) => Sync.lastFieldCheck(record, index)?.correct === false ? [index] : []);
}
function mistakeCountLabel(activity) {
  const count = mistakeIndices(activity).length;
  return count ? count + (count === 1 ? ' mistake' : ' mistakes') : '';
}
function mistakeOptionSuffix(activity) {
  const label = mistakeCountLabel(activity);
  return label ? ' · ' + label : '';
}
function refreshActivityMistakes(activity) {
  const badge = $('[data-mistakes-for="' + activity.id + '"]');
  if (badge) badge.textContent = mistakeCountLabel(activity);
  const option = $('#quickActSelect option[value="' + activity.id + '"]');
  if (option) option.textContent = (completed(activity.id) ? '✓ ' : '') + activity.label + ' · ' + activity.title + ' (p.' + activity.page + ')' + mistakeOptionSuffix(activity);
}
function pendingMistakes() {
  return [...D.activities, ...startDeutschExamPages()].flatMap(activity =>
    mistakeIndices(activity).map(index => ({activity, index, time: Sync.lastFieldCheck(state.answers[activity.id], index).time}))
  ).sort((left, right) => left.time - right.time);
}
function selectMistakeSession(items) {
  const groups = new Map();
  for (const item of items) {
    const chapter = item.activity.chapter || 'exam';
    if (!groups.has(chapter)) groups.set(chapter, []);
    groups.get(chapter).push(item);
  }
  const session = [];
  for (let round = 0; session.length < Math.min(5, items.length); round++) {
    for (const group of groups.values()) {
      if (group[round]) session.push(group[round]);
      if (session.length === 5) break;
    }
  }
  return session;
}
function renderMistakeReview() {
  const items = pendingMistakes();
  setTitle('Review Mistakes', 'Exercise review');
  const panel = $('#pageHost');
  if (!items.length) {
    panel.innerHTML = '<section class="panel mistake-overview"><h2>No mistakes to review</h2><p class="muted">Questions you answer incorrectly in the chapters and Start Deutsch 1 appear here.</p></section>';
    return;
  }
  const count = Math.min(5, items.length);
  panel.innerHTML = '<section class="panel mistake-overview"><h2>' + items.length + (items.length === 1 ? ' question' : ' questions') + ' to review</h2><button class="primary" id="startMistakes">Review ' + count + (count === 1 ? ' question' : ' questions') + '</button></section>';
  $('#startMistakes').onclick = () => renderMistakeQuestion(selectMistakeSession(pendingMistakes()), 0);
}
function renderMistakeQuestion(session, position) {
  // An answer may have been corrected on another device since this session began.
  while (position < session.length) {
    const {activity, index} = session[position];
    if (Sync.lastFieldCheck(state.answers[activity.id], index)?.correct === false) break;
    position++;
  }
  if (position >= session.length) { renderMistakeReview(); return; }
  const {activity, index} = session[position];
  const spec = correctionSpec(activity), field = spec.fields[index];
  const location = activity.chapter ? 'Kapitel ' + activity.chapter : 'Start Deutsch 1';
  const prompt = field.prompt || field.label || 'Question ' + (index + 1);
  const panel = $('#pageHost');
  panel.innerHTML = 
    '<article class="panel mistake-session"><div class="mistake-session-head"><span>Question ' + (position + 1) + ' of ' + session.length + '</span><button class="ghost" id="endMistakes">End review</button></div>' +
    '<div class="muted">' + esc(location) + ' · p. ' + esc(activity.page) + '</div><h2>' + esc(activity.label) + ' · ' + esc(activity.title) + '</h2>' +
    '<div class="mistake-question-layout"><div class="mistake-source">' + audioHtml(activity) + renderStudySource(activity) + '</div>' +
    '<form id="mistakeAnswerForm"><h3 id="correction-prompt-' + index + '">' + esc(prompt) + '</h3>' + renderCorrectionFieldInput(field, index, '', spec) +
    '<div class="button-row"><button class="primary" id="checkMistake" disabled>Check answer</button><button type="button" class="ghost" id="nextMistake">Skip</button></div>' +
    '<p class="mistake-feedback" id="correction-feedback-' + index + '" role="status"></p></form></div></article>';
  drawSourceCanvases();
  wireStudyWorkspaceControls(panel, () => renderMistakeQuestion(session, position));
  $$('.full-page', panel).forEach(button => button.onclick = () => showViewer(Number(button.dataset.fullPage)));
  $$('.rate', panel).forEach(button => button.onclick = () => { button.closest('.audio-box').querySelector('audio').playbackRate = Number(button.dataset.rate); });
  wireCorrectionChoices(panel);
  const form = $('#mistakeAnswerForm'), input = $('.wb-line', form), check = $('#checkMistake'), next = $('#nextMistake');
  const feedback = $('.mistake-feedback', form);
  $('#endMistakes').onclick = renderMistakeReview;
  next.onclick = () => renderMistakeQuestion(session, position + 1);
  input.addEventListener('input', () => { check.disabled = !input.value.trim(); feedback.textContent = ''; });
  form.onsubmit = event => {
    event.preventDefault();
    if (check.disabled || !input.value.trim()) return;
    const record = state.answers[activity.id];
    if (Sync.lastFieldCheck(record, index)?.correct !== false) { next.onclick(); return; }
    // Use the current record so that other questions, drafts and exam writing are preserved.
    const values = [...(record.lines || [])];
    values[index] = input.value;
    storeCorrectionAnswers(activity, spec, values, index);
    const correct = state.answers[activity.id].check.results[index];
    feedback.textContent = correct ? '✓ Correct. Removed from your mistakes.' : 'Try again. This question is still in your review list.';
    feedback.classList.toggle('correct', correct);
    if (correct) {
      check.disabled = true; input.disabled = true;
      $$('.wb-corr-pill', form).forEach(button => { button.disabled = true; });
    }
    next.textContent = position + 1 === session.length ? 'Finish review' : 'Next question';
  };
}

function chapterCard(ch){const p=chapterProgress(ch.id);return `<article class="chapter-card" data-ch="${ch.id}" style="cursor:pointer"><span class="badge">KAPITEL ${ch.id}</span><h3>${esc(ch.title)}</h3><p>${esc(ch.summary)}</p><div class="progress-bar"><span style="width:${p.pct}%"></span></div><small class="muted">${p.done}/${p.total} activities · ${ch.audioCount} audio tracks · ${p.pct}%</small></article>`}
function renderChapters(){setTitle('Chapters','12 chapters · complete book flow');$('#pageHost').innerHTML=`<section class="panel" style="margin-top:0"><div class="panel-head"><div><h2>Course map</h2><p class="muted">Open any chapter. Main course, Vertiefung, overview pages and the chapter test are kept separate.</p></div></div><div class="grid chapter-grid">${D.chapters.map(ch=>chapterCard(ch)).join('')}</div></section>`;$$('[data-ch]').forEach(e=>e.onclick=()=>openChapter(+e.dataset.ch))}
function openChapter(ch,section='Main course',aid=null){current={page:'chapter',chapter:ch,section,activity:aid};state.last={page:'chapter',chapter:ch,section,activity:aid};saveViewOnly();navActive('chapters');renderChapter()}
function openActivity(id){const a=D.activities.find(x=>x.id===id);if(!a)return;openChapter(a.chapter,a.section,id)}
function renderChapter(){const ch=D.chapters.find(x=>x.id===current.chapter);setTitle(`Kapitel ${ch.id}: ${ch.title}`,`Book pages ${ch.bookPages}`);let sec=current.section||'Main course';const secNames=['Main course','Vertiefung','Übersichten','Abschlusstest','Book pages'];let acts=sec==='Book pages'?[]:chapterActivities(ch.id).filter(a=>a.section===sec);if(sec==='Main course')acts=[...chapterActivities(ch.id).filter(a=>a.section==='Overview'),...acts];let a=current.activity?acts.find(x=>x.id===current.activity):null;if(!a&&acts.length)a=acts.find(x=>!completed(x.id))||acts[0];if(a)current.activity=a.id;state.last={...current};saveViewOnly();
$('#pageHost').innerHTML=`<div class="chapter-top"><div><span class="badge">KAPITEL ${ch.id}</span><h2 style="margin:8px 0 4px">${esc(ch.title)}</h2><span class="muted">${esc(ch.summary)}</span></div><div><strong>${chapterProgress(ch.id).pct}%</strong> complete</div></div><div class="chapter-tabs">${secNames.map(s=>`<button class="${s===sec?'primary':'ghost'}" data-sec="${s}">${s}</button>`).join('')}</div><div id="chapterBody"></div>`;
$$('[data-sec]').forEach(b=>b.onclick=()=>{current.section=b.dataset.sec;current.activity=null;renderChapter()});if(sec==='Book pages'){renderBookPages(ch.id);return}$('#chapterBody').innerHTML=`<div class="chapter-layout ${isActivityListCollapsed()?'list-collapsed':''}"><aside class="activity-list">${acts.map(x=>`<button class="activity-link ${x.id===a?.id?'active':''} ${completed(x.id)?'done':''}" data-aid="${x.id}"><span><b>${esc(x.label)}</b> ${esc(x.title)}<small>p. ${x.page} · ${x.tags.slice(0,2).join(' / ')}</small><small class="mistake-count" data-mistakes-for="${esc(x.id)}">${mistakeCountLabel(x)}</small></span></button>`).join('')}</aside><div id="activityHost"></div></div>`;$$('[data-aid]').forEach(b=>b.onclick=()=>{current.activity=b.dataset.aid;renderChapter()});if(a)renderActivity(a,acts)}
function renderBookPages(ch){const pages=chapterPages(ch);$('#chapterBody').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>Complete source pages</h2><p class="muted">This tab guarantees that every diagram, table, reading passage and exercise remains available exactly as supplied, even when the text extraction is imperfect.</p></div></div><div class="page-browser">${pages.map(p=>`<div class="page-thumb" data-page-img="${p.page}"><img loading="lazy" src="${pageImage(p.page)}"><div><b>Page ${p.page}</b><small class="muted"> · ${esc(p.section)}</small></div></div>`).join('')}</div></section>`;$$('[data-page-img]').forEach(e=>e.onclick=()=>showViewer(+e.dataset.pageImg))}
function arabicHelp(kind){const m={fill:'املأ الفراغات كما في التمرين الأصلي. استخدم الصورة الأصلية أعلاه لمعرفة موضع كل فراغ.',truefalse:'اختر صحيح أو خطأ لكل بند كما في الكتاب.',abc:'اختر A أو B أو C لكل سؤال.',choice:'اختر الإجابات بحسب التمرين ثم سجّلها هنا.',match:'طابق العناصر كما في الكتاب وسجّل أزواج الإجابات.',writing:'اكتب إجابتك كاملة هنا. ستبقى محفوظة على هذا الجهاز.',speaking:'نفّذ تمرين المحادثة كما هو في الكتاب. يمكنك تسجيل صوتك أو كتابة ملاحظاتك.',listening:'استمع إلى التسجيل ثم نفّذ المطلوب في التمرين الأصلي.',reading:'اقرأ النص كاملًا ثم أجب عن الأسئلة كما في الكتاب.',reference:'هذه صفحة مرجعية للمراجعة؛ لا تحتاج إلى إجابة إلزامية.',practice:'نفّذ المطلوب كما يظهر في التمرين الأصلي ثم احفظ إجابتك.'};return state.settings.arabicHelp?`<div class="arabic-help">${m[kind]||m.practice}</div>`:''}
function studyLayoutMode(){return ['split','pinned','stacked'].includes(state.settings?.studyLayout)?state.settings.studyLayout:'split'}
function studyRatioMode(){return ['50-50','55-45','62-38'].includes(state.settings?.studyRatio)?state.settings.studyRatio:'55-45'}
function studySwapSides(){return !!state.settings?.studySwap}
function sourceZoomPct(){const z=Number(state.settings?.sourceZoom)||100;return Math.max(70,Math.min(190,z))}
function isActivityListCollapsed(){return state.settings?.activityListCollapsed!==false}
function sourceCanvas(a){const zoom=sourceZoomPct();return a.regions.map((r,i)=>`<div class="source-card"><div class="source-head"><div><b>Original exercise visual</b> · p. ${r.page}${i?' · part '+(i+1):''}</div><div class="source-actions"><button type="button" class="ghost source-zoom-btn" data-zoom-delta="-15" title="Zoom out">−</button><button type="button" class="ghost source-zoom-reset" title="Reset zoom to 100%">${zoom}%</button><button type="button" class="ghost source-zoom-btn" data-zoom-delta="15" title="Zoom in">+</button><button type="button" class="ghost full-page" data-full-page="${r.page}" title="Open full page">⛶ Full page</button></div></div><div class="source-canvas-scroll"><canvas class="source-canvas" style="width:${zoom}%" data-page="${r.page}" data-y0="${r.y0}" data-y1="${r.y1}"></canvas></div></div>`).join('')}
function renderStudyLayoutToolbar(a,opts={}){const layout=studyLayoutMode(),ratio=studyRatioMode(),swap=studySwapSides(),listCollapsed=isActivityListCollapsed(),hasList=!!opts.hasList,acts=opts.acts||[],idx=opts.idx??-1;return `<div class="study-workspace-bar">${hasList?`<div class="study-nav-cluster"><button type="button" class="${listCollapsed?'ghost':'secondary'} toggle-act-list" id="toggleActListBtn" title="Show or hide exercise sidebar">☰ ${listCollapsed?'Exercises':'Hide list'} (${acts.length})</button><select class="select-input compact-act-select" id="quickActSelect" aria-label="Jump to exercise">${acts.map(x=>`<option value="${x.id}" ${x.id===a.id?'selected':''}>${completed(x.id)?'✓ ':''}${esc(x.label)} · ${esc(x.title)} (p.${x.page})${mistakeOptionSuffix(x)}</option>`).join('')}</select><div class="study-prev-next"><button type="button" class="ghost" id="topPrevAct" ${idx<=0?'disabled':''} title="Previous exercise">←</button><button type="button" class="ghost" id="topNextAct" ${idx<0||idx>=acts.length-1?'disabled':''} title="Next exercise">→</button></div></div>`:`<div class="study-nav-cluster"><span class="muted"><b>Split Study View:</b> Question visual and answer sheet stay visible together</span></div>`}<div class="study-layout-controls" role="group" aria-label="Study layout mode"><span class="muted study-layout-label">Layout:</span><button type="button" class="layout-pill ${layout==='split'?'active':''}" data-study-layout="split" title="Side-by-side: Question and Answers scroll independently side by side">◫ Split</button><button type="button" class="layout-pill ${layout==='pinned'?'active':''}" data-study-layout="pinned" title="Pinned Top: Question stays pinned at top while you scroll answers below">⊟ Pinned top</button><button type="button" class="layout-pill ${layout==='stacked'?'active':''}" data-study-layout="stacked" title="Stacked: Classic vertical page">▭ Stacked</button>${layout==='split'?`<select class="select-input ratio-select" id="studyRatioSelect" title="Column width ratio"><option value="50-50" ${ratio==='50-50'?'selected':''}>50 / 50</option><option value="55-45" ${ratio==='55-45'?'selected':''}>55 / 45</option><option value="62-38" ${ratio==='62-38'?'selected':''}>62 / 38</option></select><button type="button" class="layout-pill ${swap?'active':''}" id="studySwapBtn" title="Swap left and right panes">⇄ Swap</button>`:''}</div></div>`}
function wireStudyWorkspaceControls(host,rerender){$$('[data-study-layout]',host).forEach(btn=>btn.onclick=()=>{state.settings.studyLayout=btn.dataset.studyLayout;save();rerender()});const ratioSel=$('#studyRatioSelect',host);if(ratioSel)ratioSel.onchange=()=>{state.settings.studyRatio=ratioSel.value;save();const split=$('.study-split',host);if(split)split.dataset.ratio=ratioSel.value};const swapBtn=$('#studySwapBtn',host);if(swapBtn)swapBtn.onclick=()=>{state.settings.studySwap=!studySwapSides();save();const split=$('.study-split',host);if(split)split.classList.toggle('swapped',studySwapSides());swapBtn.classList.toggle('active',studySwapSides())};const applyZoom=(newZ)=>{state.settings.sourceZoom=Math.max(70,Math.min(190,newZ));save();const z=sourceZoomPct();$$('.source-canvas',host).forEach(c=>{c.style.width=z+'%'});$$('.source-zoom-reset',host).forEach(b=>{b.textContent=z+'%'})};$$('.source-zoom-btn',host).forEach(btn=>btn.onclick=()=>applyZoom(sourceZoomPct()+(+btn.dataset.zoomDelta||0)));$$('.source-zoom-reset',host).forEach(btn=>btn.onclick=()=>applyZoom(100))}
function audioHtml(a){if(!a.audio?.length)return '';return a.audio.map(r=>`<div class="audio-box"><div><b>🎧 Track ${r.track??''}</b>${r.label?` · ${esc(r.label)}`:''}</div><audio controls preload="none" data-audio-id="${a.id}" src="${esc(r.file)}"></audio><div class="rate-buttons"><button class="ghost rate" data-rate="0.75">0.75×</button><button class="ghost rate" data-rate="0.9">0.9×</button><button class="ghost rate" data-rate="1">1×</button><button class="ghost rate" data-rate="1.25">1.25×</button></div></div>`).join('')}
function renderActivity(a,sectionActs){const host=$('#activityHost');const same=Array.isArray(sectionActs)&&sectionActs.length?sectionActs:D.activities.filter(x=>x.chapter===a.chapter&&x.section===a.section);const idx=same.findIndex(x=>x.id===a.id);const layout=studyLayoutMode(),ratio=studyRatioMode(),swap=studySwapSides();host.innerHTML=`${renderStudyLayoutToolbar(a,{hasList:true,acts:same,idx})}<article class="activity-card study-card layout-${layout}"><div class="activity-card-head"><div><div>${a.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')} <span class="muted">page ${a.page}</span></div><h2>${esc(a.label)} · ${esc(a.title)}</h2></div><button class="${completed(a.id)?'secondary':'primary'}" id="completeBtnTop" type="button">${completed(a.id)?'✓ Completed':'Mark complete'}</button></div><div class="study-split ${swap?'swapped':''}" data-layout="${layout}" data-ratio="${ratio}"><div class="study-source-pane"><div class="study-pane-label"><span>📖 Question & Source Visual (p. ${a.page})</span><small class="muted">Scroll or zoom independently</small></div>${audioHtml(a)}${renderStudySource(a)}</div><div class="study-work-pane"><div class="study-pane-label"><span>✍️ Your Work & Answers</span><small class="muted">${correctionSpec(a)?'Auto-checked':'Saved on device'}</small></div>${arabicHelp(a.kind)}<div class="workbench">${workbench(a)}</div><div class="completion-bar"><div class="button-row"><button class="ghost" id="prevAct" ${idx<=0?'disabled':''}>← Previous</button><button class="ghost" id="nextAct" ${idx<0||idx>=same.length-1?'disabled':''}>Next →</button></div><button class="${completed(a.id)?'secondary':'primary'}" id="completeBtn">${completed(a.id)?'✓ Completed':'Mark complete'}</button></div></div></div></article>`;drawSourceCanvases();wireStudyWorkspaceControls(host,()=>renderActivity(a,same));const toggleList=$('#toggleActListBtn',host);if(toggleList)toggleList.onclick=()=>{state.settings.activityListCollapsed=!isActivityListCollapsed();save();$('.chapter-layout')?.classList.toggle('list-collapsed',isActivityListCollapsed());toggleList.className=`${isActivityListCollapsed()?'ghost':'secondary'} toggle-act-list`;toggleList.textContent=`☰ ${isActivityListCollapsed()?'Exercises':'Hide list'} (${same.length})`};const quickSel=$('#quickActSelect',host);if(quickSel)quickSel.onchange=()=>{current.activity=quickSel.value;state.last.activity=quickSel.value;save();renderChapter()};$$('.full-page',host).forEach(b=>b.onclick=()=>showViewer(+b.dataset.fullPage));$$('.rate',host).forEach(b=>b.onclick=()=>{const audio=b.closest('.audio-box').querySelector('audio');audio.playbackRate=+b.dataset.rate});$$('audio[data-audio-id]',host).forEach(el=>el.onplay=()=>{event('Listening',a.id);markStudyVocabulary(a)});wireWorkbench(a,()=>refreshActivityMistakes(a));const onComplete=()=>{toggleComplete(a.id,!completed(a.id));renderChapter()};$('#completeBtn').onclick=onComplete;$('#completeBtnTop').onclick=onComplete;const goPrev=()=>{if(idx>0){current.activity=same[idx-1].id;state.last.activity=current.activity;save();renderChapter()}};const goNext=()=>{if(idx<same.length-1){current.activity=same[idx+1].id;state.last.activity=current.activity;save();renderChapter()}};$('#prevAct').onclick=goPrev;$('#nextAct').onclick=goNext;if($('#topPrevAct'))$('#topPrevAct').onclick=goPrev;if($('#topNextAct'))$('#topNextAct').onclick=goNext}
function primaryContributionForActivity(a){if(a.kind==='speaking'||a.tags.includes('Speaking')||a.tags.includes('Pronunciation'))return'Speaking';if(a.tags.includes('Writing'))return'Writing';if(a.tags.includes('Grammar'))return'Grammar';if(a.tags.includes('Reading'))return'Reading';if(a.tags.includes('Vocabulary'))return'Vocabulary';if(a.tags.includes('Listening'))return'Listening';return'Practice'}
function studySearchText(value){return ` ${String(value||'').toLocaleLowerCase('de-DE').replace(/ß/g,'ss').replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/[^a-z0-9-]+/g,' ').replace(/\s+/g,' ').trim()} `}
function studyContainsItem(hay,item){const target=studySearchText(bareWord(item)).trim();return target.length>=3&&hay.includes(` ${target} `)}
function relatedWordsForCard(card){const hay=studySearchText(`${card?.term||''} ${card?.context||''}`);return bankWordPool().filter(w=>w.chapter===card.chapter&&!discoveryExcluded(w)&&studyContainsItem(hay,w))}
function markStudyVocabulary(a){const hay=studySearchText(`${a.title||''} ${a.text||''}`),phraseIds=V.filter(v=>v.chapter===a.chapter&&norm(`${a.title||''} ${a.text||''}`).includes(norm(v.term))).slice(0,60).map(v=>v.id),wordIds=bankWordPool().filter(v=>v.chapter===a.chapter&&!discoveryExcluded(v)&&studyContainsItem(hay,v)).slice(0,160).map(v=>v.id);markVocabularySeen(unique([...phraseIds,...wordIds]),'study')}
function workbench(a){const ans=state.answers[a.id]||{},spec=correctionSpec(a),model=modelAnswer(a);if(spec)return renderCorrectionWorkbench(a,ans,spec);if(a.kind==='truefalse'||a.kind==='abc'){const opts=a.kind==='truefalse'?['R','F']:['A','B','C'];return `<div class="answer-grid">${Array.from({length:a.nitems||1},(_,i)=>`<div class="answer-row"><span>${i+1}</span><div class="choice-pills" data-q="${i}">${opts.map(o=>`<button class="wb-choice ${(ans.choices?.[i]===o)?'selected':''}" data-value="${o}">${o}</button>`).join('')}</div></div>`).join('')}</div><button class="secondary save-work">Save answers</button>${model?`<details class="model-check"><summary>Self-check / model guidance</summary><p>${esc(model)}</p></details>`:''}`}
if(['fill','match','choice'].includes(a.kind)){const vals=ans.lines||[];return `<div class="answer-grid" id="lineAnswers">${Array.from({length:Math.max(a.nitems||1,vals.length||0)},(_,i)=>`<div class="answer-row"><span>${i+1}</span><input class="answer-input wb-line" value="${esc(vals[i]||'')}" placeholder="Answer ${i+1}"></div>`).join('')}</div><div class="button-row"><button class="ghost" id="addLine">+ Add answer line</button><button class="secondary save-work">Save answers</button></div>${model?`<details class="model-check"><summary>Self-check / model guidance</summary><p>${esc(model)}</p></details>`:''}`}
const text=ans.text||'';return `${a.kind==='speaking'?`<div class="recording-box"><b>Voice practice</b><p class="muted">Record yourself doing the speaking task. Recording support depends on browser permissions.</p><div class="button-row"><button class="ghost" id="recordBtn">● Start recording</button><button class="ghost hidden" id="stopRecord">■ Stop</button></div><audio id="recordPlayback" controls class="hidden"></audio></div>`:''}<textarea class="free-area" id="freeAnswer" placeholder="Write your answer, notes, transcript, or speaking outline here…">${esc(text)}</textarea><button class="secondary save-work" style="margin-top:9px">Save work</button>${model?`<details class="model-check"><summary>Self-check / model guidance</summary><p>${esc(model)}</p></details>`:''}`}
function wireCorrectionChoices(host){
    $$('.wb-corr-pill',host).forEach(button=>button.addEventListener('click',()=>{
      const group=button.closest('[data-correction-choice]'),input=$('input.wb-line',group);if(!input)return;
      $$('.wb-corr-pill',group).forEach(option=>{const selected=option===button;option.classList.toggle('selected',selected);option.setAttribute('aria-pressed',String(selected))});
      input.value=button.dataset.value||'';input.dispatchEvent(new Event('input',{bubbles:true}));
    }));
}
function wireWorkbench(a,onSaved=()=>{}){
  const host=$('#activityHost')||$('#examHost'),spec=correctionSpec(a);
  if(spec){
    const collect=()=>$$('.wb-line',host).map(input=>input.value);
    const repaint=()=>applyCorrectionFeedback(a,spec,collect());
    const checkField=index=>{
      const values=collect();if(!String(values[index]??'').trim())return;
      storeCorrectionAnswers(a,spec,values,index);repaint();onSaved();
    };
    $$('[data-check-field]',host).forEach(button=>button.onclick=()=>checkField(Number(button.dataset.checkField)));
    const saveLater=$('#saveCorrection',host);
    if(saveLater)saveLater.onclick=()=>{
      const saved=storeCorrectionAnswers(a,spec,collect());repaint();onSaved();
      saveLater.textContent=saved?'Saved ✓':'Save failed';setTimeout(()=>saveLater.textContent='Save for later',900);
    };
    $$('.wb-line',host).forEach((input,i)=>{
      input.addEventListener('input',repaint);
      input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();checkField(i)}});
    });
    wireCorrectionChoices(host);
    repaint();wireRecorder(a);return;
  }
  const saveBtn=$('.save-work',host);if($('#addLine',host))$('#addLine',host).onclick=()=>{const wrap=$('#lineAnswers',host),i=$$('.wb-line',wrap).length;wrap.insertAdjacentHTML('beforeend',`<div class="answer-row"><span>${i+1}</span><input class="answer-input wb-line" placeholder="Answer ${i+1}"></div>`)};$$('.wb-choice',host).forEach(b=>b.onclick=()=>{const row=b.closest('[data-q]');$$('.wb-choice',row).forEach(x=>x.classList.remove('selected'));b.classList.add('selected')});if(saveBtn)saveBtn.onclick=()=>{const rec=state.answers[a.id]||{};if($('#freeAnswer',host))rec.text=$('#freeAnswer',host).value;const lines=$$('.wb-line',host);if(lines.length)rec.lines=lines.map(x=>x.value);const choices=$$('[data-q]',host);if(choices.length)rec.choices=choices.map(r=>$('.selected',r)?.dataset.value||'');rec.savedAt=new Date().toISOString();state.answers[a.id]=rec;event(primaryContributionForActivity(a),a.id);markStudyVocabulary(a);saveBtn.textContent='Saved ✓';setTimeout(()=>saveBtn.textContent=a.kind==='writing'||a.kind==='speaking'?'Save work':'Save answers',900);save()};wireRecorder(a)}
let mediaRecorder=null,recordChunks=[];
function wireRecorder(a){const start=$('#recordBtn'),stop=$('#stopRecord'),play=$('#recordPlayback');if(!start)return;loadRecording(a.id,blob=>{if(blob){play.src=URL.createObjectURL(blob);play.classList.remove('hidden')}});start.onclick=async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});recordChunks=[];mediaRecorder=new MediaRecorder(stream);mediaRecorder.ondataavailable=e=>e.data.size&&recordChunks.push(e.data);mediaRecorder.onstop=()=>{const blob=new Blob(recordChunks,{type:mediaRecorder.mimeType||'audio/webm'});saveRecording(a.id,blob);play.src=URL.createObjectURL(blob);play.classList.remove('hidden');stream.getTracks().forEach(t=>t.stop());event('Speaking',a.id)};mediaRecorder.start();start.classList.add('hidden');stop.classList.remove('hidden')}catch(e){alert('Microphone recording is unavailable in this browser/context. You can still complete the speaking exercise without recording.')}};stop.onclick=()=>{if(mediaRecorder?.state==='recording')mediaRecorder.stop();stop.classList.add('hidden');start.classList.remove('hidden')}}
function recDB(cb){try{if(!('indexedDB'in window))return cb(null);const req=indexedDB.open('spektrum-a1-recordings',1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('audio'))req.result.createObjectStore('audio')};req.onsuccess=()=>cb(req.result);req.onerror=()=>cb(null)}catch(e){cb(null)}}
function saveRecording(id,blob){recDB(db=>{if(!db)return;const tx=db.transaction('audio','readwrite');tx.objectStore('audio').put(blob,id)})}
function loadRecording(id,cb){recDB(db=>{if(!db)return cb(null);const tx=db.transaction('audio','readonly'),r=tx.objectStore('audio').get(id);r.onsuccess=()=>cb(r.result||null);r.onerror=()=>cb(null)})}
function drawSourceCanvases(){$$('.source-canvas').forEach(c=>{const p=+c.dataset.page,y0=+c.dataset.y0,y1=+c.dataset.y1,img=new Image();img.onload=()=>{const H=807.84,sy=Math.max(0,y0/H*img.naturalHeight),sh=Math.max(20,(y1-y0)/H*img.naturalHeight);c.width=img.naturalWidth;c.height=Math.round(sh);const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,sy,img.naturalWidth,sh,0,0,c.width,c.height)};img.src=pageImage(p);c.onclick=()=>showViewer(p)})}
function showViewer(p){const page=D.pages.find(x=>x.page===p)||{page:p,text:''};$('#viewerBody').innerHTML='<div class="viewer-study">'+renderStudySource({...page,id:'page-'+p},true)+'</div>';$('#viewer').classList.add('open');document.body.style.overflow='hidden'}
function closeViewer(){$('#viewer').classList.remove('open');$('#viewerBody').innerHTML='';document.body.style.overflow=''}

function vocabRec(v){const old=state.vocab[v.id]||{};return {status:old.status||'new',interval:Math.max(0,+old.interval||0),repetitions:Math.max(0,+old.repetitions||0),reviews:Math.max(0,+old.reviews||0),due:old.due||today(),last:old.last||null,en:old.en||'',ar:old.ar||''}}
function saveVocabRec(v,r){state.vocab[v.id]={...state.vocab[v.id],...r};save()}
function exposureIds(source){return state.vocabExposure[source]||[]}
function encounteredVocabularyIds(){return unique(Object.values(state.vocabExposure||{}).flat()).filter(id=>!!getVocabularyItem(id))}
function getVocabularyItem(id){return TEST_ITEM_BY_ID.get(id)||manualDiscoveredWords().find(x=>x.id===id)||V.find(x=>x.id===id)||TEST_WORDS.find(x=>x.id===id)||RAW_V.find(x=>x.id===id)||null}
function markVocabularySeen(values,source='review'){const ids=(Array.isArray(values)?values:[values]).map(x=>typeof x==='string'?x:x?.id).filter(id=>!!getVocabularyItem(id));if(!state.vocabExposure[source])state.vocabExposure[source]=[];let changed=false;ids.forEach(id=>{if(!state.vocabExposure[source].includes(id)){state.vocabExposure[source].push(id);changed=true}const v=getVocabularyItem(id);if(v){const r=vocabRec(v);if(r.status==='new')r.status='seen';state.vocab[v.id]={...state.vocab[v.id],...r}}});if(changed)save();return changed}
function wordEvidence(v){return state.learningDB.words[v.id]||{fullRecallCorrect:0,fullRecallWrong:0,missingCorrect:0,missingWrong:0,contextCorrect:0,contextWrong:0,articleCorrect:0,articleWrong:0,fullRecallDates:[],correctDates:[],lastFullRecallResult:null}}
function isDue(v){return (vocabRec(v).due||today())<=today()}
function scheduleWord(v,rating){const r=vocabRec(v);r.last=today();if(rating==='again'){r.status='learning';r.repetitions=0;r.interval=1;r.due=addDays(today(),1)}else if(rating==='hard'){r.status='familiar';r.repetitions=Math.max(1,r.repetitions||0);r.interval=Math.max(2,Math.round((r.interval||1)*1.5));r.due=addDays(today(),r.interval)}else{r.repetitions=(r.repetitions||0)+1;r.interval=r.repetitions===1?3:r.repetitions===2?7:Math.min(120,Math.round((r.interval||7)*2));r.status=r.repetitions>=4?'mastered':r.repetitions>=2?'strong':'familiar';r.due=addDays(today(),r.interval)}r.reviews=(r.reviews||0)+1;saveVocabRec(v,r)}
function learnedStatus(v){const ws=wordEvidence(v),rec=vocabRec(v);if(!ws||ws.lastFullRecallResult!=='correct')return encounteredVocabularyIds().includes(v.id)?'seen':'new';const evidence=(ws.missingCorrect||0)+(ws.contextCorrect||0)+(ws.articleCorrect||0),days=unique(ws.fullRecallDates||ws.correctDates||[]).length;if((ws.fullRecallCorrect||0)>=5&&days>=3&&evidence>=2&&rec.interval>=21)return'mastered';if((ws.fullRecallCorrect||0)>=3&&days>=2&&evidence>=1&&rec.interval>=7)return'strong';return'confirmed'}
function statusLabel(s){return {new:'New',seen:'Seen · not learned',confirmed:'Confirmed',strong:'Strong',mastered:'Mastered',review:'Needs review'}[s]||s}
function vocabStatus(v){const ws=wordEvidence(v);if(ws.lastFullRecallResult==='wrong')return'review';return learnedStatus(v)}
function editMeaning(id){const v=getVocabularyItem(id);if(!v)return;const r=vocabRec(v);const en=prompt('English meaning (optional):',r.en||v.en||'');if(en===null)return;const ar=prompt('Arabic meaning (optional):',r.ar||v.ar||'');if(ar===null)return;r.en=en;r.ar=ar;state.vocab[id]={...state.vocab[id],...r};save();renderVocabulary()}
function renderVocabulary(){
  setTitle('Vocabulary bank','Official, discovered and manually added vocabulary');
  const encountered=new Set(encounteredVocabularyIds());let visibleLimit=600;
  $('#pageHost').innerHTML=`<section class="panel" style="margin-top:0"><div class="panel-head"><div><h2>Vocabulary bank</h2><p class="muted">Browse official vocabulary, words discovered in the book, or words you added manually. Use <b>Source</b> and <b>Test status</b> separately to keep filtering simple. Discovered words never enter Vocabulary Testing until you approve them.</p></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="badge" id="bankCount"></span><button class="primary" id="addMissingWord" type="button">+ Add missing word</button></div></div><div class="word-toolbar"><select class="select-input" id="bankContent"><option value="words">Words</option><option value="phrases">Sentences & phrases</option></select><input class="search-input" id="wordSearch" placeholder="Search German, meaning or context"><select class="select-input" id="wordChapter"><option value="all">All chapters</option>${D.chapters.map(c=>`<option value="${c.id}">Kapitel ${c.id}</option>`).join('')}</select><select class="select-input" id="wordOrigin"><option value="all">Source · All</option><option value="official">Source · Official vocabulary</option><option value="discovered">Source · Discovered in book</option><option value="manual">Source · Manually added</option></select><select class="select-input" id="wordTestStatus"><option value="all">Test status · All</option><option value="test">Test status · In test</option><option value="optional">Test status · Not in test</option><option value="excluded">Test status · Excluded</option></select><select class="select-input" id="wordFilter"><option value="all">All states</option><option value="new">New</option><option value="seen">Seen · not learned</option><option value="confirmed">Confirmed</option><option value="strong">Strong</option><option value="mastered">Mastered</option><option value="review">Needs review</option><option value="unlearned">Seen but not learned</option></select></div><div id="wordGrid" class="grid word-grid"></div><div id="bankMoreWrap" class="button-row" style="justify-content:center;margin-top:12px"></div></section>`;
  $('#bankContent').value=vocabularyBankMode;
  const redraw=(resetLimit=false)=>{
    if(resetLimit)visibleLimit=600;
    const content=$('#bankContent').value;vocabularyBankMode=content;
    const origin=$('#wordOrigin').value,testStatus=$('#wordTestStatus').value,q=norm($('#wordSearch').value),ch=$('#wordChapter').value,f=$('#wordFilter').value;
    $('#wordOrigin').disabled=content==='phrases';$('#wordTestStatus').disabled=content==='phrases';
    let pool=content==='phrases'?PHRASE_TESTS:bankWordPool();
    if(content==='words'){
      const testIds=new Set(wordTestPool().map(v=>v.id));
      pool=pool.filter(v=>{
        const manual=!!v.manualDiscovery,discovered=!!v.discovered&&!manual,excluded=wordTestExcluded(v),inTest=testIds.has(v.id);
        const sourceOk=origin==='all'||(origin==='official'&&!v.discovered&&!manual)||(origin==='discovered'&&discovered)||(origin==='manual'&&manual);
        const statusOk=testStatus==='all'||(testStatus==='test'&&inTest&&!excluded)||(testStatus==='optional'&&!inTest&&!excluded)||(testStatus==='excluded'&&excluded);
        return sourceOk&&statusOk;
      });
    }
    let arr=pool.filter(v=>ch==='all'||String(v.chapter)===ch);
    arr=arr.filter(v=>{const rec=vocabRec(v);return !q||norm(`${v.term} ${v.context||''} ${v.en||''} ${v.ar||''} ${rec.en||''} ${rec.ar||''}`).includes(q)});
    arr=arr.filter(v=>{const st=vocabStatus(v);if(f==='all')return true;if(f==='unlearned')return encountered.has(v.id)&&!['confirmed','strong','mastered'].includes(st);return st===f});
    arr=arr.map((v,i)=>({v,i})).sort((a,b)=>{const ap=Number(a.v.page)||99999,bp=Number(b.v.page)||99999,ao=Number.isFinite(+a.v.bookOrder)?+a.v.bookOrder:999999,bo=Number.isFinite(+b.v.bookOrder)?+b.v.bookOrder:999999;return (+a.v.chapter||999)-(+b.v.chapter||999)||ap-bp||ao-bo||a.i-b.i}).map(x=>x.v);
    const currentTestIds=content==='words'?new Set(wordTestPool().map(v=>v.id)):new Set();
    const unit=content==='words'?'word':'sentence / phrase',total=content==='words'?bankWordPool().length:PHRASE_TESTS.length,shown=arr.slice(0,visibleLimit);
    $('#bankCount').textContent=`${shown.length}${arr.length>shown.length?` / ${arr.length}`:''} shown · ${total} ${content==='words'?'words':'sentences / phrases'}`;
    $('#wordGrid').innerHTML=shown.map(v=>{
      const rec=vocabRec(v),st=vocabStatus(v),en=rec.en||v.en||'',ar=rec.ar||v.ar||'',page=v.page?` · p. ${v.page}`:'',disc=!!v.discovered,excluded=wordTestExcluded(v),included=userTestIncluded(v),optional=wordNeedsTestOptIn(v),inTest=currentTestIds.has(v.id);
      const source=v.manualDiscovery?'Manually added':disc?'Discovered in book':(v.testable===false?'Official · optional test word':excluded?'Official · excluded from test':'Official');
      const meaning=en||ar?`<div class="context"><b>${esc(en)}</b>${en&&ar?' · ':''}${state.settings.arabicHelp&&ar?`<span dir="rtl">${esc(ar)}</span>`:''}</div>`:optional?`<div class="context"><span class="muted">Meaning not added yet — add one before putting this word in the test.</span></div>`:'';
      const discLabel=v.manualDiscovery?'Manually added':'Discovered in book';
      const dictForm=disc&&(v.article||v.lemma&&norm(v.lemma)!==norm(v.term))?`<div class="context"><small class="muted">Dictionary form: ${esc([v.article,v.lemma||v.term].filter(Boolean).join(' '))}</small></div>`:'';const discoveryMeta=disc?`<div class="context"><small class="muted">${discLabel}${v.occurrences?` · ${v.occurrences} occurrence${v.occurrences===1?'':'s'}`:''}${excluded?' · excluded':inTest?' · added to test':' · candidate'}</small></div>`:'';
      const optActions=excluded?`<button class="secondary discovery-action" data-id="${v.id}" data-action="restore">${optional?'Restore candidate':'Restore to test'}</button>`:optional?`<button class="${inTest?'secondary':'primary'} discovery-action" data-id="${v.id}" data-action="${included?'remove':'include'}">${inTest?'Remove from test':'Add to test'}</button>${disc&&!v.manualDiscovery?`<button class="ghost discovery-action" data-id="${v.id}" data-action="exclude">Exclude</button>`:''}`:inTest?`<button class="ghost discovery-action" data-id="${v.id}" data-action="exclude">Exclude from test</button>`:'';
      const manualDelete=v.manualDiscovery?`<button class="ghost delete-manual-word" data-id="${v.id}">Delete</button>`:'';
      return `<article class="word-card"><div style="display:flex;justify-content:space-between;gap:10px"><div><h3>${esc(v.term)}</h3><small class="muted">${unit} · Kapitel ${v.chapter}${page} · ${source}</small></div><span class="status-chip status-${st}">${statusLabel(st)}</span></div>${v.context&&norm(v.context)!==norm(v.term)?`<div class="context">${esc(v.context)}${v.contextMeaning&&!v.en?`<br><small class="muted">Context meaning: ${esc(v.contextMeaning)}</small>`:''}</div>`:''}${meaning}${dictForm}${discoveryMeta}<div class="word-actions"><button class="ghost hear-word" data-id="${v.id}">🔊 Listen</button><button class="ghost edit-meaning" data-id="${v.id}">Meaning</button>${optActions}${manualDelete}</div></article>`;
    }).join('')||'<p class="muted">No matching entries.</p>';
    $('#bankMoreWrap').innerHTML=arr.length>shown.length?`<button class="secondary" id="showMoreWords" type="button">Show ${Math.min(600,arr.length-shown.length)} more</button>`:'';
    if($('#showMoreWords'))$('#showMoreWords').onclick=()=>{visibleLimit+=600;redraw(false)};
    $$('.hear-word').forEach(b=>b.onclick=()=>{const v=getVocabularyItem(b.dataset.id);if(v)speakGerman(v.term)});
    $$('.edit-meaning').forEach(b=>b.onclick=()=>editMeaning(b.dataset.id));
    $$('.discovery-action').forEach(b=>b.onclick=()=>{const v=getVocabularyItem(b.dataset.id);if(v&&setDiscoveryChoice(v,b.dataset.action))redraw(false)});
    $$('.delete-manual-word').forEach(b=>b.onclick=()=>{const v=getVocabularyItem(b.dataset.id);if(v&&deleteManualBookWord(v))redraw(false)});
  };
  $('#addMissingWord').onclick=()=>{if(addManualBookWord())redraw(true)};
  $('#bankContent').onchange=()=>redraw(true);$('#wordSearch').oninput=()=>redraw(true);$('#wordChapter').onchange=()=>redraw(true);$('#wordOrigin').onchange=()=>redraw(true);$('#wordTestStatus').onchange=()=>redraw(true);$('#wordFilter').onchange=()=>redraw(true);redraw(true);
}
let reviewPoolMode='words',reviewSelectedChapter='auto';
function currentReviewPool(){return reviewPoolMode==='phrases'?V:reviewPoolMode==='saved'?savedStudyWords():wordReviewPool()}
function activeReviewChapter(){if(reviewSelectedChapter!=='auto')return +reviewSelectedChapter||1;if(current.page==='chapter'&&current.chapter)return current.chapter;if(state.last?.chapter)return state.last.chapter;return nextIncomplete()?.chapter||1}
function activeReviewSet(ch){const pool=currentReviewPool(),words=pool.filter(v=>v.chapter===ch),maxSet=Math.max(1,...words.map(v=>+v.set||1)),pct=chapterProgress(ch).pct;let set=Math.min(maxSet,Math.floor((pct/100)*maxSet)+1);const seen=new Set(encounteredVocabularyIds());if(!words.some(v=>(+v.set||1)===set&&!seen.has(v.id))){const next=Array.from({length:maxSet},(_,i)=>i+1).find(n=>words.some(v=>(+v.set||1)===n&&!seen.has(v.id)));if(next)set=next}return set}
function buildReviewQueue(){
  if(reviewPoolMode==='saved'){
    const pool=savedStudyWords().filter(v=>reviewSelectedChapter==='auto'||v.chapter===Number(reviewSelectedChapter));
    reviewQueue=[...pool].sort((a,b)=>Number(isDue(b))-Number(isDue(a))||String(vocabRec(a).due).localeCompare(String(vocabRec(b).due))||a.term.localeCompare(b.term,'de'));
    reviewChapter=activeReviewChapter();reviewQueueInfo={ch:reviewChapter,set:activeReviewSet(reviewChapter),due:pool.filter(isDue).length,newCount:0,mode:'saved',chMode:reviewSelectedChapter};
    cardIndex=Math.min(cardIndex,Math.max(0,reviewQueue.length-1));return reviewQueueInfo;
  }
  const pool=currentReviewPool(),ch=activeReviewChapter(),set=activeReviewSet(ch),seen=new Set(encounteredVocabularyIds()),chapterWords=pool.filter(v=>v.chapter===ch),activeWords=chapterWords.filter(v=>(+v.set||1)===set),previouslyStudied=pool.filter(v=>seen.has(v.id)),due=previouslyStudied.filter(isDue),newActive=activeWords.filter(v=>!seen.has(v.id)),target=Math.max(12,due.length+newActive.length),tiers=reviewSelectedChapter!=='auto'?[due.filter(v=>v.chapter===ch),newActive,chapterWords.filter(v=>!seen.has(v.id)),chapterWords]:[due.filter(v=>v.chapter===ch&&(+v.set||1)===set),newActive,due.filter(v=>!(v.chapter===ch&&(+v.set||1)===set)),previouslyStudied.filter(v=>v.chapter===ch&&(+v.set||1)===set&&!due.includes(v)),previouslyStudied.filter(v=>!(v.chapter===ch&&(+v.set||1)===set)&&!due.includes(v))],queue=[],used=new Set();tiers.forEach(tier=>[...tier].sort(()=>Math.random()-.5).forEach(v=>{if(queue.length<target&&!used.has(v.id)){queue.push(v);used.add(v.id)}}));if(!queue.length)chapterWords.forEach(v=>{if(!used.has(v.id)){queue.push(v);used.add(v.id)}});reviewQueue=queue;reviewChapter=ch;reviewQueueInfo={ch,set,due:due.length,newCount:newActive.length,mode:reviewPoolMode,chMode:reviewSelectedChapter};cardIndex=Math.min(cardIndex,Math.max(0,queue.length-1));return reviewQueueInfo}
function speakGerman(text,rate=.9){if(!('speechSynthesis'in window))return;window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(String(text||''));u.lang='de-DE';u.rate=rate;const voices=window.speechSynthesis.getVoices();u.voice=voices.find(v=>/^de([-_]|$)/i.test(v.lang))||null;window.speechSynthesis.speak(u)}
function reviewMeaning(v){const r=vocabRec(v),en=r.en||v.en||'',ar=r.ar||v.ar||'';return en||ar||'Meaning not added yet'}
function reviewArabic(v){const r=vocabRec(v);return r.ar||v.ar||''}
function clearReviewAutoFlip(){if(reviewAutoFlipTimer){clearTimeout(reviewAutoFlipTimer);reviewAutoFlipTimer=null}}
function scheduleReviewAutoFlip(){/* Stage 1: intentionally disabled. Review cards flip only on user action. */}
function renderReview(){clearReviewAutoFlip();setTitle('Word Review & Shadowing','Spaced repetition flashcards & pronunciation lab');const ch=activeReviewChapter(),wantedSet=activeReviewSet(ch),info=(!reviewQueue.length||reviewChapter!==ch||reviewQueueInfo?.set!==wantedSet||reviewQueueInfo?.mode!==reviewPoolMode||reviewQueueInfo?.chMode!==reviewSelectedChapter)?buildReviewQueue():(reviewQueueInfo||{ch,set:1,due:0,newCount:0});if(!reviewQueue.length){$('#pageHost').innerHTML='<section class="panel review-card"><h2>No words in this selection.</h2><p class="muted">Save a word from Study text, or return to all review words.</p><button type="button" class="secondary" id="reviewAllWords">All review words</button></section>';$('#reviewAllWords').onclick=()=>{reviewPoolMode='words';reviewSelectedChapter='auto';reviewQueue=[];renderReview()};return}const item=reviewQueue[cardIndex%reviewQueue.length],v={...item,context:state.vocab[item.id]?.studyContext||item.context},r=vocabRec(v),meaning=reviewMeaning(v),arabic=reviewArabic(v);markVocabularySeen(v,'review');markVocabularySeen(relatedWordsForCard(v),'review-word');$('#pageHost').innerHTML=`<article class="panel flashcard-panel" style="margin-top:0"><div class="panel-head"><div><h2>Word Review & Shadowing</h2><p class="muted">Flip the card, listen, practise pronunciation in the Shadowing Lab, then rate recall.</p></div><span id="cardCounter">${cardIndex+1} / ${reviewQueue.length}</span></div><div class="word-toolbar" style="margin-bottom:10px"><select class="select-input" id="reviewPoolSelect"><option value="words" ${reviewPoolMode==='words'?'selected':''}>Words (${wordReviewPool().length})</option><option value="saved" ${reviewPoolMode==='saved'?'selected':''}>Saved from texts (${savedStudyWords().length})</option><option value="phrases" ${reviewPoolMode==='phrases'?'selected':''}>Phrases & sentences (${V.length})</option></select><select class="select-input" id="reviewChapterSelect"><option value="auto" ${reviewSelectedChapter==='auto'?'selected':''}>${reviewPoolMode==='saved'?'All chapters':`Aligned chapter (Kapitel ${ch})`}</option>${D.chapters.map(c=>`<option value="${c.id}" ${String(reviewSelectedChapter)===String(c.id)?'selected':''}>Kapitel ${c.id} · ${esc(c.title)}</option>`).join('')}</select><button class="secondary" id="goToWordTestBtn" type="button">Go to Vocabulary Testing →</button></div><div class="review-summary"><span>${info.due} due</span>${reviewPoolMode==='saved'?`<span>${reviewQueue.length} saved words</span>`:`<span>${info.newCount} new in active set</span><span>Kapitel ${info.ch} · set ${info.set}</span>`}<span>Next review: ${esc(r.due)}</span></div><div class="flashcard" id="flashcard" tabindex="0"><div class="card-face front"><span class="card-label">GERMAN</span><h2>${esc(v.term)} <button class="link-button" id="speakCard" aria-label="Listen">🔊</button></h2><p>${esc(v.hint||`Kapitel ${v.chapter}`)}</p><small>Click or press Space to flip</small></div><div class="card-face back"><span class="card-label">MEANING (ENGLISH)</span><h2>${esc(meaning)}</h2>${state.settings.arabicHelp&&arabic?`<p class="card-arabic" dir="rtl">${esc(arabic)}</p>`:''}<p>${esc(v.context||v.hint||'')}</p><small>Memory tip: ${esc(v.tip||'Say it aloud once before rating.')} · Status: ${esc(r.status)} · Next review: ${esc(r.due)}</small></div></div><div class="rating-row"><button class="danger-soft" data-rating="again">Again (1d)</button><button class="warning-soft" data-rating="hard">Hard</button><button class="success-soft" data-rating="good">Good</button></div><div class="shadowing-lab"><div class="shadowing-head"><div><b>Vocabulary audio & shadowing</b><small>Practise the German item aloud and compare your recording.</small></div><span class="sequence-status">Ready</span></div><div class="shadowing-target" id="reviewShadowTarget">${esc(v.term)}</div><div class="shadowing-actions"><select id="reviewShadowMode"><option value="word">Practise item</option>${v.context?'<option value="example">Practise example</option>':''}</select><button class="primary" id="reviewPlay">🔊 Play</button><button class="secondary" id="reviewSlow">🐢 Slow</button><button class="record-button" id="reviewRecord">🎙️ Record</button><button class="secondary hidden" id="reviewStop">■ Stop</button><audio id="reviewPlayback" controls class="hidden"></audio></div></div></article>`;$('#reviewPoolSelect').onchange=e=>{reviewPoolMode=e.target.value;cardIndex=0;buildReviewQueue();renderReview()};$('#reviewChapterSelect').onchange=e=>{reviewSelectedChapter=e.target.value;cardIndex=0;buildReviewQueue();renderReview()};$('#goToWordTestBtn').onclick=()=>showPage('wordtest');$('#flashcard').onclick=e=>{if(e.target.closest('button'))return;clearReviewAutoFlip();$('#flashcard').classList.toggle('flipped')};$('#flashcard').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();clearReviewAutoFlip();$('#flashcard').classList.toggle('flipped')}};$('#speakCard').onclick=e=>{e.stopPropagation();speakGerman(v.term)};const target=()=>$('#reviewShadowMode').value==='example'?(v.context||v.term):v.term;const syncTarget=()=>$('#reviewShadowTarget').textContent=target();$('#reviewShadowMode').onchange=syncTarget;$('#reviewPlay').onclick=()=>speakGerman(target(),.9);$('#reviewSlow').onclick=()=>speakGerman(target(),.68);wireReviewRecorder(v,target);$$('[data-rating]').forEach(b=>b.onclick=()=>rateCard(v,b.dataset.rating))}
function rateCard(v,rating){clearReviewAutoFlip();scheduleWord(v,rating);event('Vocabulary',v.id);cardIndex=(cardIndex+1)%Math.max(1,reviewQueue.length);renderReview()}
function wireReviewRecorder(v,target){const start=$('#reviewRecord'),stop=$('#reviewStop'),play=$('#reviewPlayback');if(!start)return;loadRecording(`review-${v.id}`,blob=>{if(blob){play.src=URL.createObjectURL(blob);play.classList.remove('hidden')}});start.onclick=async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});recordChunks=[];mediaRecorder=new MediaRecorder(stream);mediaRecorder.ondataavailable=e=>e.data.size&&recordChunks.push(e.data);mediaRecorder.onstop=()=>{const blob=new Blob(recordChunks,{type:mediaRecorder.mimeType||'audio/webm'});saveRecording(`review-${v.id}`,blob);play.src=URL.createObjectURL(blob);play.classList.remove('hidden');stream.getTracks().forEach(t=>t.stop());event('Vocabulary',v.id)};mediaRecorder.start();start.classList.add('hidden');stop.classList.remove('hidden')}catch(e){alert('Microphone recording is unavailable in this browser/context.')}};stop.onclick=()=>{if(mediaRecorder?.state==='recording')mediaRecorder.stop();stop.classList.add('hidden');start.classList.remove('hidden')}}

function nounArticle(v){const m=String(v.term).trim().match(/^(der|die|das)\s+/i);return m?m[1].toLowerCase():''}
function bareWord(v){return String(v.term).trim().replace(/^(der|die|das)\s+/i,'').replace(/[.!?]+$/,'').trim()}
function lexicalTokens(s){return String(s||'').match(/[A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)*/g)||[]}
function looksLikeVocabularyListCard(v){
  const t=String(v?.term||'').trim();
  if(!t)return true;
  if(t.includes('·')&&t.split('·').length>=3&&!/[!?]/.test(t))return true;
  const slashParts=t.split('/').map(x=>x.trim().replace(/[.!?]+$/,'')).filter(Boolean);
  if(slashParts.length>=2&&lexicalTokens(t).length<=6&&!/[?]/.test(t)&&slashParts.every(p=>lexicalTokens(p.replace(/^(der|die|das)\s+/i,'')).length<=2))return true;
  if(t.includes(':')&&!/[!?]/.test(t)){const after=t.split(':').slice(1).join(':');if(after.includes(',')||after.includes('·'))return true}
  if(t.includes(',')&&!/[!?]/.test(t)){
    const segs=t.split(',').map(x=>x.trim()).filter(Boolean);
    if(segs.length>=2&&segs.every(seg=>lexicalTokens(seg.replace(/^[^:]{1,40}:\s*/,'').replace(/^(der|die|das)\s+/i,'')).length<=3))return true;
  }
  return false;
}
function isPhraseTestCard(v){const t=String(v?.term||'').trim();if(!t||looksLikeVocabularyListCard(v))return false;return lexicalTokens(t.replace(/^(der|die|das)\s+/i,'')).length>=2}
function splitSentenceAlternatives(term){
  let t=String(term||'').trim().replace(/\b(?:A|CH)\s*:\s*/gi,' · ');
  const direct=t.split(/\s*(?:·|;|(?<=[.!?])\s*\/\s*(?=[A-ZÄÖÜ]))\s*/).map(x=>x.trim()).filter(Boolean);
  const out=[];
  for(const part of direct){
    const m=part.match(/^(.*?)([A-Za-zÄÖÜäöüß]+)\s+(du|ihr|wir|er|sie|es)\s*\/\s*([A-Za-zÄÖÜäöüß]+)\s+(Sie)(.*)$/);
    if(m){out.push(`${m[1]}${m[2]} ${m[3]}${m[6]}`.trim(),`${m[1]}${m[4]} ${m[5]}${m[6]}`.trim());continue}
    out.push(part);
  }
  return unique(out);
}
function splitTermAlternatives(v){
  const t=String(v?.term||'').trim();
  if(v?.testKind==='word')return [t];
  return splitSentenceAlternatives(t);
}
function withoutOptionalExample(s){return String(s||'').replace(/\s*\([^)]*\)\s*[.!?]?\s*$/,'').trim()}
function cleanRecallForm(s){
  let x=String(s||'').trim();
  x=x.replace(/\s+\((?:alternativ|alternative)[^)]*\)\s*.*$/i,'').trim();
  x=withoutOptionalExample(x);
  x=x.replace(/^(der|die|das)\s+/i,'').trim();
  return x;
}
function primaryTestTerm(v){const parts=splitTermAlternatives(v);let term=(parts[0]||String(v?.term||'')).trim();term=term.replace(/\s+(?:A|CH)(?:\s*\([^)]*\))?\s*:\s*.*$/i,'').trim();term=term.replace(/\s+\((?:alternativ|alternative)[^)]*\)\s*.*$/i,'').trim();return term||String(v?.term||'').trim()}
function fullRecallDisplay(v){return cleanRecallForm(primaryTestTerm(v))||bareWord(v)}
function spellingTarget(v){return v?.testKind==='word'?bareWord(v):cleanRecallForm(primaryTestTerm(v))}
function strictSpellingNorm(s){return String(s??'').toLocaleLowerCase('de-DE').normalize('NFC').replace(/[.!?,;:„“”"'’]+/g,' ').replace(/\s+/g,' ').trim()}
function flexibleRecallNorm(s){return strictSpellingNorm(s).replace(/ß/g,'ss').replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue')}
function normTestAnswer(s){return flexibleRecallNorm(s)}
function testMeaningText(v){
  let text=String(reviewMeaning(v)||'').trim();
  if(!text||text==='Meaning not added yet')return text;
  text=text.replace(/\s*\([^)]*\)/g,'').replace(/\s*\[[^\]]*\]/g,'').replace(/\s{2,}/g,' ').trim();
  text=text.replace(/^lit\.?\s*:\s*[^.!?]+[.!?]\s*/i,'').replace(/\s+lit\.?\s*:\s*[^.!?]+[.!?]?\s*$/i,'').trim();
  text=text.replace(/\s+([,.;!?])/g,'$1').trim();
  return text;
}
function conciseTestMeaning(v){return testMeaningText(v)}
function semanticMeaningKey(v){
  let x=flexibleRecallNorm(testMeaningText(v));
  if(/(?:what'?s your name|what is your name|what are you called)/.test(x))return'concept:name-question';
  if(/(?:my name is|i am called)/.test(x))return'concept:name-answer';
  if(/where do you live/.test(x))return'concept:live-question';
  if(/where do you come from/.test(x))return'concept:origin-question';
  if(/which languages do you speak/.test(x))return'concept:languages-question';
  return x.replace(/\b(?:the|a|an)\b/g,' ').replace(/\s+/g,' ').trim();
}
function answerVariantsRaw(v){
  const vals=[],pool=v?.testKind==='word'?wordTestPool():PHRASE_TESTS,meaningKey=semanticMeaningKey(v),sources=[v];
  if(v?.aliases)vals.push(...v.aliases);
  if(meaningKey&&v?.testKind!=='word'){
    for(const sibling of pool){
      if(sibling.id!==v.id&&semanticMeaningKey(sibling)===meaningKey)sources.push(sibling);
    }
  }
  for(const source of sources){
    for(const raw of splitTermAlternatives(source)){
      const noExample=withoutOptionalExample(raw),forms=[raw,noExample,cleanRecallForm(raw)];
      if(source?.testKind==='word')forms.push(bareWord(source));
      for(const f of forms)if(f)vals.push(f);
    }
  }
  vals.push(primaryTestTerm(v),fullRecallDisplay(v),spellingTarget(v));
  return unique(vals.filter(Boolean));
}
function answerVariants(v){return unique(answerVariantsRaw(v).map(flexibleRecallNorm).filter(Boolean))}
function missingPattern(v){const w=spellingTarget(v);let out='',n=0;for(const ch of w){if(/[A-Za-zÄÖÜäöüß]/.test(ch)){n++;out+=n%2===0?'_':ch}else out+=ch}return out}
function missingInlineHTML(v){const w=spellingTarget(v);let n=0,blank=0;return [...w].map(ch=>{if(!/[A-Za-zÄÖÜäöüß]/.test(ch))return ch===' '?'<span class="missing-word-space">&nbsp;</span>':`<span class="missing-word-fixed punctuation">${esc(ch)}</span>`;n++;if(n%2!==0)return `<span class="missing-word-fixed">${esc(ch)}</span>`;return `<input class="missing-letter-input" data-blank="${blank++}" maxlength="1" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Missing letter ${blank}">`}).join('')}
function missingAnswerFromInputs(v){const values=$$('.missing-letter-input').map(input=>input.value||'');let n=0,blank=0,out='';for(const ch of spellingTarget(v)){if(/[A-Za-zÄÖÜäöüß]/.test(ch)){n++;out+=n%2===0?(values[blank++]||''):ch}else out+=ch}return out}
function missingInputsReady(){const inputs=$$('.missing-letter-input');return !!inputs.length&&inputs.every(input=>String(input.value||'').trim().length===1)}
function wordTestTypedAnswer(v,mode){return mode==='missing'?missingAnswerFromInputs(v):($('#wordTestInput')?.value||'').trim()}
function wordTestAnswerReady(mode){return mode==='missing'?missingInputsReady():!!String($('#wordTestInput')?.value||'').trim()}
function disableWordTestInputs(){const normal=$('#wordTestInput');if(normal)normal.disabled=true;$$('.missing-letter-input').forEach(input=>input.disabled=true)}
function initMissingLetterInputs(){const inputs=$$('.missing-letter-input');if(!inputs.length)return;inputs.forEach((input,index)=>{input.addEventListener('input',()=>{const chars=[...(input.value||'')].filter(ch=>/[A-Za-zÄÖÜäöüß]/.test(ch));input.value=chars.slice(-1).join('');if(input.value&&index<inputs.length-1)inputs[index+1].focus()});input.addEventListener('keydown',event=>{if(event.key==='Backspace'&&!input.value&&index>0){event.preventDefault();inputs[index-1].value='';inputs[index-1].focus();return}if(event.key==='ArrowLeft'&&index>0){event.preventDefault();inputs[index-1].focus();return}if(event.key==='ArrowRight'&&index<inputs.length-1){event.preventDefault();inputs[index+1].focus();return}if(event.key==='Enter'){event.preventDefault();submitWordTest(false)}});input.addEventListener('paste',event=>{const letters=[...(event.clipboardData?.getData('text')||'')].filter(ch=>/[A-Za-zÄÖÜäöüß]/.test(ch));if(letters.length<2)return;event.preventDefault();let at=index;for(const ch of letters){if(at>=inputs.length)break;inputs[at++].value=ch}inputs[Math.min(at,inputs.length-1)].focus()})});inputs[0].focus()}
function injectMissingLetterStyles(){if($('#spektrumMissingLetterStyles'))return;const style=document.createElement('style');style.id='spektrumMissingLetterStyles';style.textContent=`.missing-word-wrap{display:flex;justify-content:center;align-items:flex-end;flex-wrap:wrap;gap:2px;margin:10px auto 14px;font-size:clamp(1.55rem,4vw,2.35rem);font-weight:800;line-height:1.35;letter-spacing:.02em}.missing-word-fixed{display:inline-flex;align-items:flex-end;min-height:1.55em}.missing-word-fixed.punctuation{margin:0 1px}.missing-word-space{width:.42em}.missing-letter-input{font:inherit;font-weight:800;color:inherit;text-align:center;width:.82em;min-width:.82em;height:1.45em;padding:0 .04em;border:0;border-bottom:3px solid var(--accent);border-radius:0;background:transparent;outline:none;caret-color:var(--accent)}.missing-letter-input:focus{border-bottom-width:4px;filter:brightness(1.08)}.missing-letter-input:disabled{opacity:1;color:inherit;-webkit-text-fill-color:currentColor}.missing-word-meaning{text-align:center;margin-top:0}`;document.head.appendChild(style)}
const CONTEXT_STOPWORDS=new Set('ich du er sie es wir ihr ihnen mein meine meiner meinen deinem dein deine seiner sein seine ihre der die das den dem des ein eine einen einem einer und oder aber denn sondern in im ins an am auf aus zu zum zur von mit für bei nach über unter vor hinter neben zwischen durch gegen ohne um als wie wo wer was wann warum ist sind bin bist seid war waren hat haben hatte hatten kann können muss müssen soll sollen will wollen möchte möchten gern gerne sehr nicht kein keine schon noch auch jetzt hier dort dann heute morgen gestern'.split(' '));
function contextGapData(v){
  if(v?.testKind==='word')return null;
  const phrase=primaryTestTerm(v).trim();
  if(!phrase||phrase.includes('·')||phrase.split(';').length>2||looksLikeVocabularyListCard(v))return null;
  const tokens=[...phrase.matchAll(/[A-Za-zÄÖÜäöüß]+/g)];
  if(tokens.length<2)return null;
  const parens=[...phrase.matchAll(/\([^)]*\)/g)].map(m=>[m.index,m.index+m[0].length]);
  const candidates=tokens.filter(m=>{const w=m[0].toLowerCase();return m[0].length>=3&&!CONTEXT_STOPWORDS.has(w)&&!parens.some(([a,b])=>m.index>=a&&m.index<b)});
  if(!candidates.length)return null;
  let chosen=[...candidates].sort((a,b)=>b[0].length-a[0].length||b.index-a.index)[0];
  if(!chosen)return null;
  return{prompt:`${phrase.slice(0,chosen.index)}_____${phrase.slice(chosen.index+chosen[0].length)}`,answer:chosen[0],full:phrase};
}
function contextPrompt(v){return contextGapData(v)?.prompt||''}
function fullRecallCorrect(v,answer){
  const a=flexibleRecallNorm(answer);if(!a)return false;
  const variants=answerVariants(v);if(variants.includes(a))return true;
  const typedParts=String(answer||'').split(/\s*(?:\/|;|\s+oder\s+)\s*/i).map(flexibleRecallNorm).filter(Boolean);
  if(typedParts.length>1&&typedParts.every(x=>variants.includes(x)))return true;
  for(const raw of splitTermAlternatives(v)){
    const base=withoutOptionalExample(cleanRecallForm(raw));if(!base)continue;
    const rawHasExample=/\([^)]*\)\s*[.!?]?\s*$/.test(raw),bn=flexibleRecallNorm(base);
    if(rawHasExample&&bn&&(a===bn||a.startsWith(bn+' ')))return true;
  }
  return false;
}
function fullRecallSpellingExact(v,answer){const a=strictSpellingNorm(answer);return answerVariantsRaw(v).some(x=>strictSpellingNorm(x)===a)}
function recordWordEvidence(v,mode,correct){const ws=wordEvidence(v),k=mode==='full'?'fullRecall':mode;ws[`${k}Correct`]=(ws[`${k}Correct`]||0)+(correct?1:0);ws[`${k}Wrong`]=(ws[`${k}Wrong`]||0)+(correct?0:1);ws.correctDates=ws.correctDates||[];ws.fullRecallDates=ws.fullRecallDates||[];if(correct){ws.correctDates=unique([...ws.correctDates,today()]);if(mode==='full'){ws.fullRecallDates=unique([...ws.fullRecallDates,today()]);ws.lastFullRecallResult='correct';ws.fullRecallAt=Date.now();scheduleWord(v,'good')}}else if(mode==='full'){ws.lastFullRecallResult='wrong';ws.fullRecallAt=Date.now();scheduleWord(v,'again')}else{const r=vocabRec(v);r.due=today();if(r.status==='mastered')r.status='strong';saveVocabRec(v,r)}state.learningDB.words[v.id]=ws;save()}
function testPoolFor(contentType){return contentType==='phrases'?PHRASE_TESTS:wordTestPool()}
function wordTestEligible(mode,source,contentType='words'){
  const encountered=new Set(encounteredVocabularyIds());let arr=testPoolFor(contentType).filter(v=>{
    const st=vocabStatus(v);
    if(source==='seen')return encountered.has(v.id);
    if(source==='unlearned')return encountered.has(v.id)&&!['confirmed','strong','mastered'].includes(st);
    if(source==='learned')return['confirmed','strong','mastered'].includes(st);
    return true;
  });
  if(mode==='article')arr=arr.filter(v=>contentType==='words'&&nounArticle(v));
  if(mode==='context')arr=arr.filter(v=>contentType==='phrases'&&contextPrompt(v));
  if(mode==='missing')arr=arr.filter(v=>{const t=spellingTarget(v);return reviewMeaning(v)!=='Meaning not added yet'&&/[A-Za-zÄÖÜäöüß]{2}/.test(t)&&t.length<=64});
  if(mode==='full'||mode==='mixed')arr=arr.filter(v=>reviewMeaning(v)!=='Meaning not added yet');
  return arr;
}
function renderWordTest(){
  setTitle('Vocabulary testing','DeutschPath-style active recall');wordTestSession=null;
  $('#pageHost').innerHTML=`<article class="panel flashcard-panel" style="margin-top:0"><div class="panel-head"><div><h2>Vocabulary testing</h2><p class="muted" id="wordTestHelp">Only <b>Full recall</b> can confirm an item as learned. <b>Words</b> and <b>phrases/sentences</b> are separate pools. Articles are tested only in <b>Article test</b>. Full recall accepts capitalization/punctuation differences and ss/ae/oe/ue keyboard spellings; spelling modes remain strict.</p></div><span id="wordTestProgress">Ready</span></div><div id="wordTestIntro"><label class="field-label">Content</label><select id="wordTestContent" class="wide-select"><option value="words">Words only</option><option value="phrases">Phrases & sentences</option></select><label class="field-label">Test mode</label><select id="wordTestMode" class="wide-select"><option value="full">Full recall: meaning → German</option><option value="mixed">Mixed practice</option><option value="missing">Missing letters</option><option value="context">Sentence gap</option><option value="article">Article test: der / die / das</option></select><div class="mode-grid"><div class="mode-option"><b>Full recall</b>Meaning → German. Flexible on punctuation, capitalization and common keyboard spellings.</div><div class="mode-option"><b>Missing letters</b>Fill the missing letters directly inside the word. Strict spelling: ä, ö, ü and ß matter.</div><div class="mode-option"><b>Sentence gap</b>For phrases/sentences only.</div><div class="mode-option"><b>Article only</b>der / die / das. The article is never required in normal word Full recall.</div><div class="mode-option"><b>Mixed</b>Rotates compatible modes. Article practice stays separate.</div></div><label class="field-label">Items included in the test</label><select id="wordTestSource" class="wide-select"><option value="seen">Seen during study — recommended</option><option value="unlearned">Seen but not learned only</option><option value="learned">Currently learned only</option><option value="all">All course items</option></select><div class="source-details" id="wordTestStats"></div><p id="wordTestWarning" class="muted"></p><button class="primary" id="startWordTest">Start test</button></div><div id="wordTestQuestion" class="hidden"></div><div id="wordTestResult" class="hidden"></div></article>`;
  const update=()=>{
    let mode=$('#wordTestMode').value,source=$('#wordTestSource').value,content=$('#wordTestContent').value;
    if(mode==='article'&&content!=='words'){$('#wordTestContent').value='words';content='words'}
    if(mode==='context'&&content==='words'){$('#wordTestContent').value='phrases';content='phrases'}
    const pool=testPoolFor(content),encountered=new Set(encounteredVocabularyIds()),learned=pool.filter(v=>['confirmed','strong','mastered'].includes(vocabStatus(v))).length,seen=pool.filter(v=>encountered.has(v.id)).length,unlearned=pool.filter(v=>encountered.has(v.id)&&!['confirmed','strong','mastered'].includes(vocabStatus(v))).length,n=wordTestEligible(mode,source,content).length;
    $('#wordTestStats').innerHTML=`<span class="source-chip"><strong>${seen}</strong> seen</span><span class="source-chip"><strong>${unlearned}</strong> seen, not learned</span><span class="source-chip"><strong>${learned}</strong> learned</span><span class="source-chip"><strong>${pool.length}</strong> total ${content==='words'?'words':'phrases'}</span>`;
    $('#wordTestWarning').textContent=n?`${n} eligible ${content==='words'?'word':content==='phrases'?'phrase/sentence':'item'}${n===1?'':'s'} for this setup.`:'No eligible items for this setup yet. Choose another content/source/mode.';
    $('#startWordTest').disabled=!n;
  };
  $('#wordTestMode').onchange=update;$('#wordTestSource').onchange=update;$('#wordTestContent').onchange=update;$('#startWordTest').onclick=startWordTest;update();
}
function shuffledWordPool(arr){return [...arr].sort(()=>Math.random()-.5)}
function startWordTest(){const requested=$('#wordTestMode').value,source=$('#wordTestSource').value,contentType=$('#wordTestContent').value,pool=wordTestEligible(requested,source,contentType);if(!pool.length)return;wordTestSession={requested,source,contentType,pool:[...pool],queue:shuffledWordPool(pool),index:0,score:0,attempts:0,answered:false};$('#wordTestIntro').classList.add('hidden');$('#wordTestHelp')?.classList.add('hidden');$('#wordTestQuestion').classList.remove('hidden');renderWordTestQuestion()}
function testModeFor(v){const req=wordTestSession.requested;if(req!=='mixed')return req;const modes=['full','missing'];if(wordTestSession.contentType==='phrases'&&contextPrompt(v))modes.push('context');return modes[wordTestSession.index%modes.length]}
function renderWordTestQuestion(){
  if(!wordTestSession)return;if(wordTestSession.index>=wordTestSession.queue.length&&!appendWordTestCycle()){finishWordTest();return}
  const v=wordTestSession.queue[wordTestSession.index],mode=testModeFor(v),meaning=conciseTestMeaning(v),ctx=mode==='context'?contextGapData(v):null,prompt=mode==='full'?meaning:mode==='context'?(ctx?.prompt||primaryTestTerm(v)):`Article: ${bareWord(v)}`;
  wordTestSession.mode=mode;wordTestSession.contextAnswer=ctx?.answer||'';wordTestSession.answered=false;$('#wordTestProgress').textContent=`Question ${wordTestSession.attempts+1} · continuous`;
  injectMissingLetterStyles();
  const answerArea=mode==='missing'?`<div class="missing-word-wrap" id="missingWordInline">${missingInlineHTML(v)}</div><p class="muted missing-word-meaning">${esc(meaning)}</p>`:`<h2>${esc(prompt)}</h2>${mode==='context'?`<p class="muted" style="text-align:center;margin-top:-4px">${esc(meaning)}</p>`:''}<input class="answer-input test-input" id="wordTestInput" autocomplete="off" placeholder="Type your answer…">`;
  $('#wordTestQuestion').innerHTML=`<div class="test-question"><div class="word-test-session-actions"><button class="secondary" id="wordTestChangeMode">Change mode</button><button class="danger-soft" id="wordTestEnd">End test</button></div>${answerArea}<div class="button-row" style="justify-content:center;margin-top:14px"><button class="ghost" id="wordTestSkip">I don’t know</button><button class="primary" id="wordTestCheck">Check</button></div><div id="wordTestFeedback"></div></div>`;
  markVocabularySeen(v,'test');$('#wordTestChangeMode').onclick=changeWordTestMode;$('#wordTestEnd').onclick=endWordTest;$('#wordTestCheck').onclick=()=>submitWordTest(false);$('#wordTestSkip').onclick=()=>submitWordTest(true);if(mode==='missing')initMissingLetterInputs();else{$('#wordTestInput')?.focus();if($('#wordTestInput'))$('#wordTestInput').onkeydown=e=>{if(e.key==='Enter')submitWordTest(false)}}
}
function testAnswerCorrect(v,mode,answer){if(mode==='article')return strictSpellingNorm(answer)===strictSpellingNorm(nounArticle(v));if(mode==='context')return strictSpellingNorm(answer)===strictSpellingNorm(wordTestSession?.contextAnswer||'');if(mode==='missing')return strictSpellingNorm(answer)===strictSpellingNorm(spellingTarget(v));return fullRecallCorrect(v,answer)}
function clearWordAdvanceTimer(){if(wordAdvanceTimer){clearTimeout(wordAdvanceTimer);wordAdvanceTimer=null}if(wordCountdownTimer){clearInterval(wordCountdownTimer);wordCountdownTimer=null}}
function appendWordTestCycle(){if(!wordTestSession)return false;const livePool=wordTestSession.source==='unlearned'?wordTestEligible(wordTestSession.requested,'unlearned',wordTestSession.contentType):wordTestSession.pool;if(!livePool?.length)return false;wordTestSession.pool=[...livePool];let cycle=shuffledWordPool(livePool),previous=wordTestSession.queue[wordTestSession.queue.length-1];if(cycle.length>1&&previous&&cycle[0].id===previous.id){const swap=cycle.findIndex(v=>v.id!==previous.id);if(swap>0)[cycle[0],cycle[swap]]=[cycle[swap],cycle[0]]}wordTestSession.queue.push(...cycle);return true}
function advanceWordTest(){if(!wordTestSession)return;clearWordAdvanceTimer();wordTestSession.index++;if(wordTestSession.index>=wordTestSession.queue.length&&!appendWordTestCycle()){finishWordTest();return}renderWordTestQuestion()}
function scheduleWordAdvance(delayMs){clearWordAdvanceTimer();const countdown=$('#wordAnswerCountdown'),started=Date.now();const update=()=>{const remaining=Math.max(0,Math.ceil((delayMs-(Date.now()-started))/1000));if(countdown)countdown.textContent=`Next item automatically in ${remaining}s`};update();wordCountdownTimer=setInterval(update,250);wordAdvanceTimer=setTimeout(advanceWordTest,delayMs)}
function returnToWordTestSetup(mode,source,contentType){clearWordAdvanceTimer();const keepMode=mode||wordTestSession?.requested||'full',keepSource=source||wordTestSession?.source||'seen',keepContent=contentType||wordTestSession?.contentType||'words';renderWordTest();if($('#wordTestMode'))$('#wordTestMode').value=keepMode;if($('#wordTestSource'))$('#wordTestSource').value=keepSource;if($('#wordTestContent'))$('#wordTestContent').value=keepContent;$('#wordTestMode')?.dispatchEvent(new Event('change'));setTimeout(()=>$('#wordTestMode')?.focus(),0)}
function changeWordTestMode(){clearWordAdvanceTimer();if(!wordTestSession){returnToWordTestSetup();return}const {requested:mode,source,contentType}=wordTestSession;returnToWordTestSetup(mode,source,contentType)}
function endWordTest(){clearWordAdvanceTimer();if(!wordTestSession){returnToWordTestSetup();return}finishWordTest(true)}
function submitWordTest(skip){
  if(!wordTestSession||wordTestSession.answered)return;const v=wordTestSession.queue[wordTestSession.index],mode=wordTestSession.mode,answer=skip?'':wordTestTypedAnswer(v,mode);if(!skip&&!wordTestAnswerReady(mode)){if(mode==='missing')$$('.missing-letter-input').find(input=>!String(input.value||'').trim())?.focus();return}
  const correct=!skip&&testAnswerCorrect(v,mode,answer);wordTestSession.answered=true;wordTestSession.attempts++;if(correct)wordTestSession.score++;recordWordEvidence(v,mode,correct);event('Word Test',v.id);
  const expected=mode==='article'?nounArticle(v):mode==='missing'?spellingTarget(v):mode==='context'?(wordTestSession.contextAnswer||spellingTarget(v)):fullRecallDisplay(v),exact=mode==='full'&&correct?fullRecallSpellingExact(v,answer):true,fb=$('#wordTestFeedback');
  fb.className=`feedback ${correct?'good':'bad'}`;
  fb.innerHTML=correct?`<div class="answer-study-card"><b>Correct ✓</b><span>${esc(answer)}</span>${!exact?`<small>Preferred spelling: <b>${esc(expected)}</b></small>`:''}</div>`:skip?`<div class="answer-study-card"><b>Study this ${wordTestSession.contentType==='words'?'word':'item'}</b><span>Answer:</span><b>${esc(expected)}</b></div>`:`<div class="answer-study-card"><b>Not quite ✕</b><span>Answer:</span><b>${esc(expected)}</b></div>`;
  disableWordTestInputs();$('#wordTestCheck').disabled=true;$('#wordTestSkip').disabled=true;
  fb.insertAdjacentHTML('beforeend','<div class="button-row" style="justify-content:center;margin-top:12px"><button class="secondary" id="hearWordAnswer">🔊 Listen</button><button class="primary" id="nextWordNow">Next</button><span class="muted" id="wordAnswerCountdown"></span></div>');
  $('#hearWordAnswer').onclick=()=>speakGerman(expected);$('#nextWordNow').onclick=advanceWordTest;const normalInput=$('#wordTestInput');if(normalInput)normalInput.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();advanceWordTest()}};$$('.missing-letter-input').forEach(input=>input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();advanceWordTest()}});
  scheduleWordAdvance(skip?9000:correct?1800:5000);
}
function finishWordTest(manual=false){if(!wordTestSession)return;clearWordAdvanceTimer();$('#wordTestQuestion').classList.add('hidden');$('#wordTestResult').classList.remove('hidden');const attempts=wordTestSession.attempts,summary=!attempts?'No answers submitted in this session.':wordTestSession.score>=Math.ceil(attempts*.8)?'Strong session.':'Missed items stay available for review.';$('#wordTestResult').innerHTML=`<div class="test-result"><strong>${wordTestSession.score} / ${attempts}</strong><p>${summary}</p><div class="button-row" style="justify-content:center"><button class="secondary" id="changeTestMode">Change test mode</button><button class="primary" id="testAgain">Repeat this setup</button></div></div>`;$('#wordTestProgress').textContent=manual?'Ended':'Completed';const {requested:mode,source,contentType}=wordTestSession;$('#changeTestMode').onclick=()=>returnToWordTestSetup(mode,source,contentType);$('#testAgain').onclick=()=>{returnToWordTestSetup(mode,source,contentType);$('#startWordTest').click()}}
function renderAudio(){setTitle('Audio Library','All 126 supplied MP3 files');$('#pageHost').innerHTML=`<section class="panel" style="margin-top:0"><div class="panel-head"><div><h2>Audio by chapter</h2><p class="muted">Every supplied audio file is available here, including files whose original filename did not identify a specific exercise.</p></div></div><div class="chapter-tabs">${D.chapters.map(c=>`<button class="${current.audioCh===c.id?'primary':'ghost'} audio-ch" data-ch="${c.id}">K${c.id}</button>`).join('')}</div><div id="audioList"></div></section>`;if(!current.audioCh)current.audioCh=1;const draw=()=>{const arr=D.audioByChapter[String(current.audioCh)]||[];$('#audioList').innerHTML=`<div class="grid audio-grid" style="margin-top:15px">${arr.map(r=>`<div class="audio-card"><div><b>Track ${r.track??'—'}</b> ${r.label?`· ${esc(r.label)}`:''}</div><small class="muted">${esc(r.original)}</small><audio controls preload="none" src="${esc(r.file)}"></audio></div>`).join('')}</div>`;$$('#audioList audio').forEach(a=>a.onplay=()=>event('Listening','audio-'+current.audioCh,1))};$$('.audio-ch').forEach(b=>b.onclick=()=>{current.audioCh=+b.dataset.ch;renderAudio()});draw()}
function startDeutschExamPages(){return D.appendix.filter(a=>a.section==='Start Deutsch 1')}
function startDeutschPageLabel(a){if(!a)return'';if(a.page===255||a.page===256)return'Hören';if(a.page===257)return'Hören + Lesen';if(a.page===258||a.page===259)return'Lesen';if(a.page===260)return'Schreiben';if(a.page===261)return'Sprechen · Teile 1–2';if(a.page===262)return'Sprechen · Teil 3';return'Start Deutsch 1'}
function startDeutschOpenProgress(a){if(!a)return false;const r=state.answers[a.id]||{};if(a.id==='exam-p260')return !!String(r.email||r.text||'').trim();if(a.id==='exam-p261'){if(String(r.text||'').trim()&&!r.speaking1&&!r.speaking2)return true;return !!String(r.speaking1||'').trim()&&!!String(r.speaking2||'').trim()}if(a.id==='exam-p262')return !!String(r.speaking3||r.text||'').trim();return !!r.savedAt}
function startDeutschPageStatus(a){const r=state.answers[a.id]||{},spec=correctionSpec(a);if(spec){const score=Number(r.check?.score||0),total=Number(r.check?.total||spec.fields.length),perfect=score===total&&total>0;if(perfect||state.completed[a.id])return a.id==='exam-p260'&&startDeutschOpenProgress(a)?'✓ Checked + writing saved':'✓ Checked';if(r.check)return `${score}/${total} correct`;if(r.savedAt)return a.id==='exam-p260'&&startDeutschOpenProgress(a)?'Writing saved':'Saved';return'Not started'}return startDeutschOpenProgress(a)?'Saved':'Not started'}
function startDeutschSummary(){const arr=startDeutschExamPages(),objective=arr.filter(a=>correctionSpec(a));let score=0,total=0,checkedPages=0;objective.forEach(a=>{const spec=correctionSpec(a),r=state.answers[a.id]||{};total+=spec.fields.length;if(r.check){checkedPages++;score+=Number(r.check.score||0)}});const openPages=['exam-p260','exam-p261','exam-p262'].map(id=>startDeutschOpenProgress(arr.find(a=>a.id===id)));return {score,total,checkedPages,objectivePages:objective.length,openSaved:openPages.filter(Boolean).length,openTotal:openPages.length}}
function startDeutschComplete(){const arr=startDeutschExamPages();return arr.filter(a=>correctionSpec(a)).every(a=>completed(a.id))&&['exam-p260','exam-p261','exam-p262'].every(id=>startDeutschOpenProgress(arr.find(a=>a.id===id)))}
function updateStartDeutschNavIcon(){const icon=$('.nav-item[data-page="exam"] .nav-icon');if(icon){icon.textContent=startDeutschComplete()?'✓':'A1';icon.title=startDeutschComplete()?'Start Deutsch 1 practice completed':'Start Deutsch 1 practice test'}}
function syncStartDeutschPageSelection(){const selected=String(current.examId||'');$$('.startdeutsch-page-card').forEach(card=>{const active=card.dataset.exam===selected;card.classList.toggle('active',active);card.setAttribute('aria-current',active?'page':'false');card.setAttribute('aria-selected',active?'true':'false');if(!active&&document.activeElement===card)card.blur()})}
function injectStartDeutschStyles(){if($('#spektrumStartDeutschStyles'))return;const style=document.createElement('style');style.id='spektrumStartDeutschStyles';style.textContent=`
.startdeutsch-summary{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:10px}
.startdeutsch-summary .badge{white-space:nowrap}
.startdeutsch-page-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.startdeutsch-page-card{appearance:none;width:100%;text-align:left;border:1px solid var(--border);border-radius:14px;background:var(--panel);padding:9px;cursor:pointer;color:inherit;transition:border-color .15s ease,transform .15s ease,box-shadow .15s ease}
.startdeutsch-page-card:hover{transform:translateY(-1px)}
.startdeutsch-page-card.active,.startdeutsch-page-card[aria-current="page"]{border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 22%,transparent)}
.startdeutsch-page-card:focus{outline:none}
.startdeutsch-page-card:focus-visible{outline:2px dashed var(--text);outline-offset:2px}
.startdeutsch-page-card img{width:100%;aspect-ratio:603/828;object-fit:cover;object-position:top;border-radius:9px;display:block;margin-bottom:7px}
.startdeutsch-page-meta{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
.startdeutsch-page-status{display:block;margin-top:4px;font-size:12px}
.startdeutsch-page-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px;padding:10px 12px;border:1px solid var(--border);border-radius:13px;background:color-mix(in srgb,var(--panel) 88%,var(--accent) 12%)}
.startdeutsch-page-toolbar .button-row{margin:0}
.startdeutsch-open-task{margin-top:14px;padding-top:14px;border-top:1px solid var(--border)}
.startdeutsch-open-task h3{margin-bottom:4px}
.startdeutsch-open-note{margin:0 0 10px}
@media(max-width:680px){.startdeutsch-page-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.startdeutsch-page-toolbar .button-row{width:100%}.startdeutsch-page-toolbar .button-row button{flex:1}}
`;document.head.appendChild(style)}
function refreshStartDeutschChrome(){const arr=startDeutschExamPages(),summary=startDeutschSummary();$$('[data-exam-status]').forEach(el=>{const a=arr.find(x=>x.id===el.dataset.examStatus);if(a)el.textContent=startDeutschPageStatus(a)});syncStartDeutschPageSelection();const status=$('#startDeutschProgressSummary');if(status)status.innerHTML=`<span class="badge">${summary.score}/${summary.total} correct on last checks</span><span class="badge">${summary.checkedPages}/${summary.objectivePages} objective pages checked</span><span class="badge">${summary.openSaved}/${summary.openTotal} open pages saved</span>`;updateStartDeutschNavIcon()}
function renderExam(){setTitle('Start Deutsch 1','Complete practice test · Hören · Lesen · Schreiben · Sprechen');injectStartDeutschStyles();const arr=startDeutschExamPages();if(!arr.length)return;const valid=arr.some(a=>a.id===current.examId);if(!valid)current.examId=arr[0].id;$('#pageHost').innerHTML=`<div class="notice"><b>Full practice test:</b> each source page now has its own answer workspace. Select a page below; <b>Check answers</b> and <b>Save for later</b> belong only to the selected page. Open writing/speaking tasks are saved but are not falsely auto-graded.<br><br><b>Listening note:</b> the supplied archive did not contain the appendix audio tracks used by this practice test, so the Hören pages keep their official answer keys but cannot play the missing exam audio.</div><section class="panel"><div class="panel-head"><div><h2>Exam pages</h2><p class="muted">Hören · Lesen · Schreiben · Sprechen</p></div><div class="startdeutsch-summary" id="startDeutschProgressSummary"></div></div><div class="startdeutsch-page-grid">${arr.map(a=>`<button type="button" class="startdeutsch-page-card ${a.id===current.examId?'active':''}" data-exam="${a.id}" aria-current="${a.id===current.examId?'page':'false'}" aria-selected="${a.id===current.examId?'true':'false'}"><img loading="lazy" src="${pageImage(a.page)}" alt="Start Deutsch 1 page ${a.page}"><div class="startdeutsch-page-meta"><span><b>p. ${a.page}</b><small class="muted"> · ${esc(startDeutschPageLabel(a))}</small></span></div><small class="startdeutsch-page-status muted" data-exam-status="${a.id}">${esc(startDeutschPageStatus(a))}</small></button>`).join('')}</div></section><div id="examHost"></div>`;$$('[data-exam]').forEach(e=>e.onclick=()=>{renderAppendixActivity(e.dataset.exam);$('#examHost')?.scrollIntoView({behavior:'smooth',block:'start'})});wireStartDeutschExamNavigation();renderAppendixActivity(current.examId);refreshStartDeutschChrome()}
function wireStartDeutschExamNavigation(){const host=$('#examHost');if(!host)return;host.onclick=e=>{const button=e.target.closest('[data-startdeutsch-nav]');if(!button||!host.contains(button)||button.disabled)return;e.preventDefault();const arr=startDeutschExamPages(),index=arr.findIndex(a=>a.id===current.examId),delta=Number(button.dataset.startdeutschNav||0),next=arr[index+delta];if(!next)return;renderAppendixActivity(next.id);requestAnimationFrame(()=>$('#examHost')?.scrollIntoView({behavior:'smooth',block:'start'}))}}
function startDeutschOpenWorkbench(a,saved){if(a.id==='exam-p261')return `<div class="startdeutsch-open-task"><h3>Sprechen Teil 1 · Sich vorstellen</h3><p class="muted startdeutsch-open-note">Prepare your introduction: name, age, country, home, languages, job and hobbies.</p><textarea class="free-area" id="examSpeaking1" placeholder="Your introduction notes…">${esc(saved.speaking1||saved.text||'')}</textarea></div><div class="startdeutsch-open-task"><h3>Sprechen Teil 2 · Informationen geben und erfragen</h3><p class="muted startdeutsch-open-note">Prepare questions and short answers for the travel cards on the source page.</p><textarea class="free-area" id="examSpeaking2" placeholder="Your questions and answers…">${esc(saved.speaking2||'')}</textarea></div><button class="secondary" id="saveExamOpenPage" style="margin-top:12px">Save for later</button>`;if(a.id==='exam-p262')return `<div class="startdeutsch-open-task"><h3>Sprechen Teil 3 · Bitten und Reaktionen</h3><p class="muted startdeutsch-open-note">Prepare polite requests and suitable reactions for the cards on the page.</p><textarea class="free-area" id="examSpeaking3" placeholder="Your requests and reactions…">${esc(saved.speaking3||saved.text||'')}</textarea></div><button class="secondary" id="saveExamOpenPage" style="margin-top:12px">Save for later</button>`;return `<textarea class="free-area" id="examAnswer" placeholder="Write your notes here…">${esc(saved.text||'')}</textarea><button class="secondary" id="saveExam" style="margin-top:9px">Save for later</button>`}
function renderAppendixActivity(id){const arr=startDeutschExamPages(),a=arr.find(x=>x.id===id);if(!a)return;current.examId=id;syncStartDeutschPageSelection();const index=arr.findIndex(x=>x.id===id),spec=correctionSpec(a),model=modelAnswer(a),saved=state.answers[a.id]||{},free=spec&&a.id==='exam-p260'?`<div class="startdeutsch-open-task"><h3>Schreiben Teil 2 · Nachricht an Freunde</h3><p class="muted startdeutsch-open-note">Write about 30 words, cover all three points on the source page, and include a greeting and sign-off.</p><textarea class="free-area" id="examOpenAnswer" placeholder="Write your message here…">${esc(saved.email||saved.text||'')}</textarea><button class="secondary" id="saveExamOpen" style="margin-top:9px">Save writing for later</button></div>`:'';const layout=studyLayoutMode(),ratio=studyRatioMode(),swap=studySwapSides();$('#examHost').innerHTML=`<div class="startdeutsch-page-toolbar"><div><b>${esc(startDeutschPageLabel(a))} · page ${a.page}</b><div class="muted">Exam page ${index+1} of ${arr.length} · ${esc(startDeutschPageStatus(a))}</div></div><div class="button-row"><button type="button" class="ghost" id="examPrev" data-startdeutsch-nav="-1" ${index<=0?'disabled':''}>← Previous</button><button type="button" class="primary" id="examNext" data-startdeutsch-nav="1" ${index>=arr.length-1?'disabled':''}>Next →</button></div></div>${renderStudyLayoutToolbar(a,{hasList:false})}<article class="activity-card study-card layout-${layout}"><div class="activity-card-head"><div><div>${a.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><h2>${esc(a.title)} · p. ${a.page}</h2></div></div><div class="study-split ${swap?'swapped':''}" data-layout="${layout}" data-ratio="${ratio}"><div class="study-source-pane"><div class="study-pane-label"><span>📖 Exam Page Visual (p. ${a.page})</span><small class="muted">Scroll or zoom independently</small></div>${renderStudySource(a)}</div><div class="study-work-pane"><div class="study-pane-label"><span>✍️ Exam Answer Sheet</span><small class="muted">${esc(startDeutschPageLabel(a))}</small></div>${arabicHelp(a.kind)}<div class="workbench">${spec?workbench(a):`<div class="notice"><b>Open task:</b> there is no automatic Check answers for speaking. Save your preparation and continue.</div>${startDeutschOpenWorkbench(a,saved)}${model?`<details class="model-check"><summary>Self-check / model guidance</summary><p>${esc(model)}</p></details>`:''}`}${free}</div></div></div></article>`;drawSourceCanvases();wireStudyWorkspaceControls($('#examHost'),()=>renderAppendixActivity(id));$$('.full-page',$('#examHost')).forEach(b=>b.onclick=()=>showViewer(+b.dataset.fullPage));const updateMeta=()=>{refreshStartDeutschChrome();const meta=$('.startdeutsch-page-toolbar .muted',$('#examHost'));if(meta)meta.textContent=`Exam page ${index+1} of ${arr.length} · ${startDeutschPageStatus(a)}`};if(spec){wireWorkbench(a,updateMeta);const open=$('#saveExamOpen');if(open)open.onclick=()=>{const rec=state.answers[a.id]||{};rec.email=$('#examOpenAnswer').value;rec.text=rec.email;rec.savedAt=new Date().toISOString();state.answers[a.id]=rec;event('Writing',a.id);open.textContent='Saved ✓';save();updateMeta()}}else if(a.id==='exam-p261'){const button=$('#saveExamOpenPage');if(button)button.onclick=()=>{const rec=state.answers[a.id]||{};rec.speaking1=$('#examSpeaking1').value;rec.speaking2=$('#examSpeaking2').value;rec.text=[rec.speaking1,rec.speaking2].filter(Boolean).join('\n\n');rec.savedAt=new Date().toISOString();state.answers[a.id]=rec;event('Speaking',a.id);button.textContent='Saved ✓';save();updateMeta()}}else if(a.id==='exam-p262'){const button=$('#saveExamOpenPage');if(button)button.onclick=()=>{const rec=state.answers[a.id]||{};rec.speaking3=$('#examSpeaking3').value;rec.text=rec.speaking3;rec.savedAt=new Date().toISOString();state.answers[a.id]=rec;event('Speaking',a.id);button.textContent='Saved ✓';save();updateMeta()}}else{const button=$('#saveExam');if(button)button.onclick=()=>{const rec=state.answers[a.id]||{};rec.text=$('#examAnswer').value;rec.savedAt=new Date().toISOString();state.answers[a.id]=rec;event(a.kind==='speaking'?'Speaking':'Practice',a.id);button.textContent='Saved ✓';save();updateMeta()}}refreshStartDeutschChrome()}
function renderStructures(){setTitle('Structure Reference','Book appendix pages 263–271');const arr=D.appendix.filter(a=>a.section==='Structure reference');$('#pageHost').innerHTML=`<section class="panel" style="margin-top:0"><div class="panel-head"><div><h2>Grammar reference</h2><p class="muted">The complete structure overview from the book, available as high-resolution integrated pages.</p></div></div><div class="page-browser">${arr.map(a=>`<div class="page-thumb" data-page-img="${a.page}"><img loading="lazy" src="${pageImage(a.page)}"><div><b>Page ${a.page}</b></div></div>`).join('')}</div></section>`;$$('[data-page-img]').forEach(e=>e.onclick=()=>showViewer(+e.dataset.pageImg))}
function renderSearch(){setTitle('Search book','Search all extracted text');$('#pageHost').innerHTML=`<section class="panel" style="margin-top:0"><h2>Search all chapters</h2><div class="word-toolbar"><input class="search-input" id="bookSearch" autofocus placeholder="e.g. Perfekt, Arzt, Hotel, Einladung…"><select class="select-input" id="searchScope"><option value="all">All</option>${D.chapters.map(c=>`<option value="${c.id}">Kapitel ${c.id}</option>`).join('')}<option value="appendix">Appendix</option></select></div><div id="searchResults" class="search-results"></div></section>`;const go=()=>{const q=norm($('#bookSearch').value),scope=$('#searchScope').value;if(q.length<2){$('#searchResults').innerHTML='<p class="muted">Type at least two characters.</p>';return}let res=[];for(const a of D.activities){if(scope!=='all'&&scope!=='appendix'&&String(a.chapter)!==scope)continue;if(scope==='appendix')continue;const hay=norm(`${a.label} ${a.title} ${a.text}`);if(hay.includes(q))res.push({kind:'activity',a,score:hay.startsWith(q)?0:1})}for(const p of D.pages){if(scope!=='all'&&scope!=='appendix'&&String(p.chapter)!==scope)continue;if(scope==='appendix'&&p.page<255)continue;const hay=norm(p.text);if(hay.includes(q))res.push({kind:'page',p,score:2})}res=res.sort((x,y)=>x.score-y.score).slice(0,80);$('#searchResults').innerHTML=res.map((r,i)=>r.kind==='activity'?`<div class="search-result" data-result-act="${r.a.id}"><b>Kapitel ${r.a.chapter} · ${esc(r.a.label)} ${esc(r.a.title)}</b><div class="muted">Page ${r.a.page} · ${r.a.tags.join(' / ')}</div></div>`:`<div class="search-result" data-result-page="${r.p.page}"><b>Book page ${r.p.page}</b><div class="muted">${r.p.chapter?`Kapitel ${r.p.chapter} · ${r.p.section}`:'Appendix'}</div></div>`).join('')||'<p class="muted">No matches.</p>';$$('[data-result-act]').forEach(e=>e.onclick=()=>openActivity(e.dataset.resultAct));$$('[data-result-page]').forEach(e=>e.onclick=()=>showViewer(+e.dataset.resultPage))};$('#bookSearch').oninput=go;$('#searchScope').onchange=go}
function renderProgress(){setTitle('Progress',cloudReady()?'Stored locally + cloud sync':'Stored locally on this device');const overall=overallProgress(),wordsPool=wordTestPool(),phrasesPool=PHRASE_TESTS;$('#pageHost').innerHTML=`<section class="panel" style="margin-top:0"><div class="panel-head"><div><h2>Overall course</h2><p class="muted">Completion is based on real exercise cards, not a manual chapter switch.</p></div><strong style="font-size:30px">${overall.pct}%</strong></div><div class="progress-bar"><span style="width:${overall.pct}%"></span></div></section><section class="panel"><h2>By chapter</h2>${D.chapters.map(c=>{const p=chapterProgress(c.id);return `<div style="margin:15px 0"><div style="display:flex;justify-content:space-between"><b>Kapitel ${c.id} · ${esc(c.title)}</b><span>${p.done}/${p.total}</span></div><div class="progress-bar"><span style="width:${p.pct}%"></span></div></div>`}).join('')}</section><section class="panel"><div class="panel-head"><h2>Contribution history</h2><span class="badge">Current streak ${streak()} days</span></div>${renderHeatmap()}</section><section class="panel"><div class="panel-head"><div><h2>Vocabulary states</h2><p class="muted">Tracked separately for lexical words (${wordsPool.length}) and sentences/phrases (${phrasesPool.length}).</p></div></div><div class="settings-row" style="font-weight:800;font-size:13px;color:var(--muted)"><span>State</span><span>Words / Phrases</span></div>${['new','seen','confirmed','strong','mastered','review'].map(s=>{const wCount=wordsPool.filter(v=>vocabStatus(v)===s).length,pCount=phrasesPool.filter(v=>vocabStatus(v)===s).length;return `<div class="settings-row"><span class="status-chip status-${s}">${statusLabel(s)}</span><b>${wCount} words · ${pCount} phrases</b></div>`}).join('')}</section>`}
function bulkRecoverChapterProgress(chId,secScope,fillAnswers=true){
  saveSnapshot(`Before bulk recovery (K${chId})`);
  const targetCh=chId==='all'?null:+chId;
  const acts=D.activities.filter(a=>a.chapter&&(!targetCh||a.chapter===targetCh)&&!['Overview','Übersichten'].includes(a.section)&&(secScope==='all'||a.section===secScope));
  let count=0;
  acts.forEach(a=>{
    state.completed[a.id]=true;count++;
    const spec=correctionSpec(a);
    if(fillAnswers&&spec&&Array.isArray(spec.fields)){
      const lines=spec.fields.map(f=>f.unordered?.length?f.unordered.join(', '):(f.answers?.[0]||''));
      state.answers[a.id]={lines,savedAt:new Date().toISOString(),check:{score:spec.fields.length,total:spec.fields.length,results:spec.fields.map(()=>true),checkedAt:new Date().toISOString()}};
    }
    markStudyVocabulary(a);
  });
  if(count>0)event('Practice',`recover-k${chId}`);
  setUseStaticSeed(true);
  save();
  return count;
}
function renderSettings(){
  setTitle('Settings','Sync, Recovery & Preferences');
  const connected=cloudReady(),prov=syncConfig.provider||'github',snaps=loadSnapshots(),rich=stateRichness(state);
  $('#pageHost').innerHTML=`
  <section class="panel" style="margin-top:0">
    <div class="panel-head"><div><h2>Multi-Device Sync (GitHub & Cloud)</h2><p class="muted"><b>Anti-Wipe Protection Active:</b> Opening the app on a second empty device will never overwrite your saved progress. Progress from both devices is automatically merged.</p></div><span class="badge">${connected?'Connected':'Not connected'}</span></div>
    <label class="field-label" for="syncProvider">Sync Method</label>
    <select class="wide-select" id="syncProvider">
      <option value="github" ${prov==='github'?'selected':''}>GitHub Repository Sync (Recommended for GitHub Pages)</option>
      <option value="gas" ${prov==='gas'?'selected':''}>Google Drive (via Google Apps Script Web App)</option>
    </select>
    <div id="githubSyncBox" class="${prov==='github'?'':'hidden'}" style="margin-top:12px">
      <div class="notice" style="margin-bottom:12px"><b>How GitHub Sync works:</b> Static websites on GitHub Pages cannot save browser data to your repository automatically unless connected to the GitHub API or saved as <code>data/user-progress.json</code>. Enter your repository name and a GitHub Personal Access Token (with <code>Contents: Read & write</code> permission on your repo), or click <b>Download data/user-progress.json</b> below and place it inside your repo's <code>data/</code> folder so every device loads your progress automatically!</div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px">
        <div><label class="field-label" for="ghRepo">GitHub Repository (owner/repo)</label><input class="answer-input" style="width:100%" id="ghRepo" placeholder="e.g. username/spektrum-a1" value="${esc(syncConfig.ghRepo||detectGithubRepoFromLocation()||'')}"></div>
        <div><label class="field-label" for="ghBranch">Branch</label><input class="answer-input" style="width:100%" id="ghBranch" placeholder="main" value="${esc(syncConfig.ghBranch||'main')}"></div>
        <div><label class="field-label" for="ghPath">Progress File Path in Repo</label><input class="answer-input" style="width:100%" id="ghPath" placeholder="data/user-progress.json" value="${esc(syncConfig.ghPath||'data/user-progress.json')}"></div>
      </div>
      <label class="field-label" for="ghToken" style="margin-top:10px">GitHub Personal Access Token (Fine-grained or Classic)</label>
      <input class="answer-input" style="width:100%" id="ghToken" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_... or ghp_..." value="${esc(syncConfig.ghToken||'')}">
    </div>
    <div id="gasSyncBox" class="${prov==='gas'?'':'hidden'}" style="margin-top:12px">
      <label class="field-label" for="cloudUrl">Apps Script Web App URL</label>
      <input class="answer-input" style="width:100%" id="cloudUrl" inputmode="url" autocomplete="off" placeholder="https://script.google.com/macros/s/.../exec" value="${esc(syncConfig.url||'')}">
      <label class="field-label" for="cloudKey" style="margin-top:12px">Sync key</label>
      <div style="display:flex;gap:8px;align-items:center"><input class="answer-input" style="flex:1" id="cloudKey" autocomplete="off" spellcheck="false" placeholder="Use the same private key on every device" value="${esc(syncConfig.key||'')}"><button class="ghost" id="generateCloudKey" type="button">Generate</button></div>
    </div>
    <div class="button-row" style="margin-top:14px">
      <button class="primary" id="saveCloudSync">Save & Smart Sync</button>
      <button class="secondary" id="pullCloud" ${connected?'':'disabled'}>Merge from remote</button>
      <button class="secondary" id="pushCloud" ${connected?'':'disabled'}>Force upload this device</button>
      <button class="ghost" id="disconnectCloud" ${connected?'':'disabled'}>Disconnect</button>
    </div>
    <div class="notice" id="cloudSyncStatus" style="margin-top:12px" data-state="${syncMeta.lastError?'error':connected?'ok':''}">${syncMeta.lastError?`Last error: ${esc(syncMeta.lastError)}`:connected?`Smart Sync is active · last check ${syncTime(syncMeta.lastPullAt)} · last upload ${syncTime(syncMeta.lastPushAt)}`:'Choose GitHub Repository Sync or Google Apps Script above, then click Save & Smart Sync.'}</div>
  </section>

  <section class="panel">
    <div class="panel-head"><div><h2>Quick Progress Recovery & Chapter Restore</h2><p class="muted">Lost progress after switching devices? Instantly restore completed status, verified model answers, and seen vocabulary for any chapters you already finished.</p></div><span class="badge">${rich.completed} exercises done</span></div>
    <div class="word-toolbar" style="margin-bottom:10px">
      <select class="select-input" id="recoverChapterSelect">
        ${D.chapters.map(c=>`<option value="${c.id}">Kapitel ${c.id} · ${esc(c.title)} (${chapterProgress(c.id).done}/${chapterProgress(c.id).total})</option>`).join('')}
      </select>
      <select class="select-input" id="recoverSectionSelect">
        <option value="all">All chapter sections (Main + Vertiefung + Test)</option>
        <option value="Main course">Main course only</option>
        <option value="Vertiefung">Vertiefung only</option>
        <option value="Abschlusstest">Abschlusstest (Chapter test) only</option>
      </select>
      <label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700"><input type="checkbox" id="recoverFillAnswers" checked> Fill official answers</label>
      <button class="primary" id="runQuickRecover" type="button">✓ Restore selected chapter</button>
    </div>
    <p class="muted" id="recoverFeedback" style="margin:4px 0 0"></p>
  </section>

  <section class="panel">
    <div class="panel-head"><div><h2>Backup & GitHub Repo File (<code>user-progress.json</code>)</h2><p class="muted">You can download <code>user-progress.json</code> and commit it inside your GitHub repository’s <code>data/</code> folder (<code>a1/data/user-progress.json</code>). Every device that opens your GitHub Pages link will automatically load and merge it on startup!</p></div></div>
    <div class="button-row">
      <button class="primary" id="exportRepoSeedBtn" type="button">⬇ Download user-progress.json (for GitHub data/ folder)</button>
      <button class="secondary" id="exportBtn" type="button">Export backup JSON</button>
      <label class="secondary" style="cursor:pointer">Import & Merge backup<input id="importFile" type="file" accept="application/json" hidden></label>
      <button class="danger" id="resetBtn" type="button">Reset progress</button>
    </div>
    ${snaps.length?`<div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px"><h3>Automatic Local Safety Snapshots (${snaps.length})</h3><p class="muted">Saved automatically before syncs, imports, and resets on this browser.</p><div class="answer-grid">${snaps.map(s=>`<div class="settings-row" style="padding:8px 0"><div><b>${esc(s.reason||'Snapshot')}</b> · <small class="muted">${syncTime(s.createdAt)}</small><div class="muted" style="font-size:12px">${s.richness?.completed||0} exercises · ${s.richness?.answers||0} answers · ${s.richness?.vocab||0} words</div></div><button class="secondary restore-snap-btn" data-snap-id="${esc(s.id)}" type="button">Restore & Merge</button></div>`).join('')}</div></div>`:''}
  </section>

  <section class="panel"><h2>Study display</h2><div class="settings-row study-word-setting"><div><label for="clickToReviewSetting"><b>Click words to add to review</b></label><p class="muted">Open Study text below the book image to click a word, add its meaning and save it for review. Images stay visible.</p></div><select id="clickToReviewSetting"><option value="off">Off</option><option value="on">On</option></select></div><div class="settings-row"><div><b>Exercise study layout</b><p class="muted">Keep the book visual and answer inputs visible at the same time without scrolling up and down.</p></div><select id="studyLayoutSetting"><option value="split">Side-by-side Split (Recommended)</option><option value="pinned">Pinned Top</option><option value="stacked">Classic Stacked</option></select></div><div class="settings-row"><div><b>Appearance</b></div><select id="themeSetting"><option value="light">Light</option><option value="dark">Dark</option></select></div><div class="settings-row"><div><b>Desktop sidebar</b><p class="muted">The hamburger button is always visible on laptop/desktop and toggles the sidebar.</p></div><select id="sidebarSetting"><option value="open">Open</option><option value="collapsed">Collapsed</option></select></div><div class="settings-row"><div><b>Arabic help</b><p class="muted">English interface is primary; optional Arabic instructions appear only when enabled.</p></div><select id="arabicSetting"><option value="on">On</option><option value="off">Off</option></select></div></section>
  <section class="panel"><div class="settings-row"><div><b>App version</b><p class="muted">Spektrum A1+</p></div><span class="badge">${esc(APP_VERSION)}</span></div></section>`;

  $('#clickToReviewSetting').value=state.settings.clickToReview?'on':'off';
  $('#clickToReviewSetting').onchange=event=>{state.settings.clickToReview=event.target.value==='on';save()};
  $('#arabicSetting').value=state.settings.arabicHelp?'on':'off';
  $('#themeSetting').value=state.settings.theme;
  $('#sidebarSetting').value=state.settings.sidebarCollapsed?'collapsed':'open';
  if($('#studyLayoutSetting')){$('#studyLayoutSetting').value=studyLayoutMode();$('#studyLayoutSetting').onchange=e=>{state.settings.studyLayout=e.target.value;save()}}
  $('#arabicSetting').onchange=e=>{state.settings.arabicHelp=e.target.value==='on';save()};
  $('#themeSetting').onchange=e=>applyTheme(e.target.value);
  $('#sidebarSetting').onchange=e=>{state.settings.sidebarCollapsed=e.target.value==='collapsed';applySidebar();save()};
  $('#syncProvider').onchange=e=>{
    syncConfig.provider=e.target.value;
    $('#githubSyncBox').classList.toggle('hidden',syncConfig.provider!=='github');
    $('#gasSyncBox').classList.toggle('hidden',syncConfig.provider!=='gas');
  };
  if($('#generateCloudKey'))$('#generateCloudKey').onclick=()=>{$('#cloudKey').value=generateSyncKey()};
  $('#saveCloudSync').onclick=async()=>{
    const provider=$('#syncProvider').value;
    if(provider==='github'){
      const ghRepo=String($('#ghRepo').value||'').trim().replace(/^https?:\/\/github\.com\//i,'').replace(/\.git$/i,'').replace(/^\/+|\/+$/g,'');
      const ghBranch=String($('#ghBranch').value||'main').trim()||'main';
      const ghPath=String($('#ghPath').value||'data/user-progress.json').trim()||'data/user-progress.json';
      const ghToken=String($('#ghToken').value||'').trim();
      if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(ghRepo)){setCloudStatus('Enter your GitHub repository in owner/repo format (e.g. username/spektrum-a1).','error');return}
      if(ghToken.length<10){setCloudStatus('Enter a valid GitHub Personal Access Token with Contents Read & Write permission.','error');return}
      syncEpoch++;syncMeta.ghSha='';syncConfig={...syncConfig,provider:'github',ghRepo,ghBranch,ghPath,ghToken};
      saveSyncConfig();setCloudStatus('Connecting to GitHub repository…','busy');
      await cloudSyncNow({silent:false});renderSettings();
    }else{
      const url=cleanSyncUrl($('#cloudUrl').value),key=String($('#cloudKey').value||'').trim();
      if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/i.test(url)){setCloudStatus('Use the deployed Apps Script Web App URL ending in /exec.','error');return}
      if(key.length<16){setCloudStatus('The sync key must be at least 16 characters.','error');return}
      syncEpoch++;syncConfig={...syncConfig,provider:'gas',url,key};
      saveSyncConfig();setCloudStatus('Connecting to Google Apps Script…','busy');
      await cloudSyncNow({silent:false});renderSettings();
    }
  };
  $('#pullCloud').onclick=async()=>{await cloudPull({apply:true,silent:false,merge:true});renderSettings()};
  $('#pushCloud').onclick=async()=>{if(stateRichness(state).score===0&&!confirm('This device currently has 0 completed exercises. Are you sure you want to force-upload an empty state?'))return;syncMeta.localUpdatedAt=Date.now();saveSyncMeta();await cloudPush({silent:false,force:true});renderSettings()};
  $('#disconnectCloud').onclick=()=>{if(!confirm('Disconnect remote sync on this device? Your local progress and remote copy will both remain safe.'))return;syncEpoch++;syncPending=false;syncConfig={...syncConfig,url:'',key:'',ghToken:''};saveSyncConfig();clearTimeout(syncSaveTimer);renderSettings()};
  $('#runQuickRecover').onclick=()=>{
    const ch=$('#recoverChapterSelect').value,sec=$('#recoverSectionSelect').value,fill=$('#recoverFillAnswers').checked;
    const n=bulkRecoverChapterProgress(ch,sec,fill);
    $('#recoverFeedback').textContent=`✓ Restored ${n} activities in Kapitel ${ch} (${sec}).`;
    setTimeout(()=>renderSettings(),700);
  };
  $$('.restore-snap-btn').forEach(btn=>btn.onclick=()=>{
    const snap=loadSnapshots().find(x=>x.id===btn.dataset.snapId);
    if(!snap?.state)return;
    saveSnapshot('Before snapshot restore');
    state=mergeStudyStates(state,snap.state,'remote');
    save();renderSettings();
  });
  $('#exportRepoSeedBtn').onclick=()=>{
    const payload={updatedAt:Date.now(),appVersion:APP_VERSION,richness:stateRichness(state),state};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download='user-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1200);
  };
  $('#exportBtn').onclick=downloadProgressBackup;
  $('#importFile').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const parsed=JSON.parse(r.result),incoming=parsed?.state&&typeof parsed.state==='object'?parsed.state:parsed;saveSnapshot('Before JSON import');state=mergeStudyStates(state,incoming,'remote');unreadableStoredState=null;setUseStaticSeed(true);save();applyThemeWithoutSave(state.settings.theme);applySidebar();alert(`Progress imported and merged (${stateRichness(state).completed} completed exercises).`);renderSettings()}catch{alert('This backup could not be imported.')}};r.readAsText(f)};
  $('#resetBtn').onclick=()=>{
    if(!confirm('Reset study progress on this device and disconnect cloud sync? A local snapshot will be saved first. Your remote backup will remain unchanged.'))return;
    saveSnapshot('Before manual reset');syncEpoch++;syncPending=false;clearTimeout(syncSaveTimer);
    syncConfig={...syncConfig,url:'',key:'',ghToken:''};saveSyncConfig();
    setUseStaticSeed(false);unreadableStoredState=null;state=baseState();progressBaseline=Sync.capture(state);persistState();
    syncMeta.localUpdatedAt=0;syncMeta.ghSha='';saveSyncMeta();applyThemeWithoutSave('light');applySidebar();showPage('home');
  };

}
function applyTheme(t){state.settings.theme=t;document.documentElement.dataset.theme=t;save()}
function applySidebar(){const mobile=matchMedia('(max-width:820px)').matches;if(!mobile)$('#appShell').classList.toggle('sidebar-collapsed',!!state.settings.sidebarCollapsed);else $('#appShell').classList.remove('sidebar-collapsed')}
function toggleMenu(){if(matchMedia('(max-width:820px)').matches){$('#sidebar').classList.toggle('open');$('#backdrop').classList.toggle('active')}else{state.settings.sidebarCollapsed=!state.settings.sidebarCollapsed;applySidebar();save()}}



// v1.2 — DeutschPath-style German letter keyboard
const GERMAN_KEYBOARD_KEY = 'spektrumA1GermanKeyboardOpen';
function initGermanKeyboard() {
  const dock = $('#germanKeyboardDock'), panel = $('#germanKeyboardPanel');
  const toggle = $('#germanKeyboardToggle'), status = $('#germanKeyboardStatus');
  const keys = $$('.german-key', dock);
  let target = null;

  function canInsert(field) {
    const textInput = field?.tagName === 'INPUT' && ['text', 'search', 'url', 'tel'].includes(field.type);
    return field?.isConnected && (textInput || field.tagName === 'TEXTAREA') &&
      !field.disabled && !field.readOnly && field.getClientRects().length > 0 && !field.closest('[inert]');
  }
  function updateTarget(field) {
    target = canInsert(field) ? field : null;
    dock.classList.toggle('has-target', !!target);
    keys.forEach(key => { key.disabled = !target; });
    const label = target?.labels?.[0]?.textContent || target?.getAttribute('aria-label') ||
      document.getElementById(target?.getAttribute('aria-labelledby'))?.textContent || target?.placeholder;
    const message = target ? 'Typing in ' + (label?.trim() || 'selected field') : 'Select a text field to type.';
    if (status.textContent !== message) status.textContent = message;
  }
  function positionPalette() {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    dock.style.setProperty('--keyboard-inset', inset + 'px');
    dock.style.setProperty('--keyboard-height', Math.max(0, viewport.height - 28) + 'px');
  }
  function setOpen(open) {
    panel.hidden = !open;
    dock.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) updateTarget(target);
    positionPalette();
    try { localStorage.setItem(GERMAN_KEYBOARD_KEY, open ? '1' : '0'); } catch {}
  }
  function insert(character) {
    if (!canInsert(target)) { updateTarget(null); return; }
    const field = target;
    const start = field.selectionStart, end = field.selectionEnd;
    if (field.maxLength >= 0 && field.value.length - (end - start) + character.length > field.maxLength) {
      status.textContent = 'Select a character to replace.';
      field.focus({preventScroll: true});
      return;
    }
    field.focus({preventScroll: true});
    field.setRangeText(character, start, end, 'end');
    field.dispatchEvent(new Event('input', {bubbles: true}));
    field.dispatchEvent(new Event('change', {bubbles: true}));
    updateTarget(target);
  }
  document.addEventListener('focusin', event => {
    if (dock.contains(event.target)) return;
    const dialog = event.target.closest('dialog[open]');
    if (dialog && !dialog.contains(dock)) dialog.appendChild(dock);
    if (canInsert(event.target)) updateTarget(event.target);
    else if (event.target.matches('input, textarea') || (dialog && !dialog.contains(target))) updateTarget(null);
  });
  // A native dialog makes controls outside it inert. Return the palette when it closes.
  document.addEventListener('close', event => {
    if (event.target.tagName === 'DIALOG' && !event.target.open && event.target.contains(dock)) {
      document.body.appendChild(dock);
      updateTarget(document.activeElement);
    }
  }, true);
  new MutationObserver(() => {
    if (target && !canInsert(target)) updateTarget(null);
  }).observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['hidden','disabled','readonly']});
  dock.addEventListener('pointerdown', event => {
    if (event.button === 0 && canInsert(target) && event.target.closest('button')) event.preventDefault();
  });
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  keys.forEach(key => key.addEventListener('click', () => insert(key.dataset.char)));
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || panel.hidden || !(dock.contains(event.target) || event.target === target)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    setOpen(false);
    if (dock.contains(document.activeElement)) (target || toggle).focus({preventScroll: true});
  }, true);
  window.visualViewport?.addEventListener('resize', positionPalette);
  window.visualViewport?.addEventListener('scroll', positionPalette);
  updateTarget(document.activeElement);
  let open = false;
  try { open = localStorage.getItem(GERMAN_KEYBOARD_KEY) === '1'; } catch {}
  setOpen(open);
}

function applyLevelBranding(){const mark=$('.brand-mark');if(mark){mark.textContent='A1+';mark.setAttribute('aria-label','A1+ level');mark.title='Spektrum A1+'}}
removeLegacyWordReviewUI();applyLevelBranding();$$('.nav-item').forEach(b=>b.onclick=()=>showPage(b.dataset.page));$('#menuBtn').onclick=toggleMenu;$('#backdrop').onclick=closeMenu;$('#themeBtn').onclick=()=>applyTheme(state.settings.theme==='dark'?'light':'dark');$('#streakPill').onclick=()=>showPage('progress');$('#searchQuick').onclick=()=>showPage('search');$('#viewerClose').onclick=closeViewer;$('#viewer').onclick=e=>{if(e.target===$('#viewer'))closeViewer()};document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#studyWordDialog')?.open)closeViewer()});window.addEventListener('resize',applySidebar);window.addEventListener('focus',maybeCheckCloud);document.addEventListener('visibilitychange',maybeCheckCloud);window.addEventListener('online',handleCloudOnline);
applyThemeWithoutSave(state.settings.theme||'light');applySidebar();injectStreakStyles();injectStartDeutschStyles();updateStreakUI();updateStartDeutschNavIcon();initGermanKeyboard();initStudyWordPicker();injectCorrectionStyles();injectWordTestStyles();
if(state.last?.page==='chapter')openChapter(state.last.chapter||1,state.last.section||'Main course',state.last.activity||null);else showPage(state.last?.page||'home');
showStorageStatus();
cloudStartupSync();
})();