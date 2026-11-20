const test = require('node:test');
const assert = require('node:assert/strict');
const Sync = require('../state-sync.js');
const copy = s => JSON.parse(JSON.stringify(s));
const base = () => ({schema:3,revisions:{},completed:{},answers:{},vocab:{},learningDB:{words:{}},events:{},vocabExposure:{review:[],study:[],test:[],book:[]},vocabDiscovery:{included:[],excluded:[],manual:[]},settings:{},last:{page:'home'}});
function edit(state, change, time=1800000000000) {const before=Sync.capture(state);change(state);Sync.stamp(state,before,time);return state;}

test('an empty device cannot erase legacy progress',()=>{
  const remote=base();remote.completed.a=true;remote.answers.a={text:'Hallo'};
  const merged=Sync.merge(base(),remote);
  assert.equal(merged.completed.a,true);assert.equal(merged.answers.a.text,'Hallo');
});
test('unmarking completion survives both sync directions and repeated merges',()=>{
  const remote=edit(base(),s=>s.completed.a=true);const local=copy(remote);
  edit(local,s=>s.completed.a=false,1800000000100);
  for(const [a,b] of [[local,remote],[remote,local]]){
    const merged=Sync.merge(a,b);assert.equal(merged.completed.a,false);
    assert.equal(Sync.merge(merged,remote).completed.a,false);
  }
});
test('a newer legacy answer wins even with a lower score',()=>{
  const local=base(),remote=base();
  local.answers.a={lines:['new'],savedAt:'2026-11-18T10:00:00Z',check:{score:1}};
  remote.answers.a={lines:['old'],savedAt:'2026-11-17T10:00:00Z',check:{score:3}};
  assert.equal(Sync.merge(local,remote).answers.a.lines[0],'new');
});
test('a saved draft replaces an older checked answer',()=>{
  const remote=edit(base(),s=>s.answers.a={text:'checked',check:{score:5}}),local=copy(remote);
  edit(local,s=>s.answers.a={text:'new draft'},1800000000100);
  assert.deepEqual(Sync.merge(local,remote).answers.a,{text:'new draft'});
});
test('a newer wrong recall stays wrong and resets the review interval',()=>{
  const remote=edit(base(),s=>{
    s.learningDB.words.w={fullRecallCorrect:5,lastFullRecallResult:'correct',fullRecallAt:1800000000000};
    s.vocab.w={status:'mastered',interval:30,repetitions:5};
  });
  const local=copy(remote);edit(local,s=>{
    s.learningDB.words.w={...s.learningDB.words.w,fullRecallWrong:1,lastFullRecallResult:'wrong',fullRecallAt:1800000000100};
    s.vocab.w={status:'learning',interval:1,repetitions:0};
  },1800000000100);
  const merged=Sync.merge(local,remote);
  assert.equal(merged.learningDB.words.w.lastFullRecallResult,'wrong');
  assert.equal(merged.learningDB.words.w.fullRecallCorrect,5);
  assert.equal(merged.vocab.w.interval,1);assert.equal(merged.vocab.w.repetitions,0);
});
test('a later article test cannot replace a newer full recall result',()=>{
  const remote=edit(base(),s=>s.learningDB.words.w={lastFullRecallResult:'correct',fullRecallAt:1800000000000});
  const local=copy(remote);
  edit(local,s=>s.learningDB.words.w={lastFullRecallResult:'wrong',fullRecallAt:1800000000100},1800000000100);
  edit(remote,s=>s.learningDB.words.w.articleCorrect=1,1800000000200);
  assert.equal(Sync.merge(local,remote).learningDB.words.w.lastFullRecallResult,'wrong');
});
test('manual word deletion is remembered instead of resurrected',()=>{
  const remote=edit(base(),s=>{s.vocabDiscovery.manual=[{id:'m',term:'Wort'}];s.vocab.m={en:'word'};});
  const local=copy(remote);edit(local,s=>{s.vocabDiscovery.manual=[];delete s.vocab.m;},1800000000100);
  const merged=Sync.merge(local,remote);
  assert.deepEqual(merged.vocabDiscovery.manual,[]);assert.equal(merged.vocab.m,undefined);
  assert.deepEqual(Sync.merge(remote,merged).vocabDiscovery.manual,[]);
});
test('restoring an excluded word and removing an included word sync correctly',()=>{
  const remote=edit(base(),s=>{s.vocabDiscovery.excluded=['w'];s.vocabDiscovery.included=['x'];});
  const local=copy(remote);edit(local,s=>{s.vocabDiscovery.excluded=[];s.vocabDiscovery.included=[];},1800000000100);
  const merged=Sync.merge(local,remote);
  assert.deepEqual(merged.vocabDiscovery.excluded,[]);assert.deepEqual(merged.vocabDiscovery.included,[]);
});
test('independent exercises and contribution days are preserved',()=>{
  const local=edit(base(),s=>{s.completed.a=true;s.events['2026-11-18']={sections:['Reading'],items:['a']};});
  const remote=edit(base(),s=>{s.completed.b=true;s.events['2026-11-18']={sections:['Listening'],items:['b']};});
  const merged=Sync.merge(local,remote);
  assert.equal(merged.completed.a,true);assert.equal(merged.completed.b,true);
  assert.deepEqual(merged.events['2026-11-18'].sections,['Listening','Reading']);
});
test('navigation does not create study revisions',()=>{
  const s=base(),before=Sync.capture(s);s.last.page='settings';
  assert.equal(Sync.stamp(s,before).changed,false);
});
test('two edits in the same millisecond still have increasing revisions',()=>{
  const s=edit(base(),s=>s.completed.a=true,1800000000000),first=s.revisions.completed.a;
  edit(s,s=>s.completed.a=false,1800000000000);
  assert.ok(s.revisions.completed.a>first);
});
test('merges do not mutate either input and converge',()=>{
  const a=edit(base(),s=>s.completed.a=true),b=edit(base(),s=>s.answers.b={text:'Hallo'});
  const beforeA=copy(a),beforeB=copy(b);
  const ab=Sync.merge(a,b),ba=Sync.merge(b,a);
  assert.deepEqual(a,beforeA);assert.deepEqual(b,beforeB);
  assert.equal(Sync.signature(ab),Sync.signature(ba));
  assert.equal(Sync.signature(Sync.merge(ab,ba)),Sync.signature(ab));
});

