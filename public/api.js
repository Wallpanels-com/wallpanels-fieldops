const API_BASE='/api';
const params=new URLSearchParams(location.search);const localHost=!location.hostname||['localhost','127.0.0.1'].includes(location.hostname);
export const state={token:sessionStorage.getItem('fieldops_token')||'',me:null,view:'pm',projects:[],current:null,loading:false,preview:localHost&&params.has('preview'),invite:params.get('invite')||''};
async function rawRequest(route,{method='GET',data}={}){
 const r=await fetch(`${API_BASE}${route}`,{method,headers:{...(state.token?{Authorization:`Bearer ${state.token}`} :{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
 const result=await r.json().catch(()=>({}));
 if(!r.ok){const error=new Error(result.error||`Request failed (${r.status})`);error.status=r.status;throw error;}
 return result;
}
let loginPromise=null;
export async function loginTelegram(){
 const tg=window.Telegram?.WebApp;
 if(!tg?.initData){ if(state.preview)return null;throw new Error('Please open this Mini App from Telegram. For a visual preview, add ?preview=1 to the URL.'); }
 tg.ready();tg.expand();tg.setHeaderColor?.('#f6f5f8');tg.setBackgroundColor?.('#f6f5f8');
 const r=await rawRequest('/auth/telegram',{method:'POST',data:{initData:tg.initData,...(state.invite?{invite:state.invite}:{})}});
 state.token=r.token;state.me=r.user;sessionStorage.setItem('fieldops_token',state.token);
 state.view=['installer','foreman'].includes(r.user.role)?'installer':'pm';return r.user;
}
export async function request(route,options={}){
 try{return await rawRequest(route,options);}catch(error){
  if(error.status!==401||route==='/auth/telegram'||state.preview)throw error;
  state.token='';sessionStorage.removeItem('fieldops_token');
  loginPromise||=loginTelegram().finally(()=>{loginPromise=null;});
  await loginPromise;return rawRequest(route,options);
 }
}
const mimeByExtension={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif',mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm'};
export function uploadContentType(file){return file.type||mimeByExtension[file.name.split('.').pop()?.toLowerCase()]||'';}
export async function uploadMedia(projectId,{stageId,dayId,issueId,category,file}){
 const query=new URLSearchParams({category,...(stageId?{stage_id:stageId}:{}),...(dayId?{day_id:dayId}:{}),...(issueId?{issue_id:issueId}:{})});
 const contentType=uploadContentType(file);if(!contentType)throw new Error(`Unsupported file format: ${file.name}`);
 const r=await fetch(`${API_BASE}/projects/${projectId}/media?${query}`,{
  method:'POST',headers:{Authorization:`Bearer ${state.token}`,'Content-Type':contentType,'X-File-Name':encodeURIComponent(file.name)},body:file});
 const result=await r.json().catch(()=>({}));if(!r.ok)throw new Error(result.error||`Upload failed: ${file.name}`);
 return result.media;
}
