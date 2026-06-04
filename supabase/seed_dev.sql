-- Digital Fees Register — synthetic dev seed (v2 — trimmed to 9 visible rows)
-- ----------------------------------------------------------------------------
-- All names, parents, phones, addresses, DOBs, Aadhaar, and PEN values below
-- are FULLY INVENTED for local development testing. Do not deploy to prod.
--
-- What this seeds (matches the mockup pre-seeded data):
--   · 9 families, 13 students total
--   · Class 10 register: rolls 1–9 (the only visible rows)
--   · Sibling chips on rolls 2, 4, 6 — siblings live in other classes:
--       KAVYA VERMA  (Class 8)  · sibling of DIYA  (roll 2)
--       NAINA KUMAR  (Class 7)  · sibling of KABIR (roll 4)
--       AANYA KUMAR  (Class 5)  · sibling of KABIR (roll 4)
--       PARAM GUPTA  (Class 9)  · sibling of NEEL  (roll 6)
--   · Payments spread across Apr–May 2026 covering Monthly / Annual /
--     P.Dues / Misc, with a Cash/UPI mix and several rows dated today
--     (2026-05-26) so the Today / MTD figures land on non-zero values.
--
-- Re-runnability: idempotent. Wraps everything in a transaction and TRUNCATEs
-- the three data tables before inserting. The Class 10 fee_structures row
-- owned by the migration is left untouched. (Sibling classes 5/7/8/9 have no
-- fee_structures row — they don't need one for the Class 10 register.)
-- ----------------------------------------------------------------------------

begin;

truncate table payments, students, families cascade;

-- ---------------------------------------------------------------------------
-- families (9 rows; 3 with siblings — Verma, Kumar, Gupta)
-- p_dues > 0 on Kumar and Khan so the carry-forward UI has data.
-- ---------------------------------------------------------------------------
insert into families (id, father_name, mother_name, phone, address, p_dues, status) values
  ('11111111-1111-1111-1111-000000000001', 'RAJ SHARMA',    'PRIYA SHARMA',  '9812345601', 'House 12, Sector A', 0,    'active'),
  ('11111111-1111-1111-1111-000000000002', 'SURESH VERMA',  'KAVITA VERMA',  '9812345602', 'House 24, Sector B', 0,    'active'),
  ('11111111-1111-1111-1111-000000000003', 'ANIL MISHRA',   'SUNITA MISHRA', '9812345603', 'House 5, Sector A',  0,    'active'),
  ('11111111-1111-1111-1111-000000000004', 'MANOJ KUMAR',   'ANITA KUMAR',   '9812345604', 'House 88, Sector C', 4500, 'active'),
  ('11111111-1111-1111-1111-000000000005', 'BHAVIK PATEL',  'MEERA PATEL',   '9812345605', 'House 17, Sector D', 0,    'active'),
  ('11111111-1111-1111-1111-000000000006', 'VIVEK GUPTA',   'REKHA GUPTA',   '9812345606', 'House 33, Sector E', 0,    'active'),
  ('11111111-1111-1111-1111-000000000007', 'SANDEEP JOSHI', 'POOJA JOSHI',   '9812345607', 'House 9, Sector A',  0,    'active'),
  ('11111111-1111-1111-1111-000000000008', 'IMRAN KHAN',    'FARAH KHAN',    '9812345608', 'House 41, Sector F', 2000, 'active'),
  ('11111111-1111-1111-1111-000000000009', 'NAVEEN RAO',    'LAKSHMI RAO',   '9812345609', 'House 14, Sector B', 0,    'active');

-- ---------------------------------------------------------------------------
-- students (13 rows · 9 in Class 10 rolls 1–9, 4 siblings in other classes)
-- ---------------------------------------------------------------------------
insert into students (id, family_id, name, class, roll_no, dob, date_of_admission, aadhaar_no, pen, status) values
  -- Class 10 (rolls 1–9)
  ('22222222-2222-2222-2222-000000000001', '11111111-1111-1111-1111-000000000001', 'AARAV SHARMA',  '10', 1, '2010-06-12', '2026-04-01', '999900000001', 'PEN2026000001', 'active'),
  ('22222222-2222-2222-2222-000000000002', '11111111-1111-1111-1111-000000000002', 'DIYA VERMA',    '10', 2, '2010-08-23', '2026-04-01', '999900000002', 'PEN2026000002', 'active'),
  ('22222222-2222-2222-2222-000000000003', '11111111-1111-1111-1111-000000000003', 'ISHAAN MISHRA', '10', 3, '2010-03-04', '2026-04-01', '999900000003', null,            'active'),
  ('22222222-2222-2222-2222-000000000004', '11111111-1111-1111-1111-000000000004', 'KABIR KUMAR',   '10', 4, '2010-11-19', '2026-04-01', '999900000004', 'PEN2026000004', 'active'),
  ('22222222-2222-2222-2222-000000000005', '11111111-1111-1111-1111-000000000005', 'MYRA PATEL',    '10', 5, '2010-02-28', '2026-04-01', '999900000005', 'PEN2026000005', 'active'),
  ('22222222-2222-2222-2222-000000000006', '11111111-1111-1111-1111-000000000006', 'NEEL GUPTA',    '10', 6, '2010-07-15', '2026-04-01', '999900000006', null,            'active'),
  ('22222222-2222-2222-2222-000000000007', '11111111-1111-1111-1111-000000000007', 'PARI JOSHI',    '10', 7, '2010-09-09', '2026-04-01', '999900000007', 'PEN2026000007', 'active'),
  ('22222222-2222-2222-2222-000000000008', '11111111-1111-1111-1111-000000000008', 'ZARA KHAN',     '10', 8, null,         '2026-04-01', '999900000008', null,            'active'),
  ('22222222-2222-2222-2222-000000000009', '11111111-1111-1111-1111-000000000009', 'VIHAAN RAO',    '10', 9, '2010-05-01', '2026-04-01', '999900000009', 'PEN2026000009', 'active'),
  -- Siblings in other classes (drive the sibling-chip rendering on rolls 2, 4, 6)
  ('22222222-2222-2222-2222-000000000011', '11111111-1111-1111-1111-000000000002', 'KAVYA VERMA',   '8',  3, '2012-04-17', '2026-04-01', '999900000011', 'PEN2026000011', 'active'),
  ('22222222-2222-2222-2222-000000000013', '11111111-1111-1111-1111-000000000004', 'NAINA KUMAR',   '7',  5, '2013-01-30', '2026-04-01', '999900000013', 'PEN2026000013', 'active'),
  ('22222222-2222-2222-2222-000000000018', '11111111-1111-1111-1111-000000000004', 'AANYA KUMAR',   '5',  4, '2015-09-30', '2026-04-01', '999900000018', null,            'active'),
  ('22222222-2222-2222-2222-000000000015', '11111111-1111-1111-1111-000000000006', 'PARAM GUPTA',   '9',  2, '2011-08-11', '2026-04-01', '999900000015', 'PEN2026000015', 'active');

-- ---------------------------------------------------------------------------
-- payments (covers the 9 visible Class 10 students; sibling-class payments
-- omitted since they don't render on the Class 10 register)
--   Periods: Monthly = 'YYYY-MM', Annual = '2026-27', P.Dues = '2025-26'
--   Cash/UPI mix + a few rows dated today (2026-05-26) so Today / MTD ≠ 0.
-- ---------------------------------------------------------------------------
insert into payments (family_id, student_id, fee_head, period, amount, paid_on, payment_mode, reference_no, notes) values
  -- F1 SHARMA — Apr paid, May paid (today), Annual paid, plus a Misc line
  ('11111111-1111-1111-1111-000000000001', '22222222-2222-2222-2222-000000000001', 'Monthly', '2026-04', 1500, '2026-04-05', 'Cash', null,           null),
  ('11111111-1111-1111-1111-000000000001', '22222222-2222-2222-2222-000000000001', 'Monthly', '2026-05', 1500, '2026-05-26', 'UPI',  'UPI260526AS1', null),
  ('11111111-1111-1111-1111-000000000001', null,                                    'Annual',  '2026-27', 1500, '2026-04-15', 'Cash', null,           null),
  ('11111111-1111-1111-1111-000000000001', null,                                    'Misc',    '2026-05', 500,  '2026-05-18', 'Cash', null,           'Library deposit'),

  -- F2 VERMA — Diya Apr paid (May pending), Annual paid (family-level)
  ('11111111-1111-1111-1111-000000000002', '22222222-2222-2222-2222-000000000002', 'Monthly', '2026-04', 1500, '2026-04-07', 'UPI',  'UPI260407VR1', null),
  ('11111111-1111-1111-1111-000000000002', null,                                    'Annual',  '2026-27', 1500, '2026-04-16', 'Cash', null,           null),

  -- F3 MISHRA — Apr UPI, May partial 800 (cash) — gives a partial-orange cell to test
  ('11111111-1111-1111-1111-000000000003', '22222222-2222-2222-2222-000000000003', 'Monthly', '2026-04', 1500, '2026-04-08', 'UPI',  'UPI260408MS',  null),
  ('11111111-1111-1111-1111-000000000003', '22222222-2222-2222-2222-000000000003', 'Monthly', '2026-05', 800,  '2026-05-20', 'Cash', null,           'Part-payment'),
  ('11111111-1111-1111-1111-000000000003', null,                                    'Annual',  '2026-27', 1500, '2026-04-20', 'UPI',  'UPI260420MS',  null),

  -- F4 KUMAR — Kabir Apr paid, no Annual, partial P.Dues (2500 of 4500)
  ('11111111-1111-1111-1111-000000000004', '22222222-2222-2222-2222-000000000004', 'Monthly', '2026-04', 1500, '2026-04-21', 'Cash', null,           null),
  ('11111111-1111-1111-1111-000000000004', null,                                    'P.Dues',  '2025-26', 2500, '2026-04-21', 'Cash', null,           'Partial settlement of carry-forward'),

  -- F5 PATEL — fully paid
  ('11111111-1111-1111-1111-000000000005', '22222222-2222-2222-2222-000000000005', 'Monthly', '2026-04', 1500, '2026-04-10', 'Cash', null,           null),
  ('11111111-1111-1111-1111-000000000005', '22222222-2222-2222-2222-000000000005', 'Monthly', '2026-05', 1500, '2026-05-26', 'Cash', null,           null),
  ('11111111-1111-1111-1111-000000000005', null,                                    'Annual',  '2026-27', 1500, '2026-04-12', 'Cash', null,           null),

  -- F6 GUPTA — Neel Apr+May paid, Annual paid (family-level)
  ('11111111-1111-1111-1111-000000000006', '22222222-2222-2222-2222-000000000006', 'Monthly', '2026-04', 1500, '2026-04-04', 'Cash', null,           null),
  ('11111111-1111-1111-1111-000000000006', '22222222-2222-2222-2222-000000000006', 'Monthly', '2026-05', 1500, '2026-05-04', 'UPI',  'UPI260504GN',  null),
  ('11111111-1111-1111-1111-000000000006', null,                                    'Annual',  '2026-27', 1500, '2026-04-04', 'Cash', null,           null),

  -- F7 JOSHI — fully paid
  ('11111111-1111-1111-1111-000000000007', '22222222-2222-2222-2222-000000000007', 'Monthly', '2026-04', 1500, '2026-04-06', 'UPI',  'UPI260406JP',  null),
  ('11111111-1111-1111-1111-000000000007', '22222222-2222-2222-2222-000000000007', 'Monthly', '2026-05', 1500, '2026-05-15', 'UPI',  'UPI260515JP',  null),
  ('11111111-1111-1111-1111-000000000007', null,                                    'Annual',  '2026-27', 1500, '2026-04-25', 'Cash', null,           null),

  -- F8 KHAN — Apr paid, May pending, no Annual, partial P.Dues (800 of 2000)
  ('11111111-1111-1111-1111-000000000008', '22222222-2222-2222-2222-000000000008', 'Monthly', '2026-04', 1500, '2026-04-09', 'Cash', null,           null),
  ('11111111-1111-1111-1111-000000000008', null,                                    'P.Dues',  '2025-26', 800,  '2026-04-09', 'Cash', null,           'Partial settlement of carry-forward'),

  -- F9 RAO — Apr paid, Annual paid, May pending
  ('11111111-1111-1111-1111-000000000009', '22222222-2222-2222-2222-000000000009', 'Monthly', '2026-04', 1500, '2026-04-13', 'UPI',  'UPI260413RV',  null),
  ('11111111-1111-1111-1111-000000000009', null,                                    'Annual',  '2026-27', 1500, '2026-04-13', 'UPI',  'UPI260413RA',  null);

commit;
