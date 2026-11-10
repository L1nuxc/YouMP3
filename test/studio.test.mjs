import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,rm,readdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {safeName,rangeHeader} from '../src/media.mjs';
import {encodeArgs} from '../src/options.mjs';
test('safe filenames and byte ranges',()=>{assert.equal(safeName('A/B: C?.','mp3'),'A_B_ C_.mp3');assert.equal(safeName('CON','wav'),'_CON.wav');assert.deepEqual(rangeHeader('bytes=5-9',10),{start:5,end:9});assert.deepEqual(rangeHeader('bytes=-3',10),{start:7,end:9});assert.equal(rangeHeader('bytes=10-',10),null);});
test('stream seeking, tags, favorites, duplicate protection, trim queue and automatic export',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'yoump3-studio-')),ffmpeg=path.resolve('tools/ffmpeg.exe'),id='11111111-1111-1111-1111-111111111111';let child;
 try{await mkdir(path.join(dir,id));await mkdir(path.join(dir,'exports'));const file=path.join(dir,id,'audio.mp3');execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','sine=frequency=440:duration=8','-c:a','libmp3lame',file],{windowsHide:true});const size=(await stat(file)).size;
 await writeFile(path.join(dir,'library.json'),JSON.stringify([{id,title:'Track',artist:'Artist',track:'Track',file:'audio.mp3',format:'mp3',quality:'192',duration:8,size,status:'done',created:1,url:'https://www.youtube.com/watch?v=jNQXAC9IVRw',service:'youtube'}]));
 await writeFile(path.join(dir,'settings.json'),JSON.stringify({metadata:true,cover:false,folder:path.join(dir,'exports')}));
 child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'0',YOUMP3_DOWNLOADS:dir,FFMPEG_PATH:ffmpeg,YTDLP_PATH:path.resolve('tools/yt-dlp.exe')},windowsHide:true});
 const origin=await new Promise((resolve,reject)=>{child.stdout.on('data',b=>{const m=b.toString().match(/127.0.0.1:(\d+)/);if(m)resolve('http://127.0.0.1:'+m[1]);});child.once('exit',()=>reject(new Error('Server exited')));});
 const post=(route,b={})=>fetch(origin+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
 const range=await fetch(origin+'/api/stream/'+id,{headers:{Range:'bytes=100-199'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,100);assert.equal(range.headers.get('content-range'),`bytes 100-199/${size}`);
 const invalid=await fetch(origin+'/api/stream/'+id,{headers:{Range:'bytes=999999999-'}});assert.equal(invalid.status,416);
 assert.equal((await post('/api/edit/'+id,{favorite:true,tags:['beats','beats','recording']})).status,200);
 assert.equal((await post('/api/correct/'+id,{bpm:148,key:'Eb',scale:'minor'})).status,200);
 assert.equal((await post('/api/correct/'+id,{bpm:999,key:'Eb',scale:'minor'})).status,400);
 assert.equal((await post('/api/metadata/'+id,{title:'Track',artist:'Artist',album:'Album'})).status,200);
 const edited=(await(await fetch(origin+'/api/jobs')).json()).find(j=>j.id===id);assert.equal(edited.manualAnalysis.bpm,148);assert.equal(edited.album,'Album');assert.equal(edited.editing,false);
 const dupe=await post('/api/jobs',{url:'https://youtu.be/jNQXAC9IVRw',service:'youtube',format:'mp3',quality:'192'});assert.equal(dupe.status,409);assert.equal((await dupe.json()).duplicateId,id);
 assert.equal((await post('/api/trim/'+id,{start:5,end:2})).status,400);
 const trimmed=await(await post('/api/trim/'+id,{start:1,end:3})).json();let job;for(let i=0;i<80;i++){job=(await(await fetch(origin+'/api/jobs')).json()).find(j=>j.id===trimmed.id);if(['done','error'].includes(job?.status))break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(job.status,'done',job.error);assert.equal(job.duration,2);assert.ok(job.exported.endsWith('Artist — Track (фрагмент).mp3'));assert.ok((await stat(job.exported)).size>1000);
 const out=execFileSync(ffmpeg,['-hide_banner','-i',job.exported,'-f','null','-'],{windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const jobs=await(await fetch(origin+'/api/jobs')).json();assert.equal(jobs.find(j=>j.id===id).favorite,true);assert.deepEqual(jobs.find(j=>j.id===id).tags,['beats','recording']);
 const first=await(await post('/api/jobs',{url:'https://youtu.be/jNQXAC9IVRw',service:'youtube',format:'mp3',quality:'192',force:true})).json();const second=await(await post('/api/jobs',{url:'https://youtu.be/BaW_jenozKc',service:'youtube',format:'mp3',quality:'192'})).json();assert.ok(first.id&&second.id);
 assert.equal((await post('/api/cancel/'+second.id)).status,200);await post('/api/cancel/'+first.id);await new Promise(r=>setTimeout(r,150));const canceled=(await(await fetch(origin+'/api/jobs')).json()).find(j=>j.id===second.id);assert.equal(canceled.status,'canceled');
 }finally{if(child)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});await rm(dir,{recursive:true,force:true});}
});
test('metadata and cover encoding in MP3, M4A, FLAC; no attachment when disabled',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'yoump3-cover-')),ffmpeg=path.resolve('tools/ffmpeg.exe');try{
 const source=path.join(dir,'source.wav'),cover=path.join(dir,'cover.jpg');execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','sine=duration=1',source],{windowsHide:true});execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','color=c=red:s=64x64','-frames:v','1',cover],{windowsHide:true});
 for(const format of ['mp3','m4a','flac']){const output=path.join(dir,'out.'+format);execFileSync(ffmpeg,encodeArgs({format,quality:format==='flac'?'16':'192',title:'Test title',artist:'Test artist',album:'Test album',settings:{metadata:true},coverPath:cover},source,output),{windowsHide:true});const stderr=spawnSync(ffmpeg,['-hide_banner','-i',output],{windowsHide:true,encoding:'utf8'}).stderr;assert.match(stderr,/Test artist/);assert.match(stderr,/Test title/);assert.match(stderr,/attached pic/);
 const clean=path.join(dir,'clean.'+format);execFileSync(ffmpeg,encodeArgs({format,quality:format==='flac'?'16':'192',settings:{metadata:false,cover:false},coverPath:cover},output,clean),{windowsHide:true});const cleaned=spawnSync(ffmpeg,['-hide_banner','-i',clean],{windowsHide:true,encoding:'utf8'}).stderr;assert.doesNotMatch(cleaned,/Test artist|Test title|attached pic/);}
 }finally{await rm(dir,{recursive:true,force:true});}
});
