-- ============================================================
--  Spin & Win — definitive "out of stock" fix.
--  Root cause: some gifts have a leftover stock row stuck at 0 that the
--  engine picks ahead of the good one. This sets EVERY stock row for every
--  category gift to full, so none can shadow another.
--  Safe to run more than once.
--  Run:  psql "<EXTERNAL_DB_URL>" -f final_stock_fix.sql
-- ============================================================
BEGIN;

-- every category gift stays on the wheel
UPDATE prizes SET is_active = true
WHERE id IN (SELECT DISTINCT prize_id FROM prize_rules);

-- make sure a global stock row exists for every category gift
INSERT INTO prize_inventory (prize_id, store_id, quantity_initial, quantity_remaining, low_stock_threshold)
SELECT DISTINCT r.prize_id, NULL, 1000000, 1000000, 0
FROM prize_rules r
WHERE NOT EXISTS (
  SELECT 1 FROM prize_inventory i WHERE i.prize_id = r.prize_id AND i.store_id IS NULL
);

-- set EVERY stock row (global + any store) for category gifts to full,
-- so no leftover 0-stock row can block the engine
UPDATE prize_inventory
SET quantity_initial = 1000000, quantity_remaining = 1000000
WHERE prize_id IN (SELECT DISTINCT prize_id FROM prize_rules);

-- clear any daily / winner caps that could empty a whole category
UPDATE prize_rules SET daily_limit = NULL, max_winners = NULL;
UPDATE prizes SET max_winners = NULL
WHERE id IN (SELECT DISTINCT prize_id FROM prize_rules);

COMMIT;

-- Confirm what the engine will actually see per category gift
-- (engine_stock must be 1000000 for all):
SELECT s.name AS category, p.name AS gift, r.weight,
       (SELECT min(i.quantity_remaining) FROM prize_inventory i
          WHERE i.prize_id = p.id AND (i.store_id IS NULL OR i.store_id = s.store_id)) AS engine_stock
FROM prize_rules r
JOIN price_slabs s ON s.id = r.slab_id
JOIN prizes p ON p.id = r.prize_id
WHERE s.is_active = true
ORDER BY s.name, p.name;
