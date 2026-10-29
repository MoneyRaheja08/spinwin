-- ============================================================
--  Spin & Win — force spins to work ("out of stock" fix, take 2).
--  Covers all three possible blockers:
--    1) missing / wrong-store stock  -> give every category gift a GLOBAL
--       stock row (store_id NULL) with 1,000,000
--    2) daily-count caps (incl. ones rounded to 0) -> clear them
--    3) max-winner caps -> clear them
--  You can re-apply per-day limits later from the admin page once it works.
--  Safe to run more than once.
--  Run:  psql "<EXTERNAL_DB_URL>" -f make_spins_work.sql
-- ============================================================
BEGIN;

-- 1) every gift visible on the wheel
UPDATE prizes SET is_active = true
WHERE id IN (SELECT DISTINCT prize_id FROM prize_rules);

-- 2) a GLOBAL stock row for every gift used in a category that has none
INSERT INTO prize_inventory (prize_id, store_id, quantity_initial, quantity_remaining, low_stock_threshold)
SELECT DISTINCT r.prize_id, NULL, 1000000, 1000000, 0
FROM prize_rules r
WHERE NOT EXISTS (
  SELECT 1 FROM prize_inventory i
  WHERE i.prize_id = r.prize_id AND i.store_id IS NULL
);

-- 3) top the global rows back up to full
UPDATE prize_inventory
SET quantity_initial = 1000000, quantity_remaining = 1000000
WHERE store_id IS NULL
  AND prize_id IN (SELECT DISTINCT prize_id FROM prize_rules);

-- 4) remove the caps that can block a whole category
UPDATE prize_rules SET daily_limit = NULL, max_winners = NULL;
UPDATE prizes SET max_winners = NULL
WHERE id IN (SELECT DISTINCT prize_id FROM prize_rules);

COMMIT;

-- Confirm: every category gift, its weight and stock (stock should be 1000000):
SELECT s.name AS category, p.name AS gift, r.weight,
       i.quantity_remaining AS stock, r.daily_limit, p.is_active
FROM prize_rules r
JOIN price_slabs s ON s.id = r.slab_id
JOIN prizes p ON p.id = r.prize_id
LEFT JOIN prize_inventory i ON i.prize_id = r.prize_id AND i.store_id IS NULL
WHERE s.is_active = true
ORDER BY s.name, p.name;
