-- Digital Fees Register v1 — initial schema
-- Source of truth: §3 of Docs/Product_Technical_Spec/Digital_Fees_Register_Technical_Spec.pdf
--                  §22 of Docs/Mockup/Mockup_User_Functionality.md
-- Four tables: families, students, fee_structures, payments.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- updated_at trigger (spec §3.3 marks families.updated_at as "updated by trigger")
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- families — one row per real-world family · billing unit · class-agnostic
-- ---------------------------------------------------------------------------
create table families (
  id          uuid primary key default gen_random_uuid(),
  father_name varchar(80),
  mother_name varchar(80),
  phone       char(10),
  address     text,
  p_dues      int default 0,
  status      text check (status in ('active','withdrawn')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  constraint families_phone_format_chk
    check (phone is null or phone ~ '^[0-9]{10}$')
  -- Spec §3.3: CHECK (father_name IS NOT NULL OR mother_name IS NOT NULL)
  -- is DEFERRED in v1; both fields nullable for now.
);

create trigger families_set_updated_at
before update on families
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- students — one row per student · siblings share family_id
-- ---------------------------------------------------------------------------
create table students (
  id                    uuid primary key default gen_random_uuid(),
  family_id             uuid not null references families(id) on delete cascade,
  name                  varchar(80) not null,
  class                 varchar(8) not null,
  roll_no               int,
  dob                   date,
  date_of_admission     date default current_date,
  aadhaar_no            char(12),
  pen                   varchar(32),
  monthly_fee_override  int,
  term_fees_override    int,
  exam_fees_override    int,
  concession_reason     varchar(64),
  status                text check (status in ('active','graduated','withdrawn')),
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),
  constraint students_name_upper_chk
    check (name = upper(name)),
  constraint students_aadhaar_format_chk
    check (aadhaar_no is null or aadhaar_no ~ '^[0-9]{12}$'),
  constraint students_class_roll_unique
    unique (class, roll_no)
);

create trigger students_set_updated_at
before update on students
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- fee_structures — per-class fee catalogue · edited via Settings
-- ---------------------------------------------------------------------------
create table fee_structures (
  id              uuid primary key default gen_random_uuid(),
  class           varchar(8) unique,
  monthly_fee     int not null,
  annual_fee      int not null,
  sep_exam_fee    int not null,
  feb_exam_fee    int not null,
  misc_fee        int default 0,
  effective_from  date not null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create trigger fee_structures_set_updated_at
before update on fee_structures
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- payments — one row per money event · immutable ledger
-- ---------------------------------------------------------------------------
create table payments (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id),
  student_id    uuid references students(id),
  fee_head      text check (fee_head in ('Monthly','Annual','Sep Exam','Feb Exam','P.Dues','Misc')),
  period        varchar(10),
  amount        int check (amount > 0),
  paid_on       date not null default current_date,
  payment_mode  text check (payment_mode in ('Cash','Cheque','UPI','Bank Transfer')),
  reference_no  varchar(64),
  notes         text,
  status        text check (status in ('active','void')) default 'active',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create trigger payments_set_updated_at
before update on payments
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes (§3.4 of the tech spec)
-- ---------------------------------------------------------------------------
create index students_class_idx              on students (class);
create index students_family_id_idx          on students (family_id);
create index payments_family_period_idx      on payments (family_id, period);
create index payments_family_head_period_idx on payments (family_id, fee_head, period);
create index payments_paid_on_idx            on payments (paid_on);

-- Partial UNIQUE — enforces the term-paid existence invariant from §8.
-- Only one active row per family per term head (Annual / Sep Exam / Feb Exam) per period.
create unique index payments_term_head_unique_idx
  on payments (family_id, fee_head, period)
  where status = 'active'
    and fee_head in ('Annual','Sep Exam','Feb Exam');

-- ---------------------------------------------------------------------------
-- Seed — Class 10 fee structure (effective from 2026-04-01 session)
-- ---------------------------------------------------------------------------
insert into fee_structures
  (class, monthly_fee, annual_fee, sep_exam_fee, feb_exam_fee, misc_fee, effective_from)
values
  ('10', 1500, 1500, 400, 400, 0, '2026-04-01');

-- ---------------------------------------------------------------------------
-- Row Level Security
-- v1 has a single user (the Principal). Allow any authenticated user to
-- SELECT / INSERT / UPDATE on all four tables.
-- ---------------------------------------------------------------------------
alter table families       enable row level security;
alter table students       enable row level security;
alter table fee_structures enable row level security;
alter table payments       enable row level security;

create policy families_select on families       for select to authenticated using (true);
create policy families_insert on families       for insert to authenticated with check (true);
create policy families_update on families       for update to authenticated using (true) with check (true);

create policy students_select on students       for select to authenticated using (true);
create policy students_insert on students       for insert to authenticated with check (true);
create policy students_update on students       for update to authenticated using (true) with check (true);

create policy fee_structures_select on fee_structures for select to authenticated using (true);
create policy fee_structures_insert on fee_structures for insert to authenticated with check (true);
create policy fee_structures_update on fee_structures for update to authenticated using (true) with check (true);

create policy payments_select on payments       for select to authenticated using (true);
create policy payments_insert on payments       for insert to authenticated with check (true);
create policy payments_update on payments       for update to authenticated using (true) with check (true);
