-- Additive production hardening: reversible media history, in-app events and
-- idempotent Telegram notification delivery records. Existing data is preserved.

alter table public.project_media add column if not exists deleted_at timestamptz;
alter table public.project_media add column if not exists deleted_by uuid references public.users(id);
alter table public.project_media add column if not exists deletion_reason text;

create index if not exists idx_project_media_active
 on public.project_media(project_id,created_at desc) where deleted_at is null;

create table if not exists public.project_events (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 event_type text not null check(event_type in ('issue_reported','exception_requested','exception_reviewed')),
 title text not null,
 detail text not null default '',
 actor_id uuid not null references public.users(id),
 reference_type text not null,
 reference_id uuid not null,
 created_at timestamptz not null default now()
);

create table if not exists public.notification_deliveries (
 id bigint generated always as identity primary key,
 event_key text not null,
 recipient_telegram_id text not null,
 status text not null default 'sending' check(status in ('sending','sent','failed')),
 error text,
 attempted_at timestamptz not null default now(),
 unique(event_key,recipient_telegram_id)
);

create index if not exists idx_project_events_project
 on public.project_events(project_id,created_at desc);

do $$ declare t text; begin
 foreach t in array array['project_events','notification_deliveries'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant usage,select on all sequences in schema public to service_role;

drop trigger if exists fieldops_audit on public.project_events;
create trigger fieldops_audit after insert or update or delete on public.project_events
 for each row execute function fieldops_private.log_changes();
