import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

const port=39192;
let child;
async function start(){child=spawn(process.execPath,['server/index.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,NODE_ENV:'development',DEMO_ONLY:'true',PORT:String(port)},stdio:'ignore'});
 for(let i=0;i<20;i++){
  try{const r=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(1000)});if(r.ok)return;}catch{}
  await new Promise(r=>setTimeout(r,80));
 }throw new Error('Server did not start');}
test('HTTP preview server serves design, health and blocks unauthenticated API',async()=>{
 await start();try{
  const health=await fetch(`http://127.0.0.1:${port}/api/health`);assert.equal(health.status,200);assert.equal((await health.json()).ok,true);
  const home=await fetch(`http://127.0.0.1:${port}/?preview=1`);assert.equal(home.status,200);assert.match(await home.text(),/WallPanels FieldOps/);
  const style=await fetch(`http://127.0.0.1:${port}/styles.css`);assert.equal(style.status,200);assert.match(await style.text(),/--purple:/);
  const js=await fetch(`http://127.0.0.1:${port}/app.js`);assert.equal(js.status,200);
  const denied=await fetch(`http://127.0.0.1:${port}/api/projects`);assert.equal(denied.status,401);
  const traversal=await fetch(`http://127.0.0.1:${port}/..%2fserver%2fauth.js`);assert.equal(traversal.status,404);
 }finally{child?.kill();}
},{timeout:10000});
