import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateTelegramInitData,issueSession,readSession} from './auth.js';
import {table,insert,update,remove,one,uploadObject,deleteObject,signedUrl,rpc} from './supabase.js';
import {stagesFor,stageComplete,canExcludeRequirement,DAY_CHECKS} from './templates.js';
import {validateUploadMetadata,inspectUploadStream} from './uploads.js';
import {assertProjectSubmittable} from './validation.js';

// Minimal no-dependency production server. Uses native Node fetch/stream APIs.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
const port=Number(process.env.PORT||3000);
const SESSION_SECRET=process.env.SESSION_SECRET||'';
const BOT_TOKEN=process.env.TELEGRAM_BOT_TOKEN||'';
const ADMIN_ID=String(process.env.BOOTSTRAP_ADMIN_TELEGRAM_ID||'');
const managerIds=new Set([ADMIN_ID,...String(process.env.MANAGER_TELEGRAM_IDS||'').split(',').map(x=>x.trim())].filter(x=>/^\d{4,20}$/.test(x)));
const isPm=u=>u.role==='pm'||u.role==='admin';
function fail(message,status=400){const e=new Error(message);e.status=status;throw e;}
function ok(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function err(res,e){const status=e.status>=400&&e.status<=599?e.status:500;console.error('Request error',status,e.message);ok(res,{error:status===500?'Unexpected server error':e.message},status);}
async function json(req){const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>120000)fail('JSON request too large',413);chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{fail('Malformed JSON');}}
const f=(id)=>`eq.${id}`;
const uuid=(s)=>typeof s==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
function str(s,max=300,required=true){const v=String(s??'').trim();if((required&&!v)||v.length>max)fail('Invalid text field');return v;}
function currentDate(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const obj=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${obj.year}-${obj.month}-${obj.day}`;}
function cleanFileName(s){let decoded=String(s||'file');try{decoded=decodeURIComponent(decoded);}catch{}return decoded.normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,70).replace(/^\.+/,'')||'file';}
function cleanUsername(value){const v=String(value||'').trim().replace(/^@/,'').toLowerCase();if(!/^[a-z0-9_]{5,32}$/.test(v))fail('Введите корректный Telegram @username');return v;}
const tokenHash=value=>crypto.createHash('sha256').update(String(value||'')).digest('hex');
function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;const d=new Date(`${value}T00:00:00Z`);return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===value;}
function requireEnv(){
 for(const k of ['SUPABASE_URL','SUPABASE_SECRET_KEY','TELEGRAM_BOT_TOKEN','TELEGRAM_BOT_USERNAME','SESSION_SECRET','BOOTSTRAP_ADMIN_TELEGRAM_ID','APP_BASE_URL']) if(!process.env[k]||String(process.env[k]).includes('REPLACE_WITH')) throw new Error(`${k} not configured`);
 if(SESSION_SECRET.length<40)throw new Error('SESSION_SECRET must have 40+ characters');
 if(!/^\d{4,20}$/.test(ADMIN_ID))throw new Error('BOOTSTRAP_ADMIN_TELEGRAM_ID must be numeric');
 if(!/^\d{6,12}:[A-Za-z0-9_-]{20,}$/.test(BOT_TOKEN))throw new Error('TELEGRAM_BOT_TOKEN format is invalid');
 if(!/^[A-Za-z0-9_]{5,}$/.test(process.env.TELEGRAM_BOT_USERNAME))throw new Error('TELEGRAM_BOT_USERNAME format is invalid');
 if(!/^https:\/\/[a-z0-9-]+\.up\.railway\.app\/?$/i.test(process.env.APP_BASE_URL))throw new Error('APP_BASE_URL must be the Railway HTTPS domain');
 if(!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/i.test(process.env.SUPABASE_URL))throw new Error('SUPABASE_URL format is invalid');
 if(!process.env.SUPABASE_SECRET_KEY.startsWith('sb_secret_'))throw new Error('SUPABASE_SECRET_KEY must use the new secret key format');
 if(process.env.MANAGER_TELEGRAM_IDS&&String(process.env.MANAGER_TELEGRAM_IDS).split(',').some(x=>!/^\d{4,20}$/.test(x.trim())))throw new Error('MANAGER_TELEGRAM_IDS must contain comma-separated numeric IDs');
}
async function syncProjectTemplates(){const projects=await table('projects',{limit:500});for(const p of projects)await rpc('fieldops_sync_project_template',{p_project_id:p.id,p_stages:stagesFor(p.project_type)});console.log(`Template sync checked ${projects.length} project(s)`);}
async function auth(req){const head=String(req.headers.authorization||'');const token=head.startsWith('Bearer ')?head.slice(7):'';const id=readSession(token,SESSION_SECRET);const u=await one('users',{id:f(id)});if(!u||!u.is_active)fail('Account disabled',403);return u;}
async function projectAccess(u,id,{pmOnly=false}={}){
 if(!uuid(id))fail('Invalid project ID');
 const p=await one('projects',{id:f(id)});if(!p)fail('Project not found',404);
 if(!isPm(u) && !(await one('project_members',{project_id:f(id),user_id:f(u.id)})))fail('Project access denied',403);
 if(pmOnly && !isPm(u))fail('Project Manager required',403);
 return p;
}
async function projectRole(u,projectId){
 if(isPm(u))return u.role;
 return (await one('project_members',{project_id:f(projectId),user_id:f(u.id)}))?.role||null;
}
async function requireForeman(u,projectId){
 const role=await projectRole(u,projectId);if(!['admin','pm','foreman'].includes(role))fail('Только бригадир или руководитель может выполнить это действие',403);return role;
}
const bundleCache=new Map(),bundleInflight=new Map(),BUNDLE_CACHE_MS=20_000;
function invalidateProject(projectId){for(const key of bundleCache.keys())if(key.endsWith(`:${projectId}`))bundleCache.delete(key);}
async function buildProjectBundle(u,p){
 const id=p.id;
 const [stages,checks,results,media,issues,days,members,exceptions,confirmations,owner,comments,completions,events]=await Promise.all([
  table('project_stages',{filters:{project_id:f(id)},order:'sort_order.asc'}),
  table('stage_check_items',{filters:{project_id:f(id)},order:'sort_order.asc'}),
  table('stage_check_results',{filters:{project_id:f(id)}}),
  table('project_media',{filters:{project_id:f(id),deleted_at:'is.null'},order:'created_at.desc',limit:500}),
  table('issues',{filters:{project_id:f(id)},order:'created_at.desc'}),
  table('daily_reports',{filters:{project_id:f(id)},order:'report_date.desc'}),
  table('project_members',{filters:{project_id:f(id)}}),
  table('stage_exceptions',{filters:{project_id:f(id)}}),
  one('client_confirmations',{project_id:f(id)}),
  p.pm_id?one('users',{id:f(p.pm_id)}):null,
  table('stage_comments',{filters:{project_id:f(id)},order:'created_at.asc'}),
  table('stage_completions',{filters:{project_id:f(id)}}),
  table('project_events',{filters:{project_id:f(id)},order:'created_at.desc',limit:50}).catch(()=>[])
 ]);
 const userIds=[...new Set([...members.map(m=>m.user_id),...media.map(m=>m.uploaded_by),...comments.map(m=>m.author_id),...exceptions.flatMap(x=>[x.requested_by,x.reviewed_by]),...events.map(x=>x.actor_id),p.pm_id].filter(Boolean))];
 const users=userIds.length?await table('users',{filters:{id:`in.(${userIds.join(',')})`}}).catch(()=>[]):[];
 const mappedChecks=checks.map(c=>({...c,result_status:results.find(x=>x.check_item_id===c.id)?.status||'pending',completed_by:results.find(x=>x.check_item_id===c.id)?.completed_by||null}));
 const person=id=>users.find(x=>x.id===id);
 const signedMedia=await Promise.all(media.map(async m=>({...m,url:await signedUrl(m.storage_path).catch(()=>null),uploader:person(m.uploaded_by)?{id:m.uploaded_by,first_name:person(m.uploaded_by).first_name,last_name:person(m.uploaded_by).last_name}:null})));
 const enriched=stages.map(s=>({...s,completion:stageComplete(s,media,mappedChecks,exceptions),completed:completions.find(x=>x.stage_id===s.id)||null}));
 const enrichedComments=comments.map(c=>({...c,author:person(c.author_id)?{id:c.author_id,first_name:person(c.author_id).first_name,last_name:person(c.author_id).last_name}:null,can_edit:c.author_id===u.id}));
 const publicPerson=id=>{const x=person(id);return x?{id:x.id,first_name:x.first_name,last_name:x.last_name,username:x.username,photo_url:x.photo_url}:null;};
 const enrichedExceptions=exceptions.map(x=>({...x,requester:publicPerson(x.requested_by),reviewer:publicPerson(x.reviewed_by)}));
 const enrichedEvents=events.map(x=>({...x,actor:publicPerson(x.actor_id)}));
 return {project:p,stages:enriched,checks:mappedChecks,media:signedMedia,issues,days,members,people:users.map(x=>({id:x.id,telegram_id:x.telegram_id,username:x.username,first_name:x.first_name,last_name:x.last_name,role:x.role,photo_url:x.photo_url,is_active:x.is_active})),comments:enrichedComments,exceptions:enrichedExceptions,events:enrichedEvents,confirmation:confirmations,pm:owner?{id:owner.id,first_name:owner.first_name,last_name:owner.last_name,username:owner.username,telegram_id:owner.telegram_id,photo_url:owner.photo_url}:null,dayChecks:DAY_CHECKS};
}
async function projectBundle(u,id,{fresh=false}={}){
 const p=await projectAccess(u,id),key=`${u.id}:${id}`,cached=bundleCache.get(key);
 if(!fresh&&cached&&Date.now()-cached.at<BUNDLE_CACHE_MS)return cached.data;
 if(!fresh&&bundleInflight.has(key))return bundleInflight.get(key);
 if(fresh&&bundleInflight.has(key))await bundleInflight.get(key).catch(()=>{});
 const pending=buildProjectBundle(u,p).then(data=>{bundleCache.set(key,{at:Date.now(),data});return data;}).finally(()=>bundleInflight.delete(key));
 bundleInflight.set(key,pending);return pending;
}
async function warmProjectBundles(u,projects){await Promise.allSettled(projects.slice(0,3).map(p=>projectBundle(u,p.id)));}
async function sendTelegram(chatId,text,extra={}){
 if(!BOT_TOKEN||!chatId)return {ok:false,error:'not configured'};
 try{const c=new AbortController();const t=setTimeout(()=>c.abort(),9000);const r=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text,...extra}),signal:c.signal});clearTimeout(t);if(!r.ok){console.error('Telegram notification failed',r.status);return {ok:false,error:`HTTP ${r.status}`};}return {ok:true};}catch(e){console.error('Telegram notification transport error',e.message);return {ok:false,error:e.message};}
}
async function notifyPM(project,text){if(!project.pm_id)return;const pm=await one('users',{id:f(project.pm_id)});if(pm)void sendTelegram(pm.telegram_id,text);}
async function notifyCrew(project,text){const members=await table('project_members',{filters:{project_id:f(project.id)}});for(const m of members){const person=await one('users',{id:f(m.user_id)});if(person?.is_active)void sendTelegram(person.telegram_id,text);}}
async function createProjectEvent(projectId,eventType,title,detail,actorId,referenceType,referenceId){
 const row=(await insert('project_events',{project_id:projectId,event_type:eventType,title,detail,actor_id:actorId,reference_type:referenceType,reference_id:referenceId}))[0];invalidateProject(projectId);return row;
}
async function notifyManagers(project,eventKey,text){
 const recipients=new Set(managerIds);if(project.pm_id){const pm=await one('users',{id:f(project.pm_id)});if(pm?.telegram_id)recipients.add(String(pm.telegram_id));}
 for(const chatId of recipients){
  try{if(await one('notification_deliveries',{event_key:f(eventKey),recipient_telegram_id:f(chatId)}))continue;
   const delivery=(await insert('notification_deliveries',{event_key:eventKey,recipient_telegram_id:chatId,status:'sending'}))[0];
   const sent=await sendTelegram(chatId,text);await update('notification_deliveries',{status:sent.ok?'sent':'failed',error:sent.ok?null:String(sent.error||'delivery failed').slice(0,300),attempted_at:new Date().toISOString()},{id:f(delivery.id)});
  }catch(e){console.error('Manager notification record failed',e.message);}
 }
}
function parseId(pathname,prefix){const m=pathname.match(new RegExp(`^${prefix}/([0-9a-f-]{36})$`,'i'));return m?.[1]||null;}

async function api(req,res,uri){
 const {pathname}=uri, method=req.method;
 if(pathname==='/api/health'&&method==='GET')return ok(res,{ok:true,service:'wallpanels-fieldops',time:new Date().toISOString()});
 if(pathname==='/api/auth/telegram'&&method==='POST'){
  const data=await json(req);let tg;
  if(process.env.NODE_ENV!=='production'&&process.env.ALLOW_DEV_AUTH==='true'&&data?.dev===true&&process.env.DEV_AUTH_TG_ID) tg={id:Number(process.env.DEV_AUTH_TG_ID),first_name:'Developer',username:'localdev'};
  else tg=validateTelegramInitData(data.initData,BOT_TOKEN);
  const tgId=String(tg.id);let user=await one('users',{telegram_id:f(tgId)});
  if(!user&&data.invite){
   const invitation=await one('invitations',{token_hash:f(tokenHash(data.invite)),status:'eq.pending'});
   if(!invitation||new Date(invitation.expires_at)<=new Date())fail('Приглашение недействительно или истекло',403);
   if(invitation.username&&cleanUsername(tg.username||'')!==invitation.username)fail(`Откройте приглашение из аккаунта @${invitation.username}`,403);
   const created=await insert('users',{telegram_id:tgId,first_name:tg.first_name||invitation.first_name||'Team',last_name:tg.last_name||invitation.last_name||'',username:tg.username||null,photo_url:tg.photo_url||null,role:invitation.role,is_active:true});user=created[0];
   await update('invitations',{status:'accepted',accepted_by:user.id,accepted_at:new Date().toISOString()},{id:f(invitation.id)});
  }
  if(!user&&managerIds.has(tgId)){const created=await insert('users',{telegram_id:tgId,first_name:tg.first_name||'Manager',last_name:tg.last_name||'',username:tg.username||null,photo_url:tg.photo_url||null,role:'admin',is_active:true});user=created[0];}
  if(!user)fail('Access by invitation only. Ask your Project Manager to add your Telegram ID.',403);
  if(!user.is_active)fail('Account disabled',403);
  const nextRole=managerIds.has(tgId)?'admin':user.role;
  const updated=await update('users',{username:tg.username||null,first_name:tg.first_name||user.first_name,last_name:tg.last_name||user.last_name,photo_url:tg.photo_url||user.photo_url||null,role:nextRole},{id:f(user.id)});
  user=updated[0]||user;
  return ok(res,{token:issueSession(user.id,SESSION_SECRET),user});
 }
 const u=await auth(req);
 if(pathname==='/api/me'&&method==='GET')return ok(res,{user:u});
 if(pathname==='/api/users'&&method==='GET'){
  if(!isPm(u))fail('Restricted to Project Managers',403);
  const people=await table('users',{order:'first_name.asc'});
  const invitations=await table('invitations',{filters:{status:'eq.pending'},order:'created_at.desc'}).catch(()=>[]);
  return ok(res,{people:people.map(x=>({id:x.id,telegram_id:x.telegram_id,username:x.username,first_name:x.first_name,last_name:x.last_name,role:x.role,photo_url:x.photo_url,is_active:x.is_active})),invitations:invitations.map(x=>({id:x.id,username:x.username,first_name:x.first_name,last_name:x.last_name,role:x.role,expires_at:x.expires_at}))});
 }
 if(pathname==='/api/users'&&method==='POST'){
  if(!isPm(u))fail('Restricted to Project Managers',403);
  const b=await json(req);const username=cleanUsername(b.username);const role=b.role==='foreman'?'foreman':'installer';
  const known=await one('users',{username:f(username)});if(known)return ok(res,{user:known,already_joined:true});
  await update('invitations',{status:'revoked'},{username:f(username),status:'eq.pending'}).catch(()=>{});
  const token=crypto.randomBytes(24).toString('base64url');
  const invitation=(await insert('invitations',{username,first_name:str(b.first_name||username,100),last_name:str(b.last_name||'',100,false),role,token_hash:tokenHash(token),status:'pending',invited_by:u.id}))[0];
  const bot=process.env.TELEGRAM_BOT_USERNAME;return ok(res,{invitation:{id:invitation.id,username,role,invite_url:`https://t.me/${bot}?start=invite_${token}`}},201);
 }
 if(pathname==='/api/projects'&&method==='GET'){
  let projects,memberships;
  if(isPm(u))projects=await table('projects',{filters:{status:'neq.archived'},order:'created_at.desc',limit:100});
  else {memberships=await table('project_members',{filters:{user_id:f(u.id)}});projects=memberships.length?await table('projects',{filters:{id:`in.(${memberships.map(x=>x.project_id).join(',')})`,status:'neq.archived'},order:'created_at.desc',limit:100}):[];}
  if(!projects.length)return ok(res,{projects:[]});
  memberships||=await table('project_members',{filters:{project_id:`in.(${projects.map(x=>x.id).join(',')})`}});
  const ids=[...new Set([...projects.map(x=>x.pm_id),...memberships.map(x=>x.user_id)].filter(Boolean))];
  const people=ids.length?await table('users',{filters:{id:`in.(${ids.join(',')})`}}):[];
  const publicPerson=id=>{const x=people.find(y=>y.id===id);return x?{id:x.id,first_name:x.first_name,last_name:x.last_name,username:x.username,photo_url:x.photo_url}:null;};
  const enriched=projects.map(p=>{const members=memberships.filter(x=>x.project_id===p.id);return {...p,pm:publicPerson(p.pm_id),foreman:publicPerson(members.find(x=>x.role==='foreman')?.user_id),crew:members.map(x=>publicPerson(x.user_id)).filter(Boolean)};});
  ok(res,{projects:enriched});void warmProjectBundles(u,projects);return;
 }
 if(pathname==='/api/projects'&&method==='POST'){
  if(!isPm(u))fail('PM required',403);const b=await json(req);
  const type=['installation','repair','punch_list'].includes(b.type)?b.type:'installation';
  const code=`WP-${new Date().getFullYear().toString().slice(2)}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const scheduled=b.scheduled_for||null;if(scheduled&&!validDate(scheduled))fail('Invalid scheduled date');
  let pm=u;if(b.pm_id){if(!uuid(b.pm_id))fail('Invalid PM');pm=await one('users',{id:f(b.pm_id)});if(!pm||!pm.is_active||!isPm(pm))fail('Choose an active Project Manager');}
  const payload={p_code:code,p_title:str(b.title,120),p_address:str(b.address,300),p_client_name:str(b.client_name||'',120,false),p_scheduled_for:scheduled,p_project_type:type,p_notes:str(b.notes||'',2000,false),p_pm_id:pm.id,p_created_by:u.id,p_stages:stagesFor(type)};
  const p=(await rpc('fieldops_create_project',payload))[0];
  if(!p)fail('Project creation failed',502);
  return ok(res,{project:p},201);
 }
 let match=pathname.match(/^\/api\/projects\/([0-9a-f-]{36})$/i);
 if(match&&method==='GET')return ok(res,await projectBundle(u,match[1],{fresh:uri.searchParams.get('fresh')==='1'}));
 if(match&&method==='PATCH'){
  const p=await projectAccess(u,match[1],{pmOnly:true});const b=await json(req);const patch={};
  if(b.title!==undefined)patch.title=str(b.title,120);if(b.address!==undefined)patch.address=str(b.address,300);
  if(b.client_name!==undefined)patch.client_name=str(b.client_name,120,false);if(b.notes!==undefined)patch.notes=str(b.notes,2000,false);
  if(b.scheduled_for!==undefined){if(b.scheduled_for&&!validDate(b.scheduled_for))fail('Invalid scheduled date');patch.scheduled_for=b.scheduled_for||null;}
  if(b.pm_id!==undefined){if(!uuid(b.pm_id))fail('Invalid PM');const pm=await one('users',{id:f(b.pm_id)});if(!pm||!pm.is_active||!isPm(pm))fail('Choose an active Project Manager');patch.pm_id=pm.id;}
  const result=(await update('projects',patch,{id:f(p.id)}))[0];return ok(res,{project:result});
 }
 match=pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/archive$/i);
 if(match&&method==='POST'){
  const p=await projectAccess(u,match[1],{pmOnly:true});if(p.status==='archived')return ok(res,{project:p});
  const result=(await update('projects',{status:'archived'},{id:f(p.id)}))[0];invalidateProject(p.id);return ok(res,{project:result});
 }
 match=pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/assign$/i);
 if(match&&method==='POST'){
  const p=await projectAccess(u,match[1],{pmOnly:true});const b=await json(req);
  if(!['active','needs_changes'].includes(p.status))fail('Project is locked',409);
  if(!uuid(b.user_id))fail('Select a worker');const user=await one('users',{id:f(b.user_id)});if(!user||!user.is_active||!['foreman','installer'].includes(user.role))fail('Choose an active worker');
  const role=b.role==='foreman'?'foreman':'installer';if(role==='foreman')await remove('project_members',{project_id:f(p.id),role:'eq.foreman'});
  const members=await insert('project_members',{project_id:p.id,user_id:user.id,role},{upsert:true,conflict:'project_id,user_id'});
  void sendTelegram(user.telegram_id,`WallPanels FieldOps\nAssigned: ${p.title}\n${p.address}\nOpen @${process.env.TELEGRAM_BOT_USERNAME||'your bot'} to view the project.`);
  return ok(res,{member:members[0]},201);
 }
 match=pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/members\/([0-9a-f-]{36})$/i);
 if(match&&method==='DELETE'){
  const p=await projectAccess(u,match[1],{pmOnly:true});const removed=await remove('project_members',{project_id:f(p.id),user_id:f(match[2])});return ok(res,{removed});
 }
 match=pathname.match(/^\/api\/stages\/([0-9a-f-]{36})\/categories$/i);
 if(match&&method==='POST'){
  const stage=await one('project_stages',{id:f(match[1])});if(!stage)fail('Stage missing',404);
  const project=await projectAccess(u,stage.project_id,{pmOnly:true});if(!['active','needs_changes'].includes(project.status))fail('Project is locked',409);
  const body=await json(req);const label=str(body.label,90);const kind=body.kind==='video'?'video':'image';
  if((stage.media_requirements||[]).length>=25)fail('Maximum 25 categories per stage',409);
  const entry={key:`custom_${crypto.randomBytes(5).toString('hex')}`,label,kind,required:body.required===true};
  const result=await update('project_stages',{media_requirements:[...(stage.media_requirements||[]),entry]},{id:f(stage.id)});
  return ok(res,{stage:result[0]},201);
 }
 match=pathname.match(/^\/api\/checks\/([0-9a-f-]{36})$/i);
 if(match&&method==='POST'){
  const item=await one('stage_check_items',{id:f(match[1])});if(!item)fail('Checklist item not found',404);
  const project=await projectAccess(u,item.project_id);if(!['active','needs_changes'].includes(project.status))fail('Project locked for editing',409);const b=await json(req);
  const status=b.done===true?'done':'pending';const out=await insert('stage_check_results',{project_id:item.project_id,check_item_id:item.id,status,completed_by:status==='done'?u.id:null,updated_at:new Date().toISOString()},{upsert:true,conflict:'check_item_id'});
  if(status==='pending')await remove('stage_completions',{stage_id:f(item.stage_id)});
  invalidateProject(item.project_id);
  return ok(res,{result:out[0]});
 }
 match=pathname.match(/^\/api\/stages\/([0-9a-f-]{36})\/complete$/i);
 if(match&&method==='POST'){
  const stage=await one('project_stages',{id:f(match[1])});if(!stage)fail('Stage missing',404);await projectAccess(u,stage.project_id);await requireForeman(u,stage.project_id);
  const bundle=await projectBundle(u,stage.project_id,{fresh:true});const current=bundle.stages.find(x=>x.id===stage.id);if(!current?.completion.done)fail(`Сначала выполните: ${[...(current?.completion.missingMedia||[]),...(current?.completion.missingChecks||[])].join(', ')}`,409);
  const existing=await one('stage_completions',{stage_id:f(stage.id)});if(existing)return ok(res,{completion:existing});
  const result=await insert('stage_completions',{project_id:stage.project_id,stage_id:stage.id,completed_by:u.id,completed_at:new Date().toISOString()},{upsert:true,conflict:'stage_id'});invalidateProject(stage.project_id);return ok(res,{completion:result[0]});
 }
 match=pathname.match(/^\/api\/stages\/([0-9a-f-]{36})\/comments$/i);
 if(match&&method==='POST'){
  const stage=await one('project_stages',{id:f(match[1])});if(!stage)fail('Stage missing',404);await projectAccess(u,stage.project_id);const b=await json(req);
  const comment=(await insert('stage_comments',{project_id:stage.project_id,stage_id:stage.id,author_id:u.id,body:str(b.body,2000)}))[0];invalidateProject(stage.project_id);return ok(res,{comment:{...comment,author:{id:u.id,first_name:u.first_name,last_name:u.last_name},can_edit:true}},201);
 }
 match=pathname.match(/^\/api\/comments\/([0-9a-f-]{36})$/i);
 if(match&&method==='PATCH'){
  const comment=await one('stage_comments',{id:f(match[1])});if(!comment)fail('Comment missing',404);await projectAccess(u,comment.project_id);if(comment.author_id!==u.id)fail('Only the author can edit this comment',403);const b=await json(req);
  const result=(await update('stage_comments',{body:str(b.body,2000),updated_at:new Date().toISOString()},{id:f(comment.id)}))[0];invalidateProject(comment.project_id);return ok(res,{comment:{...result,author:{id:u.id,first_name:u.first_name,last_name:u.last_name},can_edit:true}});
 }
 if(match&&method==='DELETE'){
  const comment=await one('stage_comments',{id:f(match[1])});if(!comment)fail('Comment missing',404);await projectAccess(u,comment.project_id);if(comment.author_id!==u.id)fail('Only the author can delete this comment',403);await remove('stage_comments',{id:f(comment.id)});invalidateProject(comment.project_id);return ok(res,{deleted:true});
 }
 match=pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/media$/i);
 if(match&&method==='POST'){
  const p=await projectAccess(u,match[1]);if(!['active','needs_changes'].includes(p.status))fail('Project is locked for editing',409);
  const stageId=uri.searchParams.get('stage_id'), dayId=uri.searchParams.get('day_id'), issueId=uri.searchParams.get('issue_id'),category=uri.searchParams.get('category');
  if(!/^[a-z0-9_]{2,45}$/.test(category||''))fail('Invalid photo category');
  if([stageId,dayId,issueId].filter(Boolean).length!==1)fail('Specify exactly one stage, day report or issue');
  let stage=null,day=null,issue=null;
  if(stageId){if(!uuid(stageId))fail('Invalid stage');stage=await one('project_stages',{id:f(stageId),project_id:f(p.id)});if(!stage)fail('Stage not part of project');}
  if(issueId){if(!uuid(issueId))fail('Invalid issue');issue=await one('issues',{id:f(issueId),project_id:f(p.id)});if(!issue)fail('Issue not found');if(issue.status!=='open')fail('Resolved issue evidence is locked',409);if(category!=='issue_evidence')fail('Issue category invalid');}
  if(dayId){if(!uuid(dayId))fail('Invalid day');day=await one('daily_reports',{id:f(dayId),project_id:f(p.id)});if(!day||!['open','changes'].includes(day.status))fail('Daily report not editable',409);if(category!=='daily_site')fail('Day category invalid');}
  const mime=String(req.headers['content-type']||'').split(';')[0].toLowerCase();const size=Number(req.headers['content-length']);
  const {kind,extension:ext}=validateUploadMetadata(mime,size);
  if(day&&kind!=='image')fail('Ежедневный отчёт принимает только фотографии',415);
  if(stage){const requirement=(stage.media_requirements||[]).find(r=>r.key===category);if(!requirement||requirement.kind!==kind)fail('File type does not match selected category');}
  const storagePath=`projects/${p.id}/${crypto.randomUUID()}.${ext}`;const filename=cleanFileName(req.headers['x-file-name']);let mediaRecord=null;
  const uploadStream=await inspectUploadStream(req,mime,size);
  await uploadObject(storagePath,uploadStream,mime,size);
  try{
    const items=await insert('project_media',{project_id:p.id,stage_id:stage?.id||null,daily_report_id:day?.id||null,issue_id:issue?.id||null,category_key:category,kind,file_name:filename,mime_type:mime,byte_size:size,storage_path:storagePath,uploaded_by:u.id});mediaRecord=items[0]||null;
    const saved=items[0]&&await one('project_media',{id:f(items[0].id),deleted_at:'is.null'});if(!saved||saved.storage_path!==storagePath)fail('Upload could not be verified',502);
    invalidateProject(p.id);return ok(res,{media:{...saved,url:await signedUrl(storagePath)}},201);
  }catch(e){if(mediaRecord?.id)try{await update('project_media',{deleted_at:new Date().toISOString(),deleted_by:u.id,deletion_reason:'Upload verification failed'},{id:f(mediaRecord.id)});}catch{}try{await deleteObject(storagePath);}catch{}throw e;}
 }
 match=pathname.match(/^\/api\/media\/([0-9a-f-]{36})$/i);
 if(match&&method==='DELETE'){
  const media=await one('project_media',{id:f(match[1]),deleted_at:'is.null'});if(!media)fail('Файл не найден',404);
  const p=await projectAccess(u,media.project_id);if(!['active','needs_changes'].includes(p.status))fail('Сначала верните проект на исправление',409);
  const role=await projectRole(u,p.id);if(media.uploaded_by!==u.id&&!['admin','pm','foreman'].includes(role))fail('Удалить файл может автор, бригадир или руководитель',403);
  if(media.daily_report_id){const day=await one('daily_reports',{id:f(media.daily_report_id)});if(!day||!['open','changes'].includes(day.status))fail('Сначала верните ежедневный отчёт на исправление',409);}
  if(media.issue_id){const issue=await one('issues',{id:f(media.issue_id)});if(!issue||issue.status!=='open')fail('Материалы закрытой проблемы заблокированы',409);}
  const updated=(await update('project_media',{deleted_at:new Date().toISOString(),deleted_by:u.id,deletion_reason:'Ошибочная загрузка / замена'},{id:f(media.id),deleted_at:'is.null'}))[0];if(!updated)fail('Файл уже удалён',409);
  if(media.stage_id)await remove('stage_completions',{stage_id:f(media.stage_id)});
  try{await deleteObject(media.storage_path);}catch(e){console.error('Storage cleanup after media deletion failed',e.message);}
  invalidateProject(p.id);return ok(res,{deleted:true,media_id:media.id});
 }
 match=pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/days$/i);
 if(match&&method==='POST'){
  const p=await projectAccess(u,match[1]);if(!['active','needs_changes'].includes(p.status))fail('Project locked',409);
  const b=await json(req);const date=b.report_date||currentDate();if(!validDate(date))fail('Invalid report date');
  let day=await one('daily_reports',{project_id:f(p.id),report_date:f(date)});
  if(!day)day=(await insert('daily_reports',{project_id:p.id,report_date:date,created_by:u.id,checks:{},status:'open'}))[0];
  return ok(res,{day});
 }
 match=pathname.match(/^\/api\/days\/([0-9a-f-]{36})\/check$/i);
 if(match&&method==='POST'){
  const day=await one('daily_reports',{id:f(match[1])});if(!day)fail('Report missing',404);const project=await projectAccess(u,day.project_id);if(!['active','needs_changes'].includes(project.status))fail('Project locked',409);
  if(!['open','changes'].includes(day.status))fail('Report locked',409);
  const b=await json(req);if(!DAY_CHECKS.some(c=>c.key===b.key)||typeof b.done!=='boolean')fail('Invalid checklist item');
  const checks={...(day.checks||{}),[b.key]:b.done};const out=await update('daily_reports',{checks},{id:f(day.id)});invalidateProject(day.project_id);return ok(res,{day:out[0]});
 }
 match=pathname.match(/^\/api\/days\/([0-9a-f-]{36})\/submit$/i);
 if(match&&method==='POST'){
  const day=await one('daily_reports',{id:f(match[1])});if(!day)fail('Report missing',404);const p=await projectAccess(u,day.project_id);await requireForeman(u,p.id);
  if(!['open','changes'].includes(day.status))fail('Report not editable',409);
  const photos=await table('project_media',{filters:{daily_report_id:f(day.id),deleted_at:'is.null'}});
  if(!photos.some(x=>x.kind==='image'&&x.category_key==='daily_site'))fail('Upload at least one end-of-day photo',409);
  const missing=DAY_CHECKS.filter(c=>!day.checks?.[c.key]);if(missing.length)fail(`Complete daily checklist: ${missing.map(x=>x.label).join(', ')}`,409);
  const r=await update('daily_reports',{status:'submitted',submitted_at:new Date().toISOString(),submitted_by:u.id},{id:f(day.id)});
  invalidateProject(p.id);await notifyPM(p,`FieldOps: End-of-day report submitted\n${p.title}\n${day.report_date}`);return ok(res,{day:r[0]});
 }
 match=pathname.match(/^\/api\/days\/([0-9a-f-]{36})\/review$/i);
 if(match&&method==='POST'){
  const day=await one('daily_reports',{id:f(match[1])});if(!day)fail('Report missing',404);await projectAccess(u,day.project_id,{pmOnly:true});
  if(!['submitted','approved'].includes(day.status))fail('Report not submitted',409);const b=await json(req);
  if(!['approved','changes'].includes(b.status))fail('Invalid review status');
  if(b.status==='changes'&&!String(b.note||'').trim())fail('Reason required');
  if(day.submitted_by===u.id&&u.role!=='admin')fail('Self-approval is restricted',403);
  const r=await update('daily_reports',{status:b.status,pm_note:String(b.note||'').slice(0,1500),reviewed_by:u.id,reviewed_at:new Date().toISOString()},{id:f(day.id)});const worker=day.submitted_by?await one('users',{id:f(day.submitted_by)}):null;if(worker)void sendTelegram(worker.telegram_id,`FieldOps: Daily report ${b.status}\n${day.report_date}\n${b.note||''}`);return ok(res,{day:r[0]});
 }
 match=pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/issues$/i);
 if(match&&method==='POST'){
  const p=await projectAccess(u,match[1]);if(!['active','needs_changes'].includes(p.status))fail('Project locked',409);const b=await json(req);
  const kind=['damage','quality','change_request','other'].includes(b.kind)?b.kind:'other';
  const issue=(await insert('issues',{project_id:p.id,reported_by:u.id,kind,title:str(b.title,120),description:str(b.description,1500),status:'open'}))[0];
  const event=await createProjectEvent(p.id,'issue_reported',`Проблема: ${issue.title}`,issue.description,u.id,'issue',issue.id);
  void notifyManagers(p,`event:${event.id}`,`FieldOps ISSUE — ${p.title}\n${issue.title}\nType: ${kind}\nReview immediately. Any affected work must stop pending instructions.`);
  return ok(res,{issue},201);
 }
 match=pathname.match(/^\/api\/issues\/([0-9a-f-]{36})\/resolve$/i);
 if(match&&method==='POST'){
  const issue=await one('issues',{id:f(match[1])});if(!issue)fail('Issue not found',404);await projectAccess(u,issue.project_id,{pmOnly:true});const b=await json(req);
  if(['damage','quality'].includes(issue.kind)&&!(await one('project_media',{issue_id:f(issue.id),kind:'eq.image',deleted_at:'is.null'})))fail('Add photographic evidence before resolving this issue',409);
  const result=(await update('issues',{status:'resolved',resolution:str(b.resolution,1500),resolved_by:u.id,resolved_at:new Date().toISOString()},{id:f(issue.id)}))[0];const reporter=await one('users',{id:f(issue.reported_by)});if(reporter)void sendTelegram(reporter.telegram_id,`FieldOps issue resolved: ${issue.title}\n${result.resolution}`);return ok(res,{issue:result});
 }
 match=pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/exceptions$/i);
 if(match&&method==='POST'){
  const p=await projectAccess(u,match[1]);if(!['active','needs_changes'].includes(p.status))fail('Project locked',409);const b=await json(req);
  const stage=await one('project_stages',{id:f(b.stage_id),project_id:f(p.id)});if(!stage)fail('Invalid stage');
  const target=(stage.media_requirements||[]).find(x=>x.key===b.category_key&&x.required);if(!target)fail('Exception not applicable');
  if(!canExcludeRequirement(stage,target))fail('Обязательные материалы ДО/ПОСЛЕ и фото флагов нельзя исключить',409);
  const existing=await one('stage_exceptions',{stage_id:f(stage.id),category_key:f(b.category_key)});
  if(existing?.status==='approved')fail('Already approved',409);
  const payload={project_id:p.id,stage_id:stage.id,category_key:target.key,reason:str(b.reason,500),requested_by:u.id,status:'pending',reviewed_by:null,reviewed_at:null};
  const entry=existing?(await update('stage_exceptions',payload,{id:f(existing.id)}))[0]:(await insert('stage_exceptions',payload))[0];
  const event=await createProjectEvent(p.id,'exception_requested',`Запрошено исключение: ${target.label}`,payload.reason,u.id,'stage_exception',entry.id);
  void notifyManagers(p,`event:${event.id}`,`FieldOps: N/A approval requested\n${p.title}\n${stage.title} → ${target.label}\nReason: ${payload.reason}`);
  return ok(res,{exception:entry});
 }
 match=pathname.match(/^\/api\/exceptions\/([0-9a-f-]{36})\/review$/i);
 if(match&&method==='POST'){
  const item=await one('stage_exceptions',{id:f(match[1])});if(!item)fail('Exception missing',404);await projectAccess(u,item.project_id,{pmOnly:true});const b=await json(req);
  if(!['approved','rejected'].includes(b.status))fail('Invalid status');
  const reviewedAt=new Date().toISOString();const r=(await update('stage_exceptions',{status:b.status,reviewed_by:u.id,reviewed_at:reviewedAt},{id:f(item.id)}))[0];
  await createProjectEvent(item.project_id,'exception_reviewed',`Исключение ${b.status==='approved'?'одобрено':'отклонено'}`,item.reason,u.id,'stage_exception',item.id);
  const requester=await one('users',{id:f(item.requested_by)});if(requester)void sendTelegram(requester.telegram_id,`FieldOps photo exception ${b.status}\n${item.category_key}`);return ok(res,{exception:r});
 }
 match=pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/confirmation$/i);
 if(match&&method==='POST'){
  const p=await projectAccess(u,match[1]);if(!['active','needs_changes'].includes(p.status))fail('Project locked',409);const b=await json(req);
  if(!['signed','refused'].includes(b.outcome))fail('Choose signed or refused');
  const notes=str(b.notes||'',1000,false);if(b.outcome==='refused'&&!notes)fail('Reason for refusal is required');
  const r=await insert('client_confirmations',{project_id:p.id,outcome:b.outcome,notes,recorded_by:u.id,recorded_at:new Date().toISOString()},{upsert:true,conflict:'project_id'});return ok(res,{confirmation:r[0]});
 }
 match=pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/submit$/i);
 if(match&&method==='POST'){
  const p=await projectAccess(u,match[1]);if(!['active','needs_changes'].includes(p.status))fail('Project cannot be submitted',409);
  const bundle=await projectBundle(u,p.id,{fresh:true});assertProjectSubmittable(bundle);
  const result=(await update('projects',{status:'in_review',submitted_by:u.id,submitted_at:new Date().toISOString()},{id:f(p.id)}))[0];await notifyPM(p,`FieldOps: Project ready for review\n${p.title}`);return ok(res,{project:result});
 }
 match=pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/review$/i);
 if(match&&method==='POST'){
  const p=await projectAccess(u,match[1],{pmOnly:true});if(!['in_review','completed'].includes(p.status))fail('Project not in review',409);
  if(p.status==='in_review'&&p.submitted_by===u.id&&u.role!=='admin')fail('Self-approval restricted',403);const b=await json(req);
  if(!['completed','needs_changes'].includes(b.status))fail('Invalid review');const note=str(b.note||'',1000,false);
  if(p.status==='completed'&&b.status!=='needs_changes')fail('Completed project can only be returned for corrections',409);
  if(b.status==='needs_changes'&&!note)fail('Please explain requested changes');
  const result=(await update('projects',{status:b.status,review_note:note,reviewed_by:u.id,reviewed_at:new Date().toISOString()},{id:f(p.id)}))[0];await notifyCrew(p,`FieldOps project ${b.status==='completed'?'approved':'returned for corrections'}\n${p.title}${note?'\nPM: '+note:''}`);return ok(res,{project:result});
 }
 fail('API route not found',404);
}
const mimeMap={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.png':'image/png','.ico':'image/x-icon'};
async function serve(req,res,pathname){
  let p=pathname==='/'?'/index.html':pathname;
  try{p=decodeURIComponent(p);}catch{return fail('Bad URL');}
  const file=path.resolve(root,`.${p}`);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return fail('Not found',404);
  res.writeHead(200,{'Content-Type':mimeMap[path.extname(file)]||'application/octet-stream','Cache-Control':file.endsWith('index.html')?'no-cache':'public, max-age=3600'});
  fs.createReadStream(file).pipe(res);
}
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  // Telegram WebView needs embedding; CSP frame-ancestors restricts framing.
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self'; frame-ancestors 'self' https://web.telegram.org; object-src 'none'; base-uri 'none'");
  try{const uri=new URL(req.url,`http://${req.headers.host||'localhost'}`);if((process.env.NODE_ENV==='production'||process.env.APP_BASE_URL?.startsWith('https://'))&&uri.searchParams.has('preview')){uri.searchParams.delete('preview');res.writeHead(302,{Location:`${uri.pathname}${uri.search}`});return res.end();}if(uri.pathname.startsWith('/api/'))await api(req,res,uri);else if(req.method==='GET'||req.method==='HEAD')await serve(req,res,uri.pathname);else fail('Method not allowed',405);}catch(e){if(!res.headersSent)err(res,e);else res.destroy();}
});
async function telegramCall(method,body){const response=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(36000)});const data=await response.json();if(!data.ok)throw new Error(`Telegram ${method} error: ${data.error_code}`);return data.result;}
async function polling(){let offset=0;const appUrl=process.env.APP_BASE_URL;
 if(appUrl?.startsWith('https://'))try{await telegramCall('setChatMenuButton',{menu_button:{type:'web_app',text:'Open FieldOps',web_app:{url:appUrl}}});}catch(e){console.error('Menu setup',e.message);}
 while(true){try{
   const updates=await telegramCall('getUpdates',{offset,timeout:25,allowed_updates:['message']});
   for(const up of updates){offset=up.update_id+1;const m=up.message;if(!m?.text?.startsWith('/start'))continue;
     const startArg=m.text.trim().split(/\s+/,2)[1]||'';const invite=startArg.startsWith('invite_')?startArg.slice(7):'';
     const text=`WallPanels FieldOps\nYour Telegram ID: ${m.from?.id}\nShare this number with your Project Manager for access.\nTap the button below to open your workspace.`;
     const launchUrl=invite?`${appUrl.replace(/\/$/,'')}/?invite=${encodeURIComponent(invite)}`:appUrl;
     const extra=appUrl?.startsWith('https://')?{reply_markup:{inline_keyboard:[[{text:'Open FieldOps',web_app:{url:launchUrl}}]]}}:{};
     await sendTelegram(m.chat.id,text,extra);
   }
 }catch(e){console.error('Bot polling:',e.message);await new Promise(r=>setTimeout(r,6000));}}
}
try{const demoOnly=process.env.NODE_ENV!=='production'&&process.env.DEMO_ONLY==='true';if(!demoOnly)requireEnv();server.listen(port,'0.0.0.0',()=>{console.log(`WallPanels FieldOps listening on ${port}${demoOnly?' (preview-only)':''}`);if(!demoOnly){void syncProjectTemplates().catch(e=>console.error('Template sync:',e.message));void polling();}});}catch(e){console.error('Cannot start FieldOps:',e.message);process.exit(1);}
