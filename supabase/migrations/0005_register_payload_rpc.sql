-- Day 7 perf pass — collapse the Register page's two-stage PostgREST
-- waterfall into a single round-trip.
--
-- Today (pre-RPC) the /register server component does:
--   Phase 1: parallel { listClassStudents(cls), getFeeStructure(cls) }
--   Phase 2: parallel { listFamiliesByIds(ids), listSiblingsOfFamilies(ids),
--                       listActivePaymentsForClass(sids, fids) }
-- Each phase is one PostgREST RTT to ap-south-1 (~290–310ms warm from
-- this machine). That's ~600ms of pure network on every navigation to
-- /register, even though the DB itself executes each query in <1ms.
--
-- This function returns every payload the Register page needs in ONE
-- response, so the page only pays one RTT. It runs as SECURITY INVOKER
-- (the caller's auth.uid() is in scope), so RLS still gates row access —
-- the policies on families/students/fee_structures/payments are unchanged.
--
-- Idempotent: drops and recreates so iterating during dev is safe.

drop function if exists register_payload(text);

create or replace function register_payload(p_class text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with cls_students as (
    select * from students where class = p_class
  ),
  cls_family_ids as (
    select distinct family_id from cls_students where family_id is not null
  ),
  cls_student_ids as (
    select id from cls_students
  )
  select jsonb_build_object(
    'students', (
      select coalesce(
        jsonb_agg(to_jsonb(s) order by s.roll_no nulls last, s.created_at),
        '[]'::jsonb
      )
      from cls_students s
    ),
    'families', (
      select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb)
      from families f
      where f.id in (select family_id from cls_family_ids)
    ),
    'siblings', (
      select coalesce(
        jsonb_agg(to_jsonb(s2) order by s2.class, s2.roll_no nulls last),
        '[]'::jsonb
      )
      from students s2
      where s2.family_id in (select family_id from cls_family_ids)
        and s2.class <> p_class
    ),
    'payments', (
      select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
      from payments p
      where p.status = 'active'
        and (
          p.student_id in (select id from cls_student_ids)
          or p.family_id in (select family_id from cls_family_ids)
        )
    ),
    'fee_structure', (
      select to_jsonb(fs)
      from fee_structures fs
      where fs.class = p_class
      limit 1
    )
  );
$$;

revoke all on function register_payload(text) from public;
grant execute on function register_payload(text) to authenticated;
