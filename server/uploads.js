import {Readable} from 'node:stream';

export const MAX_FILE_SIZE = 50 * 1024 * 1024;
export const MAX_IMAGE_SIZE = 15 * 1024 * 1024;
export const MIME_TYPES = Object.freeze({
  'image/jpeg':'jpg',
  'image/png':'png',
  'image/webp':'webp',
  'image/heic':'heic',
  'image/heif':'heif',
  'video/mp4':'mp4',
  'video/quicktime':'mov',
  'video/webm':'webm'
});

const starts = (buffer, bytes) => bytes.every((byte,index)=>buffer[index]===byte);
const ascii = (buffer,start,length) => buffer.subarray(start,start+length).toString('ascii');

export function matchesMimeSignature(buffer,mime) {
  if(!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  if(mime==='image/jpeg') return starts(buffer,[0xff,0xd8,0xff]);
  if(mime==='image/png') return starts(buffer,[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  if(mime==='image/webp') return ascii(buffer,0,4)==='RIFF' && ascii(buffer,8,4)==='WEBP';
  if(mime==='video/webm') return starts(buffer,[0x1a,0x45,0xdf,0xa3]);

  const probe=buffer.subarray(0,Math.min(buffer.length,4096));
  const ftyp=probe.indexOf(Buffer.from('ftyp'));
  if(ftyp<4 || ftyp+8>probe.length)return false;
  const brand=ascii(probe,ftyp+4,4);
  if(mime==='image/heic'||mime==='image/heif')return /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand);
  if(mime==='video/quicktime')return brand==='qt  ';
  if(mime==='video/mp4')return /^(isom|iso2|iso3|iso4|iso5|iso6|avc1|mp41|mp42|M4V |MSNV|3gp[4-9])$/.test(brand);
  return false;
}

export function validateUploadMetadata(mime,size) {
  if(!Object.hasOwn(MIME_TYPES,mime))throw Object.assign(new Error('Unsupported photo/video format'),{status:415});
  const kind=mime.startsWith('video/')?'video':'image';
  if(!Number.isSafeInteger(size)||size<1||size>MAX_FILE_SIZE||(kind==='image'&&size>MAX_IMAGE_SIZE)){
    throw Object.assign(new Error('Image max 15 MB; video max 50 MB'),{status:413});
  }
  return {kind,extension:MIME_TYPES[mime]};
}

export async function inspectUploadStream(source,mime,expectedSize) {
  const iterator=source[Symbol.asyncIterator]();
  const buffered=[];let bufferedSize=0;
  while(bufferedSize<64){
    const next=await iterator.next();
    if(next.done)break;
    const chunk=Buffer.from(next.value);
    buffered.push(chunk);bufferedSize+=chunk.length;
    if(bufferedSize>expectedSize)throw Object.assign(new Error('Upload size does not match request'),{status:400});
  }
  const head=Buffer.concat(buffered);
  if(!matchesMimeSignature(head,mime))throw Object.assign(new Error('File content does not match its declared format'),{status:415});
  async function* checkedBody(){
    let total=head.length;
    yield head;
    while(true){
      const next=await iterator.next();
      if(next.done)break;
      const chunk=Buffer.from(next.value);total+=chunk.length;
      if(total>expectedSize)throw Object.assign(new Error('Upload size does not match request'),{status:400});
      yield chunk;
    }
    if(total!==expectedSize)throw Object.assign(new Error('Upload size does not match request'),{status:400});
  }
  return Readable.from(checkedBody());
}
