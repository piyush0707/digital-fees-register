-- §22 of the user-functionality doc requires students.family_id to be
-- nullable so the "Unlink" button on a green linked-family banner can
-- detach a student. After detachment the student's row stays put, the
-- sibling chips on related rows refresh, and the principal sees the
-- cyan "Already in the system?" search bar again on that profile.
alter table students alter column family_id drop not null;
