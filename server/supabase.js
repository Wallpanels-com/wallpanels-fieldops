/* Supabase REST API through the server ONLY. No secret reaches the browser. */
const url = () => { if(!process.env.SUPABASE_URL) throw new Error('SUPABASE_URL missing'); return process.env.SUPABASE_URL.replace(/\/$/,''); };
const secret = () => { if(!process.env.SUPABASE_SECRET_KEY) throw new Error('SUPABASE_SECRET_KEY missing'); return process.env.SUPABASE_SECRET_KEY; };
export class DBError extends Error {constructor(message,status=500){super(message);this.status=status;}}
async function send(path,{method='GET',body,headers={},query,rawBody,timeout=30000}={}) {
  const uri=new URL(path,url());
  if(query) for(const [k,v] of Object.entries(query)) if(v !== undefined && v !== null) uri.searchParams.set(k,String(v));
  const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),timeout);
  try {
    const res=await fetch(uri,{method,headers:{apikey:secret(),...(body===undefined ? {} : {'Content-Type':'application/json'}),...headers},body:body===undefined ? rawBody : JSON.stringify(body),signal:ctrl.signal,...(rawBody ? {duplex:'half'}:{})});
    if(!res.ok){ const problem=await res.text().catch(()=>res.statusText); console.error('Supabase request failed',method,uri.pathname,res.status,problem.slice(0,240)); throw new DBError(res.status===404?'Not found':'Database or storage request failed',res.status === 404 ? 404 : 502); }
    if(res.status===204) return null;
    const text=await res.text(); try{return text?JSON.parse(text):null;}catch{return text;}
  } catch(e){if(e instanceof DBError) throw e; console.error('Supabase network error',e.message);throw new DBError('Storage/database unavailable',503);} finally {clearTimeout(timer);}
}
export function table(name,{filters={},order,limit,select='*'}={}) {
 const query={select,...filters};if(order) query.order=order;if(limit) query.limit=limit;
 return send(`/rest/v1/${name}`,{query});
}
export function insert(name,rows,{upsert=false,conflict}={}) {
 const headers={Prefer:'return=representation'};if(upsert)headers.Prefer+=' ,resolution=merge-duplicates';
 return send(`/rest/v1/${name}`,{method:'POST',body:rows,query:conflict?{on_conflict:conflict}:undefined,headers});
}
export function update(name,patch,filters) {return send(`/rest/v1/${name}`,{method:'PATCH',body:patch,query:filters,headers:{Prefer:'return=representation'}});}
export function remove(name,filters) {return send(`/rest/v1/${name}`,{method:'DELETE',query:filters,headers:{Prefer:'return=representation'}});}
export const one = async(name,filters)=>{const r=await table(name,{filters,limit:1});return r[0]||null;};
export function rpc(name,body){return send(`/rest/v1/rpc/${name}`,{method:'POST',body});}
const bucket='fieldops-media';
export async function uploadObject(path,stream,mimeType,size){
  // Stream directly to Storage without buffering video in Railway memory.
  return send(`/storage/v1/object/${bucket}/${path}`,{method:'POST',headers:{'Content-Type':mimeType,'Content-Length':String(size),'x-upsert':'false'},rawBody:stream,timeout:180000});
}
export async function deleteObject(path){return send(`/storage/v1/object/${bucket}`,{method:'DELETE',body:{prefixes:[path]}});}
export async function signedUrl(path,ttl=3600){
  const result=await send(`/storage/v1/object/sign/${bucket}/${path}`,{method:'POST',body:{expiresIn:ttl}});
  const signed=result.signedURL || result.signedUrl;
  if(!signed)throw new DBError('Could not sign photo URL',502);
  return `${url()}${signed.startsWith('/storage/v1/')?'': '/storage/v1'}${signed.startsWith('/')?'':'/'}${signed}`;
}
