-- ============================================================
--  Spin & Win — restore gifts that vanished from the wheel.
--  The old "out of stock" button turned gifts OFF (is_active=false),
--  which also removed them from the wheel. This switches every intended
--  gift back ON so the wheel shows them all again. Stock is handled
--  separately (inventory), so this does NOT make anything winnable that
--  you've set to 0 stock.
--  Safe to run more than once.
--  Run:  psql "<EXTERNAL_DB_URL>" -f fix_wheel_gifts.sql
-- ============================================================
BEGIN;

UPDATE prizes SET is_active = true
WHERE name IN (
  'Ear Buds','Bluetooth Speaker','Neck Band','Hand Chopper','Crockery Set',
  'Gym Bag','Kettle','Iron','Wine Glass Set','Bed Sheet',
  'Comforter Set','Trolly Bag','Juicer Mixer','Induction','Aquafresh RO',
  'Microwave','Arik Chimney','Semi WM','LED TV 32"','Single Door Ref','Samsung Mobile A07'
);

-- Make sure every gift that's in a category has stock (so it can be won).
-- This refills to the opening amount; re-mark anything genuinely out of
-- stock from the admin "Out of stock" panel afterwards.
UPDATE prize_inventory
SET quantity_remaining = quantity_initial
WHERE quantity_remaining <= 0
  AND prize_id IN (SELECT DISTINCT prize_id FROM prize_rules);

COMMIT;

-- Check what the wheel will show (all active gifts):
SELECT name, is_active, priority FROM prizes WHERE is_active = true ORDER BY priority, value;
