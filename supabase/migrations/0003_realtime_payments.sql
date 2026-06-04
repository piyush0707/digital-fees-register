-- Enable Supabase Realtime on the payments table so /transactions (and the
-- live Dashboard tiles) receive INSERT/UPDATE/DELETE events. Idempotent —
-- if the table is already in the publication this is a no-op.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'payments'
  ) then
    alter publication supabase_realtime add table payments;
  end if;
end $$;
