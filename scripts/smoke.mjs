import {spawn} from 'node:child_process';
import path from 'node:path';
const root=process.cwd(),port='3217';
const child=spawn(path.join(root,'tools/node.exe'),['server.mjs'],{cwd:root,windowsHide:true,env:{...process.env,PORT:port,PATH:process.env.SystemRoot+'\\System32',YTDLP_PATH:path.join(root,'tools/yt-dlp.exe'),FFMPEG_PATH:path.join(root,'tools/ffmpeg.exe'),YOUMP3_NODE:path.join(root,'tools/node.exe'),YOUMP3_DOWNLOADS:path.join(root,'downloads','smoke')}});
child.stderr.on('data',b=>process.stderr.write(b));
async function api(route,options){const res=await fetch(`http://127.0.0.1:${port}${route}`,options);const data=await res.json();if(!res.ok)throw new Error(JSON.stringify(data));return data;}
try{
 for(let i=0;i<40;i++){try{await api('/api/jobs');break}catch{await new Promise(r=>setTimeout(r,250));}}
 const health=await api('/api/health');console.log('Bundled tools with system-only PATH:',health);if(!health.ready)throw new Error('Missing tools');
 for(const [service,url]of [['youtube','https://www.youtube.com/watch?v=jNQXAC9IVRw'],['soundcloud','https://soundcloud.com/forss/flickermood']]){
  const {id}=await api('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,service,format:'mp3',quality:'192',force:true})});
  let done=false;for(let i=0;i<240;i++){const j=(await api('/api/jobs')).find(j=>j.id===id);if(j.status==='error')throw new Error(`${service}: ${j.error}`);if(j.status==='done'){const res=await fetch(`http://127.0.0.1:${port}/api/files/${id}`);const bytes=await res.arrayBuffer();if(res.status!==200||bytes.byteLength<1000)throw new Error('Invalid download');console.log(`${service}: ${j.title}, ${bytes.byteLength} bytes, HTTP ${res.status}`);done=true;break;}await new Promise(r=>setTimeout(r,1000));}
  if(!done)throw new Error(service+': timed out');
 }
}finally{child.kill();}
