/* Revision-aware progress merging. No browser or network dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SpektrumSync = api;
})(globalThis, function () {
  'use strict';
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  function stable(value) {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
    return JSON.stringify(value);
  }
  const timestamp = value => {
    if (!value) return 0;
    const n = typeof value === 'number' ? value : Date.parse(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  function groups(s) {
    const discovery = Object.create(null), manual = Object.create(null);
    for (const id of s.vocabDiscovery?.included || []) discovery[id] = 'include';
    for (const id of s.vocabDiscovery?.excluded || []) discovery[id] = 'exclude';
    for (const item of s.vocabDiscovery?.manual || []) manual[item.id] = item;
    return { completed: s.completed || {}, answers: s.answers || {}, vocab: s.vocab || {},
      words: s.learningDB?.words || {}, discovery, manual };
  }
  function capture(s) {
    return Object.fromEntries(Object.entries(groups(s)).map(([name, records]) =>
      [name, Object.fromEntries(Object.entries(records).map(([id, value]) => [id, stable(value)]))]));
  }
  function stamp(s, previous, now = Date.now()) {
    const current = capture(s);
    s.revisions = s.revisions || {};
    const latest = Math.max(0, ...Object.values(s.revisions).flatMap(g => Object.values(g || {}).map(timestamp)));
    const tick = Math.max(timestamp(now), latest + 1);
    let changed = false;
    for (const [name, records] of Object.entries(current)) {
      const before = previous?.[name] || {};
      const revisions = s.revisions[name] || (s.revisions[name] = {});
      for (const id of new Set([...Object.keys(before), ...Object.keys(records)])) {
        if (before[id] !== records[id]) { revisions[id] = tick; changed = true; }
      }
    }
    return { baseline: current, changed, updatedAt: changed ? tick : latest };
  }
  function recordTime(s, name, id, value) {
    const rev = timestamp(s.revisions?.[name]?.[id]);
    if (name === 'answers') return Math.max(rev, timestamp(value?.savedAt), timestamp(value?.check?.checkedAt));
    if (name === 'vocab') return Math.max(rev, timestamp(value?.updatedAt), timestamp(value?.last));
    if (name === 'words') return Math.max(rev, timestamp(value?.fullRecallAt), timestamp(value?.updatedAt));
    return rev;
  }
  function mergeGroup(local, remote, name, legacy) {
    const a = groups(local)[name], b = groups(remote)[name], out = Object.create(null);
    const ids = new Set([...Object.keys(a), ...Object.keys(b), ...Object.keys(local.revisions?.[name] || {}), ...Object.keys(remote.revisions?.[name] || {})]);
    for (const id of ids) {
      const at = recordTime(local, name, id, a[id]), bt = recordTime(remote, name, id, b[id]);
      let value;
      if (at !== bt) value = at > bt ? a[id] : b[id];
      else if (at && (!own(a, id) || !own(b, id))) value = undefined; // A deletion wins an exact tie.
      else if (!own(a, id)) value = b[id];
      else if (!own(b, id)) value = a[id];
      else if (!at && legacy) value = legacy(a[id], b[id]);
      else value = stable(a[id]) >= stable(b[id]) ? a[id] : b[id];
      if (value !== undefined) out[id] = clone(value);
    }
    return out;
  }
  const union = (a, b) => [...new Set([...(a || []), ...(b || [])])].sort();
  function mergePartialAnswer(a,b,base) {
    if(!Array.isArray(a?.lines)||!Array.isArray(b?.lines)||(!Array.isArray(a.lineUpdatedAt)&&!Array.isArray(b.lineUpdatedAt)))return base;
    const total=Math.max(a.lines.length,b.lines.length),next=clone(base);
    const candidate=(record,i)=>{
      const value=String(record.lines[i]??''),check=record.check||{};
      const checked=value.trim()!==''&&typeof check.results?.[i]==='boolean'&&String(check.checkedValues?.[i]??record.lines[i]??'')===value;
      const checkedAt=checked?timestamp(check.checkedAtByField?.[i]||check.checkedAt):0;
      const editedAt=Array.isArray(record.lineUpdatedAt)?timestamp(record.lineUpdatedAt[i]):timestamp(record.savedAt);
      return {value,result:checked?check.results[i]:null,checkedAt,time:Math.max(editedAt,checkedAt)};
    };
    const selected=Array.from({length:total},(_,i)=>{
      const left=candidate(a,i),right=candidate(b,i);
      return left.time===right.time?(stable(left)>=stable(right)?left:right):(left.time>right.time?left:right);
    });
    next.lines=selected.map(field=>field.value);next.lineUpdatedAt=selected.map(field=>field.time);
    const results=selected.map(field=>field.result),checkedCount=results.filter(value=>value!==null).length;
    if(checkedCount){
      const checkedAtByField=selected.map(field=>field.result===null?null:new Date(field.checkedAt||field.time||0).toISOString());
      next.check={results,checkedCount,total,score:results.filter(value=>value===true).length,
        checkedValues:selected.map(field=>field.result===null?null:field.value),checkedAtByField,
        checkedAt:checkedAtByField.filter(Boolean).sort().pop()};
    }else delete next.check;
    return next;
  }
  function merge(local, remote) {
    const out = clone(local);
    out.schema = 3;
    out.revisions = {};
    for (const name of Object.keys(groups(local))) {
      out.revisions[name] = {};
      for (const id of union(Object.keys(local.revisions?.[name] || {}), Object.keys(remote.revisions?.[name] || {}))) {
        out.revisions[name][id] = Math.max(timestamp(local.revisions?.[name]?.[id]), timestamp(remote.revisions?.[name]?.[id]));
      }
    }
    out.completed = mergeGroup(local, remote, 'completed', (a, b) => !!(a || b));
    out.answers = mergeGroup(local, remote, 'answers', (a, b) => {
      const score = r => Number.isFinite(r?.check?.score) ? r.check.score : -1;
      return score(a) === score(b) ? (stable(a) >= stable(b) ? a : b) : (score(a) > score(b) ? a : b);
    });
    for(const id of Object.keys(out.answers)) {
      const a=local.answers?.[id],b=remote.answers?.[id];
      if(a&&b){
        out.answers[id]=mergePartialAnswer(a,b,out.answers[id]);
        const perfect=record=>record.check?.total>0&&record.check.score===record.check.total;
        // Combining complementary checked answers can finish an activity. Preserve
        // an explicit unmark when either source already had all answers correct.
        if(perfect(out.answers[id])&&!perfect(a)&&!perfect(b)){
          out.completed[id]=true;
          out.revisions.completed[id]=Math.max(recordTime(local,'answers',id,a),recordTime(remote,'answers',id,b),timestamp(local.revisions?.completed?.[id]),timestamp(remote.revisions?.completed?.[id]));
        }
      }
    }
    out.vocab = mergeGroup(local, remote, 'vocab', (a, b) => {
      return (+a.reviews || 0) === (+b.reviews || 0) ? (stable(a) >= stable(b) ? a : b) : ((+a.reviews || 0) > (+b.reviews || 0) ? a : b);
    });
    out.learningDB = { words: mergeGroup(local, remote, 'words') };
    for (const [id, value] of Object.entries(out.learningDB.words)) {
      const a = local.learningDB?.words?.[id], b = remote.learningDB?.words?.[id];
      if (!a || !b) continue;
      for (const key of ['fullRecallCorrect', 'fullRecallWrong', 'missingCorrect', 'missingWrong', 'contextCorrect', 'contextWrong', 'articleCorrect', 'articleWrong']) value[key] = Math.max(+a[key] || 0, +b[key] || 0);
      value.fullRecallDates = union(a.fullRecallDates, b.fullRecallDates);
      value.correctDates = union(a.correctDates, b.correctDates);
      // A later article/context test must not replace a newer full-recall result.
      const at = timestamp(a.fullRecallAt) || recordTime(local, 'words', id, a);
      const bt = timestamp(b.fullRecallAt) || recordTime(remote, 'words', id, b);
      const result = at > bt ? a : bt > at ? b : (a.lastFullRecallResult === 'wrong' ? a : b.lastFullRecallResult === 'wrong' ? b : a);
      value.lastFullRecallResult = result.lastFullRecallResult || null;
      if (result.fullRecallAt) value.fullRecallAt = result.fullRecallAt;
    }
    out.events = {};
    for (const day of union(Object.keys(local.events || {}), Object.keys(remote.events || {}))) {
      out.events[day] = { sections: union(local.events?.[day]?.sections, remote.events?.[day]?.sections), items: union(local.events?.[day]?.items, remote.events?.[day]?.items) };
    }
    out.vocabExposure = {};
    for (const source of ['review', 'study', 'test', 'book']) out.vocabExposure[source] = union(local.vocabExposure?.[source], remote.vocabExposure?.[source]);
    const choices = mergeGroup(local, remote, 'discovery', (a, b) => a === 'exclude' || b === 'exclude' ? 'exclude' : 'include');
    out.vocabDiscovery = {
      included: Object.keys(choices).filter(id => choices[id] === 'include').sort(),
      excluded: Object.keys(choices).filter(id => choices[id] === 'exclude').sort(),
      manual: Object.values(mergeGroup(local, remote, 'manual')).sort((a, b) => a.id.localeCompare(b.id))
    };
    return out;
  }
  function signature(s) {
    // Navigation and appearance belong to the current device, not to study progress.
    const { completed, answers, vocab, learningDB, vocabDiscovery, vocabExposure, events, revisions } = s;
    return stable({ completed, answers, vocab, learningDB, vocabDiscovery, vocabExposure, events, revisions });
  }
  return { capture, stamp, merge, signature };
});
