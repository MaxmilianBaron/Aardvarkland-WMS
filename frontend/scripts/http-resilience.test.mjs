import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const source=await readFile(new URL('../src/core/api/http.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness(fetcher) {
  let tokens={accessToken:'access-a',refreshToken:'refresh-a'};let cleared=0;
  const exports={};
  const context={exports,AbortController,URLSearchParams,crypto,performance,fetch:fetcher,window:{setTimeout:(callback,ms)=>setTimeout(callback,Math.min(ms,50)),clearTimeout},require(path){
    if(path.endsWith('app/config'))return{config:{apiBaseUrl:'/api',apiRequestTimeoutMs:1000}};
    if(path.endsWith('auth/session'))return{getAccessToken:()=>tokens.accessToken,getRefreshToken:()=>tokens.refreshToken,saveTokens:value=>{tokens=value;},clearTokens:()=>{tokens={};cleared++;}};
    return{reportFrontendEvent:()=>{},redactedErrorMessage:value=>value};
  }};
  vm.runInNewContext(compiled,context);
  return{api:exports,tokens:()=>tokens,cleared:()=>cleared,logout:()=>{tokens={};}};
}
test('temporary refresh failures preserve session tokens',async()=>{
  for(const status of [429,500,503]){
    const h=harness(async url=>new Response('{}',{status:url.endsWith('/refresh')?status:401}));
    await assert.rejects(h.api.apiRequest('/inventory'),/temporarily unavailable/);
    assert.equal(h.tokens().refreshToken,'refresh-a');assert.equal(h.cleared(),0);
  }
});
test('definitive refresh rejection clears the session',async()=>{
  const h=harness(async()=>new Response('{}',{status:401}));
  await assert.rejects(h.api.apiRequest('/inventory'));
  assert.equal(h.tokens().refreshToken,undefined);assert.ok(h.cleared()>0);
});
test('hanging refresh has a deadline without logging out',async()=>{
  const h=harness((url,options)=>url.endsWith('/refresh')?new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted')))):Promise.resolve(new Response('{}',{status:401})));
  await assert.rejects(h.api.apiRequest('/inventory'),/timed out/);assert.equal(h.tokens().refreshToken,'refresh-a');
});
test('a completed refresh cannot resurrect a concurrent logout',async()=>{
  let finish;
  const h=harness(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=h.api.refreshAccessTokenForSession();h.logout();finish(new Response(JSON.stringify({accessToken:'new',refreshToken:'next'})));
  assert.equal(await pending,false);assert.equal(h.tokens().accessToken,undefined);
});
test('refresh is single-flight and all auth transport opts out of caching',async()=>{
  let refreshes=0;const options=[];
  const h=harness(async(url,init)=>{options.push(init);if(url.endsWith('/refresh')){refreshes++;await new Promise(r=>setTimeout(r,5));return new Response(JSON.stringify({accessToken:'new',refreshToken:'next'}));}return new Response('{}',{status:init.headers.Authorization==='Bearer new'?200:401});});
  await Promise.all([h.api.apiRequest('/a'),h.api.apiRequest('/b')]);assert.equal(refreshes,1);
  assert.equal(options.every(init=>init.cache==='no-store'),true);
});