test('independent answers in the same activity merge without losing either result',()=>{
  const a=base(),b=base();
  a.answers.a={lines:['eins',''],lineUpdatedAt:[1800000000000,0],check:{total:2,score:1,results:[true,null],checkedValues:['eins',null],checkedAtByField:['2027-01-15T08:00:00.000Z',null]}};
  b.answers.a={lines:['','zwei'],lineUpdatedAt:[0,1800000000100],check:{total:2,score:1,results:[null,true],checkedValues:[null,'zwei'],checkedAtByField:[null,'2027-01-15T08:00:00.100Z']}};
  const merged=Sync.merge(a,b),reverse=Sync.merge(b,a);
  assert.deepEqual(merged.answers.a.lines,['eins','zwei']);assert.deepEqual(merged.answers.a.check.results,[true,true]);
  assert.equal(merged.completed.a,true,'Complementary checked answers complete the activity');
  assert.equal(Sync.signature(merged),Sync.signature(reverse));
});
test('a newer edit clears only its own result during merging',()=>{
  const remote=base();remote.answers.a={lines:['eins','zwei'],lineUpdatedAt:[1800000000000,1800000000000],check:{results:[true,true],score:2,total:2,checkedValues:['eins','zwei']}};
  const local=copy(remote);local.answers.a.lines[0]='new draft';local.answers.a.lineUpdatedAt[0]=1800000000100;
  local.answers.a.check={results:[null,true],score:1,total:2,checkedValues:[null,'zwei']};
  const answer=Sync.merge(local,remote).answers.a;
  assert.deepEqual(answer.lines,['new draft','zwei']);assert.deepEqual(answer.check.results,[null,true]);
});

test('a manual unmark of fully checked answers survives per-question merging',()=>{
  const remote=base();remote.answers.a={lines:['eins'],lineUpdatedAt:[1800000000000],check:{results:[true],score:1,total:1,checkedValues:['eins']}};
  edit(remote,s=>s.completed.a=true,1800000000000);
  const local=copy(remote);edit(local,s=>s.completed.a=false,1800000000100);
  assert.equal(Sync.merge(local,remote).completed.a,false);
});
