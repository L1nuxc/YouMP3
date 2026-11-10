import path from 'node:path';
export function validate(input){
 let url;try{url=new URL(input.url)}catch{throw new Error('Вставьте корректную ссылку YouTube или SoundCloud.')}
 const soundcloud=['soundcloud.com','www.soundcloud.com','m.soundcloud.com','on.soundcloud.com'].includes(url.hostname);
 if(url.protocol!=='https:'||(!soundcloud&&!['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be'].includes(url.hostname))||url.username||url.password||url.port)throw new Error('Поддерживаются только HTTPS-ссылки YouTube и SoundCloud.');
 const service=soundcloud?'soundcloud':'youtube';
 if(input.service&&input.service!==service)throw new Error('Ссылка относится к другой вкладке. Выберите '+(soundcloud?'SoundCloud':'YouTube')+'.');
 let canonical;
 if(soundcloud){
  const parts=url.pathname.split('/').filter(Boolean);
  if(url.hostname==='on.soundcloud.com' ? !/^[a-zA-Z0-9]+$/.test(parts[0]||'')||parts.length!==1 : !/^[\w-]+$/.test(parts[0]||'')||!/^[\w-]+$/.test(parts[1]||'')||!['2','3'].includes(String(parts.length))||['sets','likes','reposts','tracks','albums','popular-tracks'].includes(parts[1])||(parts[2]&&!/^s-[\w]+$/.test(parts[2])))throw new Error('Нужна ссылка на отдельный трек SoundCloud, а не профиль или плейлист.');
  canonical=url.origin+url.pathname;
 }else{
 const id=url.hostname==='youtu.be'?url.pathname.slice(1):url.pathname==='/watch'?url.searchParams.get('v'):url.pathname.match(/^\/(?:shorts|live)\/([^/]+)$/)?.[1];
 if(!/^[\w-]{11}$/.test(id||''))throw new Error('Нужна ссылка на отдельное видео, Shorts или запись трансляции.');
 canonical=`https://www.youtube.com/watch?v=${id}`;
 }
 const format=input.format,quality=String(input.quality);
 const allowed={mp3:['128','192','256','320'],wav:['16','24'],flac:['16','24'],m4a:['128','192','256'],opus:['96','128','192']};
 if(!allowed[format]?.includes(quality))throw new Error('Недопустимый формат или качество.');
 return {url:canonical,service,format,quality};
}
export function conversionArgs(job,dir){
 const args=['--ignore-config','--js-runtimes',process.env.YOUMP3_NODE ? 'node:'+process.env.YOUMP3_NODE : 'node','--no-playlist','--playlist-items','1','--newline','--no-colors','--socket-timeout','30','--retries','3','-f','bestaudio/best','--progress-template','download:download:%(progress._percent_str)s','-o',path.join(dir,'source.%(ext)s')];
 if(process.env.FFMPEG_PATH)args.push('--ffmpeg-location',path.dirname(process.env.FFMPEG_PATH));
 args.push('--',job.url);return args;
}
export function encodeArgs(job,source,output){
 const codecs={ogg:'libvorbis',mp3:'libmp3lame',m4a:'aac',opus:'libopus',flac:'flac',wav:job.quality==='24'?'pcm_s24le':'pcm_s16le'};
 const args=['-nostdin','-hide_banner','-loglevel','error','-y','-i',source];
 if(job.coverPath&&job.settings?.cover!==false&&['mp3','m4a','flac'].includes(job.format))args.push('-i',job.coverPath,'-map','0:a:0','-map','1:v:0','-c:v','mjpeg','-disposition:v:0','attached_pic');else args.push('-vn');
 if(job.trim)args.push('-ss',String(job.trim.start),'-t',String(job.trim.end-job.trim.start));
 args.push('-map_metadata','-1','-c:a',codecs[job.format]);
 if(job.settings?.metadata){for(const [tag,value]of Object.entries({title:job.track||job.title,artist:job.artist,album:job.album,comment:job.url})){if(value)args.push('-metadata',tag+'='+value);}}
 if(job.format==='flac')args.push('-sample_fmt',job.quality==='24'?'s32':'s16');
 else if(job.format!=='wav')args.push('-b:a',job.quality+'k');
 args.push(output);return args;
}
