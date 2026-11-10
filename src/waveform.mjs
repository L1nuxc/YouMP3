import {spawn} from 'node:child_process';
import {terminateProcess} from './process.mjs';
export function waveform(binary,file,duration,children){return new Promise((resolve,reject)=>{
 const peaks=new Array(900).fill(0);let samples=0,carry=Buffer.alloc(0),error='';
 const p=spawn(binary,['-nostdin','-v','error','-i',file,'-vn','-ac','1','-ar','4000','-f','f32le','pipe:1'],{windowsHide:true,shell:false});children.add(p);
 const timer=setTimeout(()=>{terminateProcess(p);reject(new Error('Не удалось построить волну за 60 секунд.'));},60000);
 p.stdout.on('data',chunk=>{const b=Buffer.concat([carry,chunk]),end=b.length-b.length%4;for(let i=0;i<end;i+=4){const bin=Math.min(899,Math.floor(samples++/(duration*4000)*900));peaks[bin]=Math.max(peaks[bin],Math.abs(b.readFloatLE(i)));}carry=b.subarray(end);});p.stderr.on('data',b=>error=(error+b).slice(-1000));p.on('error',e=>{clearTimeout(timer);children.delete(p);reject(e);});p.on('close',code=>{clearTimeout(timer);children.delete(p);if(code!==0)return reject(new Error(error||'Не удалось прочитать аудио.'));const max=Math.max(...peaks)||1;resolve({duration,peaks:peaks.map(v=>Math.round(Math.sqrt(v/max)*1000)/1000)});});
});}
