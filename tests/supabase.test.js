import test from 'node:test';
import assert from 'node:assert/strict';
import {table,rpc,deleteObject,signedUrl} from '../server/supabase.js';

process.env.SUPABASE_URL='https://projectref.supabase.co';
process.env.SUPABASE_SECRET_KEY='TEST_ONLY_SECRET_KEY';

test('Supabase secret key is sent only through apikey',async()=>{
  let captured;globalThis.fetch=async(url,options)=>{captured={url:String(url),options};return new Response('[]',{status:200,headers:{'content-type':'application/json'}});};
  await table('projects');
  assert.equal(captured.options.headers.apikey,'TEST_ONLY_SECRET_KEY');
  assert.equal(captured.options.headers.Authorization,undefined);
});

test('RPC and Storage removal use current REST shapes',async()=>{
  const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});return new Response(url.toString().includes('/rpc/')?'[{"id":"p1"}]':'{}',{status:200,headers:{'content-type':'application/json'}});};
  assert.equal((await rpc('fieldops_create_project',{p_title:'Test'}))[0].id,'p1');
  await deleteObject('projects/p1/image.jpg');
  assert.match(calls[0].url,/\/rest\/v1\/rpc\/fieldops_create_project$/);
  assert.match(calls[1].url,/\/storage\/v1\/object\/fieldops-media$/);
  assert.deepEqual(JSON.parse(calls[1].options.body),{prefixes:['projects/p1/image.jpg']});
});

test('Signed Storage paths are normalized to a full project URL',async()=>{
  globalThis.fetch=async()=>new Response('{"signedURL":"/object/sign/fieldops-media/a.jpg?token=x"}',{status:200,headers:{'content-type':'application/json'}});
  assert.equal(await signedUrl('a.jpg'),'https://projectref.supabase.co/storage/v1/object/sign/fieldops-media/a.jpg?token=x');
});
