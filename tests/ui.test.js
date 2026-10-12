import test from 'node:test';
import assert from 'node:assert/strict';

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
 assert.match(appRoot.innerHTML,/Active Projects/);
 assert.doesNotMatch(appRoot.innerHTML,/Recent projects/);
 assert.match(appRoot.innerHTML,/class="nav-create"/);
 assert.match(appRoot.innerHTML,/data-modal="create"/);
 assert.match(appRoot.innerHTML,/WALLPANELS/);
 const fire=(action,attributes={})=>handlers.click({target:{closest:()=>({dataset:{action,...attributes},classList:{contains:()=>false}})},preventDefault:()=>{}});
 fire('open-project',{id:'demo-project'});await new Promise(r=>setTimeout(r,70));
 assert.match(appRoot.innerHTML,/Installation stages/);
 fire('open-stage',{id:'s2'});await new Promise(r=>setTimeout(r,50));
 assert.match(appRoot.innerHTML,/Обязательные материалы/);
 assert.match(appRoot.innerHTML,/BEFORE video/);
 assert.match(appRoot.innerHTML,/Завершить этап|Этап завершён/);
 assert.match(appRoot.innerHTML,/data-action="media-menu"/);
});
