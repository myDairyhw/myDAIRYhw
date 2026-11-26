create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  study_field text not null default 'לימודים כלליים',
  timezone text not null default 'Asia/Jerusalem',
  reminder_time time not null default '20:00',
  remind_today_at time,
  remind_tomorrow_at time,
  remind_today boolean not null default true,
  remind_tomorrow boolean not null default false,
  schedule_setup_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists reminder_time time not null default '20:00';
alter table public.profiles add column if not exists remind_today_at time;
alter table public.profiles add column if not exists remind_tomorrow_at time;
update public.profiles
set remind_today_at = coalesce(remind_today_at, reminder_time, '08:00'),
    remind_tomorrow_at = coalesce(remind_tomorrow_at, reminder_time, '20:00');
alter table public.profiles alter column remind_today_at set default '08:00';
alter table public.profiles alter column remind_today_at set not null;
alter table public.profiles alter column remind_tomorrow_at set default '20:00';
alter table public.profiles alter column remind_tomorrow_at set not null;
alter table public.profiles add column if not exists schedule_setup_completed boolean not null default false;
alter table public.profiles add column if not exists study_field text not null default 'לימודים כלליים';

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  category text not null default 'assignment',
  notes text not null default '' check (char_length(notes) <= 240),
  task_time time,
  due_date date not null,
  weekday smallint not null check (weekday between 0 and 6),
  created_at timestamptz not null default now()
);

alter table public.tasks add column if not exists category text not null default 'assignment';
alter table public.tasks add column if not exists due_date date;
update public.tasks
set due_date = current_date + ((weekday - extract(dow from current_date)::integer + 7) % 7)
where due_date is null;
alter table public.tasks alter column due_date set not null;

create index if not exists tasks_user_due_date_idx on public.tasks(user_id, due_date);

create table if not exists public.course_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_name text not null check (char_length(course_name) between 1 and 80),
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  created_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

create index if not exists course_sessions_user_weekday_idx on public.course_sessions(user_id, weekday, starts_at);

create table if not exists public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_date date not null,
  mode text not null check (mode in ('today', 'tomorrow')),
  sent_at timestamptz not null default now(),
  unique (user_id, task_date, mode)
);

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.course_sessions enable row level security;
alter table public.reminder_deliveries enable row level security;

drop policy if exists "Users can read their profile" on public.profiles;
create policy "Users can read their profile" on public.profiles for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can insert their profile" on public.profiles;
create policy "Users can insert their profile" on public.profiles for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update their profile" on public.profiles;
create policy "Users can update their profile" on public.profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can read their tasks" on public.tasks;
create policy "Users can read their tasks" on public.tasks for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can insert their tasks" on public.tasks;
create policy "Users can insert their tasks" on public.tasks for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update their tasks" on public.tasks;
create policy "Users can update their tasks" on public.tasks for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete their tasks" on public.tasks;
create policy "Users can delete their tasks" on public.tasks for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can read their course sessions" on public.course_sessions;
create policy "Users can read their course sessions" on public.course_sessions for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can insert their course sessions" on public.course_sessions;
create policy "Users can insert their course sessions" on public.course_sessions for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update their course sessions" on public.course_sessions;
create policy "Users can update their course sessions" on public.course_sessions for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete their course sessions" on public.course_sessions;
create policy "Users can delete their course sessions" on public.course_sessions for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can read their reminder history" on public.reminder_deliveries;
create policy "Users can read their reminder history" on public.reminder_deliveries for select to authenticated using (auth.uid() = user_id);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email, display_name, study_field)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'study_field', ''), 'לימודים כלליים')
  )
  on conflict (user_id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();
