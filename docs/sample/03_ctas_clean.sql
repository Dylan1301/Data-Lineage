-- ============================================================
-- 03_ctas_clean.sql
--
-- CREATE TABLE AS SELECT — the clean layer.
--
-- Two CTAS statements in one file:
--   • clean.customers  — deduplicated via ROW_NUMBER CTE,
--                        enriched with a computed full_name column
--   • clean.order_lines — pre-joined to raw.products to freeze
--                         cost_price and compute line_total / margin
--
-- Demonstrates: CTAS, CTE, window function, multi-table JOIN,
-- and computed column expressions tracked at column level.
-- ============================================================

-- ── clean.customers ──────────────────────────────────────────
CREATE TABLE clean.customers AS
WITH ranked AS (
    SELECT
        customer_id,
        LOWER(TRIM(email))              AS email,
        TRIM(name)                      AS name,
        TRIM(name)                      AS full_name,
        country,
        signup_date,
        created_at,
        ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(email))
            ORDER BY created_at DESC
        )                               AS rn
    FROM raw.customers
    WHERE email IS NOT NULL
      AND customer_id IS NOT NULL
)
SELECT
    customer_id,
    email,
    name,
    full_name,
    country,
    signup_date,
    created_at
FROM ranked
WHERE rn = 1;


-- ── clean.order_lines ────────────────────────────────────────
CREATE TABLE clean.order_lines AS
SELECT
    ol.line_id,
    ol.order_id,
    ol.product_id,
    p.name                                                          AS product_name,
    p.category,
    ol.qty,
    ol.unit_price,
    p.cost_price,
    COALESCE(ol.discount, 0)                                        AS discount,
    ol.qty * ol.unit_price * (1 - COALESCE(ol.discount, 0))        AS line_total,
    ol.qty * (ol.unit_price - p.cost_price)                        AS gross_margin
FROM raw.order_lines ol
INNER JOIN raw.products p
    ON p.product_id = ol.product_id
WHERE ol.qty       > 0
  AND ol.unit_price > 0;