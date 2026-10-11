import test from 'node:test';
import assert from 'node:assert/strict';
import {assertProjectSubmittable} from '../server/validation.js';

function complete(){return {stages:[{title:'Before',completion:{done:true}}],exceptions:[],issues:[],days:[{status:'approved'}],confirmation:{outcome:'refused'},media:[]};}

test('Final submission requires PM-approved daily reports',()=>{
  const bundle=complete();bundle.days[0].status='submitted';
  assert.throws(()=>assertProjectSubmittable(bundle),/must be approved/);
});

test('Signed client outcome requires an actual signature image',()=>{
  const bundle=complete();bundle.confirmation.outcome='signed';bundle.media.push({category_key:'customer_signature',kind:'video'});
  assert.throws(()=>assertProjectSubmittable(bundle),/photo of the signed form/);
  bundle.media[0].kind='image';assert.doesNotThrow(()=>assertProjectSubmittable(bundle));
});

test('Damage and quality issues cannot close without evidence',()=>{
  const bundle=complete();bundle.issues.push({id:'issue-1',kind:'damage',status:'resolved'});
  assert.throws(()=>assertProjectSubmittable(bundle),/photographic evidence/);
  bundle.media.push({issue_id:'issue-1',kind:'image'});assert.doesNotThrow(()=>assertProjectSubmittable(bundle));
});
