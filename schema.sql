create table if not exists run (
  id         text primary key,
  user_id    text not null,
  habit_name text not null,
  goal_days  int  not null default 66,
  start_date date not null,
  status     text not null check (status in ('active','finished','abandoned')),
  ended_at   date,
  created_at timestamptz not null default now()
);

-- Jeden aktívny beh na používateľa. Parciálny index, nie aplikačná kontrola.
create unique index if not exists run_one_active_per_user
  on run (user_id) where status = 'active';

create index if not exists run_user_status on run (user_id, status);

create table if not exists run_day (
  id     text primary key,
  run_id text not null references run(id) on delete cascade,
  date   date not null,
  unique (run_id, date)
);

create index if not exists run_day_run on run_day (run_id);
