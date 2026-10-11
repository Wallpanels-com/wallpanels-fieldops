-- WallPanels FieldOps v1. Run ONCE against the dedicated CORPORATE Supabase project.
-- All application data is accessed by the Node server using the new sb_secret API key.
-- No browser client may read these tables directly; RLS is enabled and no anon policies are granted.
create extension if not exists pgcrypto;
create schema if not exists fieldops_private;
revoke all on schema fieldops_private from public, anon, authenticated;

create table if not exists public.users (
 id uuid primary key default gen_random_uuid(), telegram_id text not null unique,
 first_name text not null, last_name text not null default '', username text,
 role text not null check(role in ('admin','pm','installer')) default 'installer',
 is_active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.projects (
 id uuid primary key default gen_random_uuid(), code text not null unique,
 title text not null, address text not null, client_name text not null default '',
 project_type text not null check(project_type in ('installation','repair','punch_list')),
 scheduled_for date, notes text not null default '',
 status text not null default 'active' check(status in ('draft','active','in_review','needs_changes','completed','archived')),
 pm_id uuid not null references public.users(id),created_by uuid not null references public.users(id),
 submitted_by uuid references public.users(id),submitted_at timestamptz,
 reviewed_by uuid references public.users(id),reviewed_at timestamptz,review_note text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.project_members (
 project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid not null references public.users(id),
 role text not null default 'installer' check(role in ('installer','lead')),
 created_at timestamptz not null default now(), primary key (project_id,user_id)
);
create table if not exists public.project_stages (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 stage_key text not null,title text not null,subtitle text,guide text,icon text,
 sort_order integer not null, media_requirements jsonb not null default '[]'::jsonb,
 created_at timestamptz not null default now(),unique(project_id,stage_key)
);
create table if not exists public.stage_check_items (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 stage_id uuid not null references public.project_stages(id) on delete cascade,
 item_key text not null,label text not null,required boolean not null default true,
 sort_order integer not null default 0,unique(stage_id,item_key)
);
create table if not exists public.stage_check_results (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 check_item_id uuid not null unique references public.stage_check_items(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','done')),
 completed_by uuid references public.users(id),updated_at timestamptz not null default now()
);
create table if not exists public.daily_reports (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 report_date date not null,created_by uuid not null references public.users(id),checks jsonb not null default '{}'::jsonb,
 status text not null default 'open' check(status in ('open','submitted','changes','approved')),
 submitted_at timestamptz,submitted_by uuid references public.users(id),
 reviewed_at timestamptz,reviewed_by uuid references public.users(id),pm_note text,
 created_at timestamptz not null default now(),unique(project_id,report_date)
);
create table if not exists public.issues (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 reported_by uuid not null references public.users(id),
 kind text not null check(kind in ('damage','quality','change_request','other')),
 title text not null,description text not null,status text not null default 'open' check(status in ('open','resolved')),
 resolution text,resolved_by uuid references public.users(id),resolved_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.project_media (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 stage_id uuid references public.project_stages(id),daily_report_id uuid references public.daily_reports(id),
 issue_id uuid references public.issues(id),
 category_key text not null,kind text not null check(kind in ('image','video')),
 file_name text not null,mime_type text not null,byte_size bigint not null,
 storage_path text not null unique,uploaded_by uuid not null references public.users(id),
 created_at timestamptz not null default now(),
 constraint media_destination check(((stage_id is not null)::integer + (daily_report_id is not null)::integer + (issue_id is not null)::integer) = 1)
);
create table if not exists public.stage_exceptions (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 stage_id uuid not null references public.project_stages(id) on delete cascade,
 category_key text not null,reason text not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 requested_by uuid not null references public.users(id),
 reviewed_by uuid references public.users(id),reviewed_at timestamptz,
 created_at timestamptz not null default now(),unique(stage_id,category_key)
);
create table if not exists public.client_confirmations (
 id uuid primary key default gen_random_uuid(),project_id uuid not null unique references public.projects(id) on delete cascade,
 outcome text not null check(outcome in ('signed','refused')),notes text not null default '',
 recorded_by uuid not null references public.users(id),recorded_at timestamptz not null default now()
);

-- Cross-project references are rejected by the database even if an API bug supplies a valid ID
-- that belongs to a different project.
do $$ begin
 alter table public.project_stages add constraint project_stages_id_project_unique unique(id,project_id);
exception when duplicate_object then null; end $$;
do $$ begin
 alter table public.stage_check_items add constraint stage_check_items_id_project_unique unique(id,project_id);
exception when duplicate_object then null; end $$;
do $$ begin
 alter table public.daily_reports add constraint daily_reports_id_project_unique unique(id,project_id);
exception when duplicate_object then null; end $$;
do $$ begin
 alter table public.issues add constraint issues_id_project_unique unique(id,project_id);
exception when duplicate_object then null; end $$;
do $$ begin
 alter table public.stage_check_items add constraint stage_check_items_stage_project_fk foreign key(stage_id,project_id) references public.project_stages(id,project_id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
 alter table public.stage_check_results add constraint stage_check_results_item_project_fk foreign key(check_item_id,project_id) references public.stage_check_items(id,project_id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
 alter table public.project_media add constraint project_media_stage_project_fk foreign key(stage_id,project_id) references public.project_stages(id,project_id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
 alter table public.project_media add constraint project_media_day_project_fk foreign key(daily_report_id,project_id) references public.daily_reports(id,project_id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
 alter table public.project_media add constraint project_media_issue_project_fk foreign key(issue_id,project_id) references public.issues(id,project_id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
 alter table public.stage_exceptions add constraint stage_exceptions_stage_project_fk foreign key(stage_id,project_id) references public.project_stages(id,project_id) on delete cascade;
exception when duplicate_object then null; end $$;

create table if not exists public.audit_events (
 id bigint generated always as identity primary key,table_name text not null,
 record_id text,action text not null,old_row jsonb,new_row jsonb,at timestamptz not null default now()
);
create or replace function fieldops_private.log_changes() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.audit_events(table_name,record_id,action,old_row,new_row)
 values(TG_TABLE_NAME,coalesce(to_jsonb(NEW)->>'id',to_jsonb(OLD)->>'id'),TG_OP,
  case when TG_OP='INSERT' then null else to_jsonb(OLD) end,
  case when TG_OP='DELETE' then null else to_jsonb(NEW) end);
 return coalesce(NEW,OLD);
end; $$;
revoke all on function fieldops_private.log_changes() from public, anon, authenticated;

create or replace function fieldops_private.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at=now();return new;end; $$;
revoke all on function fieldops_private.touch_updated_at() from public, anon, authenticated;

do $$ declare t text; begin
 foreach t in array array['users','projects','project_members','project_stages','stage_check_items','project_media','stage_check_results','daily_reports','issues','stage_exceptions','client_confirmations'] loop
  execute format('drop trigger if exists fieldops_audit on public.%I',t);
  execute format('create trigger fieldops_audit after insert or update or delete on public.%I for each row execute function fieldops_private.log_changes()',t);
 end loop;
end $$;
drop trigger if exists fieldops_touch_updated_at on public.projects;
create trigger fieldops_touch_updated_at before update on public.projects for each row execute function fieldops_private.touch_updated_at();

create or replace function fieldops_private.prevent_audit_mutation() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'audit events are immutable';end; $$;
revoke all on function fieldops_private.prevent_audit_mutation() from public, anon, authenticated;
drop trigger if exists fieldops_audit_immutable on public.audit_events;
create trigger fieldops_audit_immutable before update or delete on public.audit_events for each row execute function fieldops_private.prevent_audit_mutation();

-- One PostgREST RPC creates the project, all stages and all checklist rows in a single
-- database transaction. Execution is restricted to the server-only service role.
create or replace function public.fieldops_create_project(
 p_code text,p_title text,p_address text,p_client_name text,p_scheduled_for date,
 p_project_type text,p_notes text,p_pm_id uuid,p_created_by uuid,p_stages jsonb
) returns setof public.projects
language plpgsql security definer set search_path = '' as $$
declare new_project public.projects;stage_template jsonb;new_stage public.project_stages;check_template jsonb;stage_index integer:=0;check_index integer;
begin
 if p_stages is null or jsonb_typeof(p_stages)<>'array' or jsonb_array_length(p_stages)=0 then raise exception 'stage templates are required';end if;
 insert into public.projects(code,title,address,client_name,scheduled_for,project_type,notes,pm_id,created_by,status)
 values(p_code,p_title,p_address,coalesce(p_client_name,''),p_scheduled_for,p_project_type,coalesce(p_notes,''),p_pm_id,p_created_by,'active') returning * into new_project;
 for stage_template in select value from jsonb_array_elements(p_stages) loop
  insert into public.project_stages(project_id,stage_key,title,subtitle,icon,guide,sort_order,media_requirements)
  values(new_project.id,stage_template->>'key',stage_template->>'title',stage_template->>'subtitle',stage_template->>'icon',stage_template->>'guide',stage_index,coalesce(stage_template->'media','[]'::jsonb)) returning * into new_stage;
  check_index:=0;
  for check_template in select value from jsonb_array_elements(coalesce(stage_template->'checks','[]'::jsonb)) loop
   insert into public.stage_check_items(project_id,stage_id,item_key,label,required,sort_order)
   values(new_project.id,new_stage.id,check_template->>'key',check_template->>'label',coalesce((check_template->>'required')::boolean,true),check_index);
   check_index:=check_index+1;
  end loop;
  stage_index:=stage_index+1;
 end loop;
 return next new_project;
end; $$;
revoke all on function public.fieldops_create_project(text,text,text,text,date,text,text,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.fieldops_create_project(text,text,text,text,date,text,text,uuid,uuid,jsonb) to service_role;
create index if not exists idx_project_members_user on public.project_members(user_id);
create index if not exists idx_projects_pm on public.projects(pm_id);
create index if not exists idx_project_media_project on public.project_media(project_id,created_at desc);
create index if not exists idx_issues_project on public.issues(project_id,status);
create index if not exists idx_days_project on public.daily_reports(project_id,report_date desc);
create index if not exists idx_audit_time on public.audit_events(at desc);

-- RLS enabled even for server-owned tables. NEVER add anon SELECT policies to these tables.
do $$ declare t text; begin
 foreach t in array array['users','projects','project_members','project_stages','stage_check_items','stage_check_results','daily_reports','project_media','issues','stage_exceptions','client_confirmations','audit_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 end loop;
end $$;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Private photo/video storage. File size max: 50MiB. Lower limits on some plans may require reducing the app limit.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('fieldops-media','fieldops-media',false,52428800,
 array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm'])
on conflict(id) do update set public=false, file_size_limit=excluded.file_size_limit,
 allowed_mime_types=excluded.allowed_mime_types;
-- No public storage.objects policies. All reads use expiring signed URLs issued after project membership checks.
