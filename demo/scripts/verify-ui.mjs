import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const demoOnly=process.argv.includes('--demo-only');
const demoPort=Number(process.env.UI_PORT||4173),productPort=Number(process.env.PRODUCT_UI_PORT||14000);
const servers=[spawn('python3',['-m','http.server',String(demoPort),'--bind','127.0.0.1','--directory','_site'],{stdio:['ignore','ignore','inherit']})];
if(!demoOnly)servers.push(spawn(process.execPath,['server.js'],{cwd:'../frontend',env:{...process.env,PORT:String(productPort),API_BASE_URL:'/api'},stdio:'inherit'}));
try{
  for(const url of [`http://127.0.0.1:${demoPort}/`,...(!demoOnly?[`http://127.0.0.1:${productPort}/healthz`]:[])]){
    let ready=false;for(let i=0;i<60;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await sleep(250);}if(!ready)throw new Error(`UI server did not start: ${url}`);
  }
  const child=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test',demoOnly?'e2e/preview.spec.mjs':'e2e','--workers=1','--reporter=line'],{stdio:'inherit',env:{...process.env,PREVIEW_URL:`http://127.0.0.1:${demoPort}/`,PRODUCT_UI_URL:`http://127.0.0.1:${productPort}/`}});
  process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});
}finally{for(const server of servers)server.kill('SIGTERM');}
