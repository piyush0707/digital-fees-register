select 'families' as t, count(*) from families
union all select 'students', count(*) from students
union all select 'payments', count(*) from payments;
