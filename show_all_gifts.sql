-- ============================================================
--  Spin & Win — show the FULL product list on the wheel.
--  Adds the big-ticket products as display-only gifts (never won,
--  because they are in no category), renames Laptop Bag -> Gym Bag,
--  and hides any leftover demo gifts so only the sheet shows.
--  Safe to run more than once.
--  Run:  psql "<EXTERNAL_DB_URL>" -f show_all_gifts.sql
-- ============================================================
BEGIN;

-- rename Laptop Bag -> Gym Bag (if not already)
UPDATE prizes SET name = 'Gym Bag' WHERE name ILIKE 'Laptop Bag';

-- big-ticket display-only products (0% everywhere on the sheet)
INSERT INTO prizes (id, name, value, is_active, priority) VALUES
 ('f2000000-0000-0000-0000-000000000001', 'Comforter Set',       500, true, 11),
 ('f2000000-0000-0000-0000-000000000002', 'Trolly Bag',         1000, true, 12),
 ('f2000000-0000-0000-0000-000000000003', 'Juicer Mixer',       2000, true, 13),
 ('f2000000-0000-0000-0000-000000000004', 'Induction',          2000, true, 14),
 ('f2000000-0000-0000-0000-000000000005', 'Aquafresh RO',       4000, true, 15),
 ('f2000000-0000-0000-0000-000000000006', 'Microwave',          6000, true, 16),
 ('f2000000-0000-0000-0000-000000000007', 'Arik Chimney',       7000, true, 17),
 ('f2000000-0000-0000-0000-000000000008', 'Semi WM',           10000, true, 18),
 ('f2000000-0000-0000-0000-000000000009', 'LED TV 32"',        10000, true, 19),
 ('f2000000-0000-0000-0000-00000000000a', 'Single Door Ref',   12000, true, 20),
 ('f2000000-0000-0000-0000-00000000000b', 'Samsung Mobile A07',15000, true, 21)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, value = EXCLUDED.value, is_active = true, priority = EXCLUDED.priority;

-- hide anything that isn't part of the sheet, so the wheel shows only your gifts
UPDATE prizes SET is_active = false
WHERE name NOT IN (
  'Ear Buds','Bluetooth Speaker','Neck Band','Hand Chopper','Crockery Set',
  'Gym Bag','Kettle','Iron','Wine Glass Set','Bed Sheet',
  'Comforter Set','Trolly Bag','Juicer Mixer','Induction','Aquafresh RO',
  'Microwave','Arik Chimney','Semi WM','LED TV 32"','Single Door Ref','Samsung Mobile A07'
);

COMMIT;
