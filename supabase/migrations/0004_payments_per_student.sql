-- Payments move to a per-student model.
--
-- Day 6 bug surfaced by the Principal: when an orphan student (no family
-- link — e.g. LAXMAN, roll 12 Class 10) has term fees to pay, clicking the
-- T.Fees ✓ blew up with `invalid input syntax for type uuid: ""` because the
-- toggle's insert tried to set payments.family_id from the empty-string
-- fallback used in the register read path.
--
-- The Principal's call is that family is *only* for linking siblings together
-- — every payment should attach to the STUDENT, with the family copied
-- across when available. This applies to Monthly, Annual (T.Fees) and
-- Sep / Feb Exam. P.Dues stays family-level (it's literally
-- `families.p_dues` — orphans have no carry-forward debt).
--
-- Idempotent: safe to re-run while iterating.

-- 1. Relax payments.family_id NOT NULL. The FK still applies when set.
alter table payments alter column family_id drop not null;

-- 2. Every payment must attach to SOMETHING — either a family (legacy /
--    family-level rows like P.Dues / Misc) or a student (the new norm).
alter table payments drop constraint if exists payments_owner_chk;
alter table payments add constraint payments_owner_chk
  check (family_id is not null or student_id is not null);

-- 3. The old family-keyed partial UNIQUE covered Annual + Sep Exam + Feb
--    Exam. Replace it with student-keyed indexes on the same heads.
drop index if exists payments_term_head_unique_idx;

create unique index if not exists payments_term_head_per_student_unique_idx
  on payments (student_id, fee_head, period)
  where status = 'active'
    and student_id is not null
    and fee_head in ('Annual','Sep Exam','Feb Exam');

-- 4. Back-fill: existing family-level Annual / Sep Exam / Feb Exam rows
--    (student_id IS NULL) are re-attributed to the lowest-roll active
--    Class-10 student in the family, then the legacy row is voided. This
--    preserves "this family has paid term fees" history while moving to
--    per-student semantics. Families with no active Class-10 student have
--    their legacy row left in place untouched (nothing to attribute to).
do $$
declare
  rec record;
  stu_id uuid;
begin
  for rec in
    select id, family_id, fee_head, period, amount, paid_on, payment_mode, notes
    from payments
    where status = 'active'
      and student_id is null
      and fee_head in ('Annual','Sep Exam','Feb Exam')
  loop
    select s.id into stu_id
    from students s
    where s.family_id = rec.family_id
      and s.status = 'active'
      and s.class = '10'
    order by s.roll_no nulls last
    limit 1;

    if stu_id is null then
      -- No active Class 10 student to attribute to; leave legacy row alone.
      continue;
    end if;

    insert into payments
      (family_id, student_id, fee_head, period, amount, paid_on, payment_mode, notes, status)
    values
      (rec.family_id, stu_id, rec.fee_head, rec.period, rec.amount,
       rec.paid_on, rec.payment_mode, rec.notes, 'active');

    update payments set status = 'void' where id = rec.id;
  end loop;
end $$;
