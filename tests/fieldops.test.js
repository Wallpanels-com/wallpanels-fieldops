import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {validateTelegramInitData,issueSession,readSession} from '../server/auth.js';
import {stagesFor,stageComplete,DAY_CHECKS} from '../server/templates.js';

const bot='TEST_BOT_TOKEN_NOT_REAL';
function buildTelegram(user={id:12345678,first_name:'Tester'},modern=false){
 const data={auth_date:String(Math.floor(Date.now()/1000)),query_id:'AAExample',user:JSON.stringify(user),...(modern?{signature:'telegram-ed25519-signature'}:{})};
 const check=Object.entries(data).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
 const secret=crypto.createHmac('sha256','WebAppData').update(bot).digest();
 const hash=crypto.createHmac('sha256',secret).update(check).digest('hex');
 return new URLSearchParams({...data,hash}).toString();
}
test('Telegram valid initData passes HMAC verification',()=>{
 assert.equal(validateTelegramInitData(buildTelegram(),bot).id,12345678);
});
test('Telegram valid initData with modern signature field passes HMAC verification',()=>{
 assert.equal(validateTelegramInitData(buildTelegram(undefined,true),bot).id,12345678);
});
test('Telegram tampered data never authorizes',()=>{
 const tampered=buildTelegram().replace('Tester','Attacker');
 assert.throws(()=>validateTelegramInitData(tampered,bot));
});
test('Telegram stale initData is rejected',()=>{
 const data=new URLSearchParams(buildTelegram());data.set('auth_date','1');assert.throws(()=>validateTelegramInitData(data.toString(),bot));
});
test('Sessions are signed and cannot be modified',()=>{
 const secret='a'.repeat(64),s=issueSession('tester-uuid',secret);assert.equal(readSession(s,secret),'tester-uuid');
 assert.throws(()=>readSession(s.slice(0,-1)+'x',secret));
});
test('All 7 default stages and daily checklist are defined',()=>{
 const stages=stagesFor('installation');assert.equal(stages.length,7);
 assert.ok(stages.find(s=>s.key==='before').media.some(m=>m.key==='before_video'&&m.required));
 assert.ok(stages.find(s=>s.key==='installed').media.some(m=>m.key==='after_video'&&m.required));
 assert.ok(stages.find(s=>s.key==='cleanup').media.some(m=>m.key==='post_cleanup'));
 assert.equal(DAY_CHECKS.length,4);
});
test('Stage cannot be completed without every required photo/video and check',()=>{
 const stage={id:'st1',media_requirements:[{key:'flags',label:'Flag',required:true,kind:'image'},{key:'video',label:'Video',kind:'video',required:true}]};
 const media=[{stage_id:'st1',category_key:'flags',kind:'image'}];
 const checks=[{stage_id:'st1',label:'Arrived',required:true,result_status:'done'}];
 assert.equal(stageComplete(stage,media,checks).done,false);
 assert.equal(stageComplete(stage,media,checks).missingMedia[0],'Video');
 assert.equal(stageComplete(stage,media,checks,[{stage_id:'st1',category_key:'video',status:'approved'}]).done,true);
});
