-- ============================================================
--  Spin & Win — merge duplicate gifts and fix casing.
--  * Treats gifts with the same letters as the same gift, ignoring case
--    and spaces: "Bluetooth Speaker" = "BLUETOOTH SPEAKER", "Ear Buds" =
--    "EARBUDS". Keeps ONE (the nicely-cased one), moves its category rules
--    and history onto it, deletes the extra copy.
--  * Tidies leftover ALL-CAPS names to Title Case, but leaves acronyms
--    (LED, TV, RO, WM, SD, DD, AC...) alone.
--  * Re-checks stock so nothing ends up out of stock.
--  Safe to run more than once.
--  Run:  psql "<EXTERNAL_DB_URL>" -f dedupe_gifts.sql
-- ============================================================
BEGIN;

-- Canonical gift per normalised name (ignore case + spaces).
-- Prefer: not ALL-CAPS, then a spaced/readable name, then the oldest.
CREATE TEMP TABLE prize_canon AS
SELECT p.id AS dup_id,
       first_value(p.id) OVER (
         PARTITION BY lower(regexp_replace(p.name, '\s+', '', 'g'))
         ORDER BY (p.name = upper(p.name)) ASC,
                  (position(' ' in p.name) = 0) ASC,
                  p.created_at ASC, p.id ASC
       ) AS canon_id
FROM prizes p;

-- Show what will be merged (left = removed, right = kept):
SELECT d.name AS duplicate_removed, k.name AS kept
FROM prize_canon c
JOIN prizes d ON d.id = c.dup_id
JOIN prizes k ON k.id = c.canon_id
WHERE c.dup_id <> c.canon_id
ORDER BY k.name;

-- Move history + forced refs onto the kept gift
UPDATE spin_results sr SET prize_id = c.canon_id
  FROM prize_canon c WHERE sr.prize_id = c.dup_id AND c.dup_id <> c.canon_id;
UPDATE spin_sessions ss SET forced_prize_id = c.canon_id
  FROM prize_canon c WHERE ss.forced_prize_id = c.dup_id AND c.dup_id <> c.canon_id;

-- Move category rules onto the kept gift; if the kept gift already has a
-- rule in that same category, drop the duplicate rule instead.
DELETE FROM prize_rules r
USING prize_canon c
WHERE r.prize_id = c.dup_id AND c.dup_id <> c.canon_id
  AND EXISTS (SELECT 1 FROM prize_rules r2
             WHERE r2.prize_id = c.canon_id AND r2.slab_id = r.slab_id);
UPDATE prize_rules r SET prize_id = c.canon_id
  FROM prize_canon c WHERE r.prize_id = c.dup_id AND c.dup_id <> c.canon_id;

-- Delete the duplicate gifts (their stock rows cascade away automatically)
DELETE FROM prizes p
USING prize_canon c
WHERE p.id = c.dup_id AND c.dup_id <> c.canon_id;

-- Tidy ALL-CAPS names to Title Case, but leave acronyms alone
UPDATE prizes
SET name = initcap(name)
WHERE name = upper(name)
  AND name !~ '\m(LED|TV|RO|WM|SD|DD|AC|RGB|USB|HD|LCD|SMPS|PC)\M';

-- Make sure every surviving category gift has full global stock
INSERT INTO prize_inventory (prize_id, store_id, quantity_initial, quantity_remaining, low_stock_threshold)
SELECT DISTINCT r.prize_id, NULL, 1000000, 1000000, 0
FROM prize_rules r
WHERE NOT EXISTS (
  SELECT 1 FROM prize_inventory i WHERE i.prize_id = r.prize_id AND i.store_id IS NULL
);
UPDATE prize_inventory
SET quantity_initial = 1000000, quantity_remaining = 1000000
WHERE prize_id IN (SELECT DISTINCT prize_id FROM prize_rules);

COMMIT;

-- Final clean gift list:
SELECT name, is_active FROM prizes ORDER BY name;
