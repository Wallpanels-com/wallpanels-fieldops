import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Mini App demo boots without Telegram or network and renders key views',async()=>{
 const appRoot={innerHTML:''};
 globalThis.sessionStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
 globalThis.location={search:'?preview=1'};
 const handlers={};
 globalThis.window={addEventListener:(type,cb)=>handlers[type]=cb,scrollTo:()=>{},Telegram:null};
 globalThis.document={querySelector:(selector)=>selector==='#app'?appRoot:null};
 await import('../public/app.js');
 await new Promise(resolve=>setTimeout(resolve,60));
 assert.doesNotMatch(appRoot.innerHTML,/Good (morning|afternoon|evening)/);
 assert.match(appRoot.innerHTML,/Miami Residence/);
 assert.doesNotMatch(appRoot.innerHTML,/preview-banner/);
 assert.match(appRoot.innerHTML,/Поиск проектов/);
 assert.match(appRoot.innerHTML,/project-card-heading/);
 assert.doesNotMatch(appRoot.innerHTML,/stats-grid/);
 assert.doesNotMatch(appRoot.innerHTML,/Recent projects/);
 assert.match(appRoot.innerHTML,/class="nav-create"/);
 assert.match(appRoot.innerHTML,/data-modal="create"/);
 assert.match(appRoot.innerHTML,/WALLPANELS/);
 const fire=(action,attributes={})=>handlers.click({target:{closest:()=>({dataset:{action,...attributes},classList:{contains:()=>false}})},preventDefault:()=>{}});
 fire('open-project',{id:'demo-project'});await new Promise(r=>setTimeout(r,70));
 assert.match(appRoot.innerHTML,/Этапы монтажа/);
 fire('open-stage',{id:'s2'});await new Promise(r=>setTimeout(r,50));
 assert.match(appRoot.innerHTML,/Обязательные материалы/);
 assert.match(appRoot.innerHTML,/BEFORE video/);
 assert.match(appRoot.innerHTML,/Завершить этап|Этап завершён/);
 assert.match(appRoot.innerHTML,/data-action="media-menu"/);
 fire('view',{view:'installer'});await new Promise(r=>setTimeout(r,30));
 assert.equal((appRoot.innerHTML.match(/class="nav-link/g)||[]).length,2);
 assert.doesNotMatch(appRoot.innerHTML,/data-page="profile"/);
});

test('mobile interactions use optimistic saves, bounded uploads and confirmed archive removal',async()=>{
 const [app,server,styles]=await Promise.all([
  readFile(new URL('../public/app.js',import.meta.url),'utf8'),
  readFile(new URL('../server/index.js',import.meta.url),'utf8'),
  readFile(new URL('../public/styles.css',import.meta.url),'utf8')
 ]);
 assert.match(app,/if\(target\.dataset\.checkId\)\{void saveStageCheck\(target\)/);
 assert.match(app,/Promise\.all\(\[worker\(\),worker\(\),worker\(\)\]\)/);
 assert.doesNotMatch(app,/await Promise\.all\(\[worker\(\),worker\(\)\]\);uploadQueueRunning=false;\s*try\{await refreshCurrent/);
 assert.match(app,/Точно удалить «\$\{project\.title\}» из рабочего списка/);
 assert.match(app,/state\.projects=state\.projects\.filter\(p=>p\.id!==project\.id\)/);
 assert.match(server,/filters:\{status:'neq\.archived'\}/);
 assert.match(styles,/\.project-card-heading\{display:grid;grid-template-columns:minmax\(0,1fr\) auto;align-items:center/);
});
