import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/001_fieldops.sql',import.meta.url),'utf8');
const productionSql=fs.readFileSync(new URL('../supabase/migrations/002_production_workflow.sql',import.meta.url),'utf8');
const hardeningSql=fs.readFileSync(new URL('../supabase/migrations/003_media_history_events.sql',import.meta.url),'utf8');

test('Migration keeps data private and exposes only the transactional server RPC',()=>{
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/revoke all on public\.%I from anon, authenticated/i);
  assert.match(sql,/values\('fieldops-media','fieldops-media',false/i);
  assert.match(sql,/create or replace function public\.fieldops_create_project/i);
  assert.match(sql,/revoke all on function public\.fieldops_create_project[\s\S]+from public, anon, authenticated/i);
  assert.match(sql,/grant execute on function public\.fieldops_create_project[\s\S]+to service_role/i);
});

test('Production migration is additive, private and preserves project history',()=>{
  assert.doesNotMatch(productionSql,/drop table|truncate/i);
  assert.match(productionSql,/create table if not exists public\.invitations/i);
  assert.match(productionSql,/create table if not exists public\.stage_comments/i);
  assert.match(productionSql,/create table if not exists public\.stage_completions/i);
  assert.match(productionSql,/enable row level security/i);
  assert.match(productionSql,/fieldops_sync_project_template/i);
  assert.match(productionSql,/on conflict\(stage_id,item_key\) do nothing/i);
});

test('Migration enforces cross-project reference integrity and immutable audit rows',()=>{
  assert.match(sql,/project_media_stage_project_fk/i);
  assert.match(sql,/project_media_day_project_fk/i);
  assert.match(sql,/project_media_issue_project_fk/i);
  assert.match(sql,/stage_check_results_item_project_fk/i);
  assert.match(sql,/fieldops_audit_immutable/i);
});
test('Media history migration is additive, private and notification-safe',()=>{
  assert.doesNotMatch(hardeningSql,/drop table|truncate/i);
  assert.match(hardeningSql,/project_media add column if not exists deleted_at/i);
  assert.match(hardeningSql,/create table if not exists public\.project_events/i);
  assert.match(hardeningSql,/unique\(event_key,recipient_telegram_id\)/i);
  assert.match(hardeningSql,/enable row level security/i);
});
