import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run=promisify(execFile);
const dir=path.resolve('output/mobile-transformation/android');fs.mkdirSync(dir,{recursive:true});
const build=JSON.parse(fs.readFileSync('output/mobile-transformation/android-build.json','utf8'));
const apk=path.join(dir,'Supplify-dev-ui-2026-11-15.apk');
const mode=process.argv[2]??'capture';
const adb='C:/Users/ghadi.mdallal/AppData/Local/Microsoft/WinGet/Packages/Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe/platform-tools/adb.exe';
const device=['-s','emulator-5554'];
const execute=async(bin,args,options={})=>(await run(bin,args,{windowsHide:true,maxBuffer:12*1024*1024,...options})).stdout;
if(mode==='download'){
 if(build.status!=='FINISHED'||!build.artifact)throw Error('Build not finished');
 const url=new URL(build.artifact);if(url.protocol!=='https:'||!['expo.dev','www.expo.dev','expo.io'].some(host=>url.hostname===host||url.hostname.endsWith('.'+host)))throw Error('Unexpected Expo artifact host');
 const response=await fetch(url);if(!response.ok)throw Error('Download failed '+response.status);
 const data=Buffer.from(await response.arrayBuffer());if(data.length<1024*1024||data.readUInt32LE(0)!==0x04034b50)throw Error('Not an APK archive');
 fs.writeFileSync(apk,data);const sha256=crypto.createHash('sha256').update(data).digest('hex');fs.writeFileSync(apk+'.sha256',sha256+'  '+path.basename(apk)+'\n');
 const aapt='C:/Users/ghadi.mdallal/AppData/Local/Android/Sdk/build-tools/36.0.0/aapt.exe';
 const badging=await execute(aapt,['dump','badging',apk]);fs.writeFileSync(path.join(dir,'apk-badging.txt'),badging);
 if(!badging.includes("name='com.supplify.mobile'")||!badging.includes("versionCode='27'"))throw Error('Unexpected app identity');
 const python='C:/Users/ghadi.mdallal/AppData/Local/Programs/Python/Python313/python.exe';
 const inspection=JSON.parse(await execute(python,['-c',`import zipfile,sys,json
z=zipfile.ZipFile(sys.argv[1])
bundles=[n for n in z.namelist() if n.endswith('.bundle') or n.endswith('.hbc')]
data=b''.join(z.read(n) for n in bundles)
print(json.dumps({'bundles':bundles,'devApi':b'https://api-dev.supplifyerp.com' in data,'devIdentity':b'https://keycloak-dev.supplifyerp.com' in data,'excludedNativeLibraries':[n for n in z.namelist() if n.endswith('.so') and ('reanimated' in n.lower() or 'worklets' in n.lower())]}))`,apk]));
 if(!inspection.devApi||!inspection.devIdentity||inspection.excludedNativeLibraries.length)throw Error('Unexpected bundled environment or animation native libraries');
 const record={buildId:build.id,apk,bytes:data.length,sha256,package:'com.supplify.mobile',version:'1.1.0',versionCode:27,api:build.api,inspection};
 fs.writeFileSync(path.join(dir,'artifact.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));
}else if(mode==='install'){
 if(!fs.existsSync(apk))throw Error('No APK');
 const boot=(await execute(adb,[...device,'shell','getprop','sys.boot_completed'])).trim();if(boot!=='1')throw Error('Emulator not booted');
 console.log((await execute(adb,[...device,'install','-r',apk])).trim());
 await execute(adb,[...device,'shell','am','force-stop','com.supplify.mobile']);
 console.log((await execute(adb,[...device,'shell','am','start','-W','-n','com.supplify.mobile/.MainActivity'])).trim());
}else if(mode==='capture'){
 const label=process.argv[3]??'launch';if(!/^[a-z0-9-]+$/.test(label))throw Error('Bad label');
 const screenshot=await execute(adb,[...device,'exec-out','screencap','-p'],{encoding:'buffer'});fs.writeFileSync(path.join(dir,label+'.png'),screenshot);
 const remote='/sdcard/supplify-ui-review.xml';await execute(adb,[...device,'shell','uiautomator','dump',remote]);await execute(adb,[...device,'pull',remote,path.join(dir,label+'.xml')]);
 const pid=(await execute(adb,[...device,'shell','pidof','com.supplify.mobile'])).trim();
 const logs=await execute(adb,[...device,'logcat','-d','--pid='+pid,'-t','900']);fs.writeFileSync(path.join(dir,label+'-logcat.txt'),logs);
 const issues=logs.split('\n').filter(line=>/FATAL EXCEPTION|JavascriptException|ReactNativeJS.*(?:TypeError|ReferenceError|Invariant Violation|Error:)/.test(line));
 console.log(JSON.stringify({label,pid,screenshot:path.join(dir,label+'.png'),issues}));
}else if(mode==='tap'){
 const coords=process.argv.slice(3).map(Number);if(coords.length!==2||coords.some(n=>!Number.isInteger(n)||n<0||n>4000))throw Error('Bad coordinates');
 await execute(adb,[...device,'shell','input','tap',...coords.map(String)]);console.log('Tapped navigation control');
}else if(mode==='back'){
 await execute(adb,[...device,'shell','input','keyevent','4']);console.log('Back');
}else if(mode==='font'||mode==='landscape'||mode==='restore-display'){
 const saved=path.join(dir,'original-display.json');
 const keys=['font_scale','accelerometer_rotation','user_rotation'];
 if(!fs.existsSync(saved)){const original={};for(const key of keys)original[key]=(await execute(adb,[...device,'shell','settings','get','system',key])).trim();fs.writeFileSync(saved,JSON.stringify(original,null,2)+'\n');}
 const put=async(key,value)=>execute(adb,[...device,'shell','settings',value==='null'?'delete':'put','system',key,...(value==='null'?[]:[value])]);
 if(mode==='restore-display'){const original=JSON.parse(fs.readFileSync(saved,'utf8'));for(const key of keys)await put(key,original[key]);console.log('Original emulator display settings restored');}
 else if(mode==='landscape'){await put('accelerometer_rotation','0');await put('user_rotation','1');console.log('Emulator landscape preview');}
 else {const scale=Number(process.argv[3]);if(![1,1.3,1.5,2].includes(scale))throw Error('Unsupported review font scale');await put('font_scale',String(scale));console.log('Emulator font scale '+scale);}
}else throw Error('Unknown mode');
