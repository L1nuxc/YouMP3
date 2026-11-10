import {spawn} from 'node:child_process';
export function terminateProcess(child){if(!child?.pid||child.exitCode!==null)return;if(process.platform==='win32'){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,shell:false,stdio:'ignore'});killer.on('error',()=>child.kill());}else child.kill();}
