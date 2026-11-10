const {app,BrowserWindow,dialog,session,ipcMain,clipboard,shell}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
let backend,window;
if(!app.requestSingleInstanceLock())app.quit();
else{
app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
app.whenReady().then(async()=>{
 const tools=app.isPackaged?path.join(process.resourcesPath,'tools'):path.join(__dirname,'..','tools');
 process.env.YTDLP_PATH=path.join(tools,'yt-dlp.exe');
 process.env.FFMPEG_PATH=path.join(tools,'ffmpeg.exe');
 process.env.YOUMP3_NODE=path.join(tools,'node.exe');
 process.env.YOUMP3_SEARCH_PLUGINS=app.isPackaged?path.join(process.resourcesPath,'search-plugins'):path.join(__dirname,'..','search-plugins');
 process.env.YOUMP3_DOWNLOADS=path.join(app.getPath('userData'),'audio');
 process.env.YOUMP3_EXPORTS=app.getPath('downloads');
 process.env.PORT='0';
 backend=await import(pathToFileURL(path.join(__dirname,'..','server.mjs')).href);
 const port=await backend.listening,origin=`http://127.0.0.1:${port}`;
 session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 session.defaultSession.on('will-download',(_event,item)=>{
  item.setSaveDialogOptions({defaultPath:path.join(app.getPath('downloads'),item.getFilename())});
 });
 window=new BrowserWindow({width:1160,height:900,minWidth:640,minHeight:680,title:'YouMP3',backgroundColor:'#101210',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
 const trusted=event=>{if(event.sender!==window.webContents||event.senderFrame.url.split('/').slice(0,3).join('/')!==origin)throw new Error('Недопустимый источник');};
 require('./updates.cjs')(app,ipcMain,trusted,backend);
 ipcMain.handle('choose-folder',async event=>{trusted(event);const result=await dialog.showOpenDialog(window,{properties:['openDirectory','createDirectory'],defaultPath:backend.settings.folder||app.getPath('downloads')});if(!result.canceled)await backend.setFolder(result.filePaths[0]);return backend.settings;});
 ipcMain.handle('clipboard-read',event=>{trusted(event);return clipboard.readText();});
 ipcMain.handle('clipboard-write',(event,text)=>{trusted(event);clipboard.writeText(String(text).slice(0,4096));});
 ipcMain.handle('open-source',async(event,value)=>{trusted(event);const u=new URL(String(value));if(u.protocol!=='https:'||!['www.youtube.com','youtube.com','soundcloud.com','www.soundcloud.com'].includes(u.hostname)||u.username||u.password||u.port)throw new Error('Недопустимая ссылка');await shell.openExternal(u.href);});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 window.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin)event.preventDefault();});
 await window.loadURL(origin);
}).catch(error=>{dialog.showErrorBox('YouMP3',error.message);app.quit();});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{backend?.stopWorkers();backend?.server.close();});
}
