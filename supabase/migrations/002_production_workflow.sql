-- Production workflow additions. Additive only: existing projects, media and audit history are preserved.

alter table public.users add column if not exists photo_url text;

do $$ begin
 alter table public.users drop constraint if exists users_role_check;
 alter table public.users add constraint users_role_check check(role in ('admin','pm','foreman','installer'));
exception when duplicate_object then null; end $$;

do $$ begin
 alter table public.project_members drop constraint if exists project_members_role_check;
 alter table public.project_members add constraint project_members_role_check check(role in ('installer','foreman'));
exception when duplicate_object then null; end $$;

create unique index if not exists one_foreman_per_project
 on public.project_members(project_id) where role='foreman';

create table if not exists public.invitations (
 id uuid primary key default gen_random_uuid(),
 username text not null,
 first_name text not null default '',
 last_name text not null default '',
 role text not null check(role in ('pm','foreman','installer')),
 token_hash text not null unique,
 status text not null default 'pending' check(status in ('pending','accepted','revoked','expired')),
 invited_by uuid not null references public.users(id),
 accepted_by uuid references public.users(id),
 expires_at timestamptz not null default (now() + interval '14 days'),
 accepted_at timestamptz,
 created_at timestamptz not null default now()
);

create table if not exists public.stage_comments (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 stage_id uuid not null references public.project_stages(id) on delete cascade,
 author_id uuid not null references public.users(id),
 body text not null check(char_length(body) between 1 and 2000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.stage_completions (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 stage_id uuid not null unique references public.project_stages(id) on delete cascade,
 completed_by uuid not null references public.users(id),
 completed_at timestamptz not null default now()
);

do $$ declare t text; begin
 foreach t in array array['invitations','stage_comments','stage_completions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('drop trigger if exists fieldops_audit on public.%I',t);
  execute format('create trigger fieldops_audit after insert or update or delete on public.%I for each row execute function fieldops_private.log_changes()',t);
 end loop;
end $$;

create index if not exists idx_invitations_status on public.invitations(status,expires_at);
create unique index if not exists one_pending_invitation_per_username on public.invitations(lower(username)) where status='pending';
create index if not exists idx_comments_stage on public.stage_comments(stage_id,created_at);
create index if not exists idx_stage_completions_project on public.stage_completions(project_id);

do $$ begin
 alter table public.stage_comments add constraint stage_comments_stage_project_fk foreign key(stage_id,project_id) references public.project_stages(id,project_id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
 alter table public.stage_completions add constraint stage_completions_stage_project_fk foreign key(stage_id,project_id) references public.project_stages(id,project_id) on delete cascade;
exception when duplicate_object then null; end $$;

-- Safely adds missing template stages, media requirements and checklist rows.
-- Existing requirements, check results, uploads and custom PM categories remain untouched.
create or replace function public.fieldops_sync_project_template(p_project_id uuid,p_stages jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 stage_template jsonb; check_template jsonb; media_template jsonb;
 target_stage public.project_stages; stage_index integer:=0; check_index integer;
 stages_added integer:=0; checks_added integer:=0; media_added integer:=0;
begin
 if p_stages is null or jsonb_typeof(p_stages)<>'array' then raise exception 'stage templates are required'; end if;
 for stage_template in select value from jsonb_array_elements(p_stages) loop
  select * into target_stage from public.project_stages
   where project_id=p_project_id and stage_key=stage_template->>'key';
  if target_stage.id is null then
   insert into public.project_stages(project_id,stage_key,title,subtitle,icon,guide,sort_order,media_requirements)
   values(p_project_id,stage_template->>'key',stage_template->>'title',stage_template->>'subtitle',stage_template->>'icon',stage_template->>'guide',stage_index,'[]'::jsonb)
   returning * into target_stage;
   stages_added:=stages_added+1;
  end if;
  for media_template in select value from jsonb_array_elements(coalesce(stage_template->'media','[]'::jsonb)) loop
   if not exists(select 1 from jsonb_array_elements(coalesce(target_stage.media_requirements,'[]'::jsonb)) r where r->>'key'=media_template->>'key') then
    target_stage.media_requirements=coalesce(target_stage.media_requirements,'[]'::jsonb)||jsonb_build_array(media_template);
    media_added:=media_added+1;
   end if;
  end loop;
  update public.project_stages set media_requirements=target_stage.media_requirements where id=target_stage.id;
  check_index:=0;
  for check_template in select value from jsonb_array_elements(coalesce(stage_template->'checks','[]'::jsonb)) loop
   insert into public.stage_check_items(project_id,stage_id,item_key,label,required,sort_order)
   values(p_project_id,target_stage.id,check_template->>'key',check_template->>'label',coalesce((check_template->>'required')::boolean,true),check_index)
   on conflict(stage_id,item_key) do nothing;
   if found then checks_added:=checks_added+1; end if;
   check_index:=check_index+1;
  end loop;
  stage_index:=stage_index+1;
 end loop;
 return jsonb_build_object('stages_added',stages_added,'media_added',media_added,'checks_added',checks_added);
end; $$;

revoke all on function public.fieldops_sync_project_template(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.fieldops_sync_project_template(uuid,jsonb) to service_role;
