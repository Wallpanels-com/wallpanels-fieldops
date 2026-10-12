import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.location={search:'',hostname:'example.test'};
globalThis.sessionStorage={getItem:()=> 'session-token',setItem:()=>{},removeItem:()=>{}};

test('Client upload reports progress and requires persisted media confirmation',async()=>{
 const progress=[];
 class FakeXHR {
  constructor(){this.upload={};this.headers={};}
  open(method,url){this.method=method;this.url=url;}
  setRequestHeader(name,value){this.headers[name]=value;}
  send(){this.upload.onprogress?.({lengthComputable:true,loaded:5,total:10});this.status=201;this.responseText=JSON.stringify({media:{id:'media-1',storage_path:'projects/p/file.jpg'}});this.onload();}
 }
 globalThis.XMLHttpRequest=FakeXHR;
 const {uploadMedia}=await import('../public/api.js?upload-test=1');
 const saved=await uploadMedia('project-1',{stageId:'stage-1',category:'progress',file:{name:'one.jpg',type:'image/jpeg'},onProgress:value=>progress.push(value)});
 assert.equal(saved.id,'media-1');assert.deepEqual(progress,[50,100]);
});

test('Client upload marks network failures retryable and retains the caller file',async()=>{
 class FailedXHR {constructor(){this.upload={};}open(){}setRequestHeader(){}send(){this.onerror();}}
 globalThis.XMLHttpRequest=FailedXHR;
 const {uploadMedia}=await import('../public/api.js?upload-test=2');
 const file={name:'kept.jpg',type:'image/jpeg'};
 await assert.rejects(()=>uploadMedia('project-1',{dayId:'day-1',category:'daily_site',file}),error=>error.retryable===true);
 assert.equal(file.name,'kept.jpg');
});
