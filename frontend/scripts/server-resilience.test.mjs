import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

test('static server isolates runtime config, refuses missing assets and proxies same-origin API', async () => {
  const backend = createServer((req, res) => {
    assert.equal(req.headers['x-secret-hop'], undefined);
    res.writeHead(200, { 'content-type': 'application/json', connection: 'x-private-hop', 'x-private-hop': 'not-forwarded' });
    res.end(JSON.stringify({ path: req.url }));
  });
  await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));
  // Reserve an unused port for the standalone child process.
  const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
  const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),API_BASE_URL:'/api',BACKEND_ORIGIN:`http://127.0.0.1:${backend.address().port}`},stdio:'pipe'});
  let stderr='';child.stderr.on('data',x=>stderr+=x);
  try{
    let healthy=false;for(let i=0;i<80;i++){try{if((await fetch(`http://127.0.0.1:${port}/healthz`)).ok){healthy=true;break;}}catch{}await sleep(50);}
    assert.ok(healthy,stderr);
    const url=`http://127.0.0.1:${port}`;
    const config=await fetch(`${url}/config.js`);assert.equal(config.headers.get('cache-control'),'no-store');assert.match(await config.text(),/"apiBaseUrl":"\/api"/);
    assert.doesNotMatch(config.headers.get('content-security-policy'),/localhost|127\.0\.0\.1/);
    const worker=await fetch(`${url}/sw.js`);assert.equal(worker.status,200);assert.match(worker.headers.get('cache-control'),/no-cache/);
    assert.equal((await fetch(`${url}/assets/not-a-build.js`)).status,404);
    assert.equal((await fetch(`${url}/`,{method:'POST'})).status,405);
    assert.equal((await fetch(`${url}/users`,{method:'HEAD'})).status,200);
    const proxy=await new Promise((resolve,reject)=>{const req=request(`${url}/api/test?limit=3`,{headers:{connection:'x-secret-hop','x-secret-hop':'never-forward'}},res=>{let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});req.on('error',reject);req.end();});
    assert.equal(proxy.status,200);assert.equal(proxy.headers['x-private-hop'],undefined);assert.match(proxy.headers['cache-control'],/no-store/);
    assert.equal(JSON.parse(proxy.body).path,'/api/test?limit=3');
  }finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});await new Promise(resolve=>backend.close(resolve));}
});
