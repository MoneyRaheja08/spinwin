-- ============================================================
--  Spin & Win — fix "No prizes currently available (out of stock)".
--  Cause: gifts in a category had NO inventory row (or 0 stock), so the
--  engine had nothing it could give. This:
--    1) keeps every gift on the wheel (is_active = true)
--    2) creates a stock record for any gift in a category that lacks one
--    3) refills stock for gifts whose stock had hit 0
--  Safe to run more than once.
--  Run:  psql "<EXTERNAL_DB_URL>" -f fix_stock.sql
-- ============================================================
BEGIN;

-- 1) every gift stays visible on the wheel
UPDATE prizes SET is_active = true
WHERE name IN (
  'Ear Buds','Bluetooth Speaker','Neck Band','Hand Chopper','Crockery Set',
  'Gym Bag','Kettle','Iron','Wine Glass Set','Bed Sheet',
  'Comforter Set','Trolly Bag','Juicer Mixer','Induction','Aquafresh RO',
  'Microwave','Arik Chimney','Semi WM','LED TV 32"','Single Door Ref','Samsung Mobile A07'
);

-- 2) create a global stock record (1,000,000 = effectively unlimited) for any
--    gift used in a category that has no inventory row yet
INSERT INTO prize_inventory (prize_id, store_id, quantity_initial, quantity_remaining, low_stock_threshold)
SELECT DISTINCT r.prize_id, NULL, 1000000, 1000000, 0
FROM prize_rules r
WHERE NOT EXISTS (
  SELECT 1 FROM prize_inventory i WHERE i.prize_id = r.prize_id
);

-- 3) refill any existing stock that had run down to 0, for gifts in a category
UPDATE prize_inventory
SET quantity_initial   = GREATEST(quantity_initial, 1000000),
    quantity_remaining = GREATEST(quantity_initial, 1000000)
WHERE quantity_remaining <= 0
  AND prize_id IN (SELECT DISTINCT prize_id FROM prize_rules);

COMMIT;

-- Show each category's gifts and their stock, so you can confirm they're set:
SELECT s.name AS category, p.name AS gift, r.weight, i.quantity_remaining AS stock
FROM prize_rules r
JOIN price_slabs s ON s.id = r.slab_id
JOIN prizes p ON p.id = r.prize_id
LEFT JOIN prize_inventory i ON i.prize_id = r.prize_id
WHERE s.is_active = true
ORDER BY s.name, p.name;
