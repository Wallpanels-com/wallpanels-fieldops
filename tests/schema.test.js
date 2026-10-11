import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/001_fieldops.sql',import.meta.url),'utf8');

test('Migration keeps data private and exposes only the transactional server RPC',()=>{
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/revoke all on public\.%I from anon, authenticated/i);
  assert.match(sql,/values\('fieldops-media','fieldops-media',false/i);
  assert.match(sql,/create or replace function public\.fieldops_create_project/i);
  assert.match(sql,/revoke all on function public\.fieldops_create_project[\s\S]+from public, anon, authenticated/i);
  assert.match(sql,/grant execute on function public\.fieldops_create_project[\s\S]+to service_role/i);
});

test('Migration enforces cross-project reference integrity and immutable audit rows',()=>{
  assert.match(sql,/project_media_stage_project_fk/i);
  assert.match(sql,/project_media_day_project_fk/i);
  assert.match(sql,/project_media_issue_project_fk/i);
  assert.match(sql,/stage_check_results_item_project_fk/i);
  assert.match(sql,/fieldops_audit_immutable/i);
});
