import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {matchesMimeSignature,validateUploadMetadata,inspectUploadStream} from '../server/uploads.js';

const box = brand => Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftyp'),Buffer.from(brand),Buffer.alloc(12)]);

test('Upload signatures accept supported iPhone and web media formats',()=>{
  assert.equal(matchesMimeSignature(Buffer.from([0xff,0xd8,0xff,...new Array(16).fill(0)]),'image/jpeg'),true);
  assert.equal(matchesMimeSignature(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]),'image/png'),true);
  assert.equal(matchesMimeSignature(box('heic'),'image/heic'),true);
  assert.equal(matchesMimeSignature(box('qt  '),'video/quicktime'),true);
  assert.equal(matchesMimeSignature(box('isom'),'video/mp4'),true);
  assert.equal(matchesMimeSignature(Buffer.from([0x1a,0x45,0xdf,0xa3,...new Array(12).fill(0)]),'video/webm'),true);
  assert.equal(matchesMimeSignature(Buffer.from('<script>alert(1)</script>'),'image/jpeg'),false);
});

test('Upload metadata enforces MIME and independent image/video size limits',()=>{
  assert.deepEqual(validateUploadMetadata('image/heic',1024),{kind:'image',extension:'heic'});
  assert.deepEqual(validateUploadMetadata('video/quicktime',20*1024*1024),{kind:'video',extension:'mov'});
  assert.throws(()=>validateUploadMetadata('text/html',100),error=>error.status===415);
  assert.throws(()=>validateUploadMetadata('image/jpeg',16*1024*1024),error=>error.status===413);
  assert.throws(()=>validateUploadMetadata('video/mp4',51*1024*1024),error=>error.status===413);
});

test('Stream inspection preserves bytes and rejects content-length mismatch',async()=>{
  const source=Buffer.from([0xff,0xd8,0xff,...new Array(100).fill(7)]);
  const stream=await inspectUploadStream(Readable.from([source.subarray(0,20),source.subarray(20)]),'image/jpeg',source.length);
  const received=[];for await(const chunk of stream)received.push(chunk);
  assert.deepEqual(Buffer.concat(received),source);
  await assert.rejects(()=>inspectUploadStream(Readable.from([source]),'image/jpeg',source.length-1),error=>error.status===400);
});
