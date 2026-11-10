// Only explicit declarations are accepted. Conflicting values stay unresolved.
const noteNames={c:'C',d:'D',e:'E',f:'F',g:'G',a:'A',b:'B','до':'C','ре':'D','ми':'E','фа':'F','соль':'G','ля':'A','си':'B'};
const flats={Db:'C#','D#':'Eb',Gb:'F#','G#':'Ab','A#':'Bb',Cb:'B','B#':'C',Fb:'E','E#':'F'};
const note='(соль|до|ре|ми|фа|ля|си|[a-g])';
const accidental='(?:\\s*(диез|бемоль|sharp|flat|[#♯b♭]))?';
const mode='(minor|major|минор|мажор|min|maj|m)';
function keyValue(m){const base=noteNames[m[1].toLowerCase()],acc=(m[2]||'').toLowerCase();const spelling=base+(/^(#|♯|sharp|диез)$/.test(acc)?'#':acc?'b':'');return {key:flats[spelling]||spelling,...(m[3]?{scale:/^(minor|min|минор|m)$/.test(m[3].toLowerCase())?'minor':'major'}:{})};}
export function descriptionMusic(description){
 const text=String(description||'').slice(0,60000).normalize('NFKC').replace(/[–—]/g,'-');
 const bpms=[],keys=[];
 for(const pattern of [/(?:\bbpm\b|\btempo\b|темп)\s*[:=\-]?\s*(\d{2,3}(?:[.,]\d{1,2})?)(?![\d.,])/gi,/(?<![\d.,])(\d{2,3}(?:[.,]\d{1,2})?)\s*bpm\b/gi]){
  for(const m of text.matchAll(pattern)){const value=Number(m[1].replace(',','.'));if(value>=20&&value<=400)bpms.push({value,evidence:m[0].trim()});}
 }
 const labelled=new RegExp('(?:\\bkey\\b|тональность)\\s*[:=\\-]?\\s*'+note+accidental+'\\s*'+mode+'?(?![\\p{L}#♯♭])','giu');
 const explicit=new RegExp('(?<![\\p{L}\\d])'+note+accidental+'\\s*'+mode+'(?![\\p{L}])','giu');
 for(const pattern of [labelled,explicit])for(const m of text.matchAll(pattern)){if(pattern===explicit&&m[3]?.toLowerCase()==='m'&&!m[2]&&(m[1]===m[1].toLowerCase()||m[3]==='M'))continue;keys.push({...keyValue(m),evidence:m[0].trim()});}
 const result={source:'description'},conflicts=[];
 const tempos=[...new Set(bpms.map(x=>x.value))];if(tempos.length===1){result.bpm=tempos[0];result.bpmEvidence=bpms[0].evidence;}else if(tempos.length>1)conflicts.push('bpm');
 const notes=[...new Set(keys.map(x=>x.key))],scales=[...new Set(keys.map(x=>x.scale).filter(Boolean))];
 if(notes.length===1&&scales.length<=1){result.key=notes[0];if(scales.length)result.scale=scales[0];result.keyEvidence=(keys.find(x=>x.scale)||keys[0]).evidence;}else if(notes.length>1||scales.length>1)conflicts.push('key');
 if(conflicts.length)result.conflicts=conflicts;
 return result;
}
export function resolvedMusic(job){
 const manual=job.manualAnalysis||{},declared=job.descriptionAnalysis||{},algorithm=job.analysis||{};
 const bpm=manual.bpm??declared.bpm??algorithm.bpm;
 // Never combine a declared note with the algorithm's mode for another note.
 const keySource=manual.key?manual:declared.key?declared:algorithm;
 return {bpm,key:keySource.key,scale:keySource.scale,bpmSource:manual.bpm?'manual':declared.bpm?'description':algorithm.bpm?'algorithm':null,keySource:keySource===manual?'manual':keySource===declared?'description':keySource.key?'algorithm':null};
}
