const {autoUpdater}=require('electron-updater');
module.exports=function(app,ipcMain,trusted,backend){
 let state={status:app.isPackaged?'idle':'development',version:app.getVersion(),message:app.isPackaged?'':'Обновления доступны в установленной EXE-версии.'};let busy=false;
 const set=(status,data={})=>state={...state,status,...data};
 autoUpdater.autoDownload=true;autoUpdater.autoInstallOnAppQuit=false;
 autoUpdater.on('checking-for-update',()=>set('checking',{message:'Проверяем новую версию…'}));
 autoUpdater.on('update-available',info=>set('downloading',{next:info.version,message:'Скачиваем обновление…'}));
 autoUpdater.on('download-progress',p=>set('downloading',{percent:Math.round(p.percent)}));
 autoUpdater.on('update-not-available',()=>set('current',{message:'Установлена последняя версия.'}));
 autoUpdater.on('update-downloaded',info=>set('ready',{next:info.version,message:'Обновление готово. Можно установить и перезапустить.'}));
 autoUpdater.on('error',()=>set('error',{message:'Не удалось проверить или скачать обновление. Проверьте интернет и наличие опубликованного релиза.'}));
 async function check(){if(!app.isPackaged||busy||['downloading','ready'].includes(state.status))return;busy=true;try{await autoUpdater.checkForUpdates();}catch{}finally{busy=false;}}
 ipcMain.handle('updates-state',event=>{trusted(event);return state;});
 ipcMain.handle('updates-check',async event=>{trusted(event);await check();return state;});
 ipcMain.handle('updates-install',event=>{trusted(event);if(state.status!=='ready')return {error:'Обновление ещё не скачано.'};if(backend.isBusy())return {error:'Дождитесь завершения задач и анализа, затем повторите установку.'};setImmediate(()=>autoUpdater.quitAndInstall(false,true));return {ok:true};});
 const first=setTimeout(check,10000);first.unref();const timer=setInterval(check,7200000);timer.unref();
};
