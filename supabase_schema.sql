create extension if not exists pgcrypto;

create table if not exists public.users (
    id uuid primary key default gen_random_uuid(),
    role text not null check (role in ('head','member')),
    name text not null,
    email text unique,
    phone text unique,
    team_member_id text unique,
    password_hash text,
    mpin_hash text,
    active boolean not null default true,
    failed_attempts integer not null default 0,
    locked_until timestamptz,
    created_at timestamptz not null default now(),
    constraint valid_member_id check (
        team_member_id is null
        or team_member_id ~ '^TM(00[1-9]|01[0-9]|020)$'
    )
);

create table if not exists public.tasks (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    description text,
    assigned_to uuid not null references public.users(id) on delete cascade,
    assigned_name text not null,
    due_date date,
    status text not null default 'Assigned'
        check (status in ('Assigned','In Progress','Completed')),
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
    id uuid primary key default gen_random_uuid(),
    action text not null,
    user_id uuid references public.users(id) on delete set null,
    metadata jsonb not null default '{}'::jsonb,
    ip text,
    created_at timestamptz not null default now()
);

create index if not exists idx_users_role on public.users(role);
create index if not exists idx_tasks_assignee on public.tasks(assigned_to);
create index if not exists idx_tasks_created on public.tasks(created_at desc);
create index if not exists idx_audit_created on public.audit_logs(created_at desc);

alter table public.users enable row level security;
alter table public.tasks enable row level security;
alter table public.audit_logs enable row level security;

-- The Flask server is the authorization boundary for this MVP.
-- Do not expose the service-role key to the browser.
-- If you later use Supabase Auth directly from the browser, replace these
-- policies with authenticated-user policies based on auth.uid().
