-- §7 "Typo / mistake" needs to hard-delete a students row. The original
-- 0001_init.sql migration created SELECT/INSERT/UPDATE policies but no
-- DELETE policy, so with RLS enabled the DELETE silently affects 0 rows
-- (no error, no removal). Add the missing policy for authenticated users.
create policy students_delete on students
  for delete to authenticated
  using (true);
