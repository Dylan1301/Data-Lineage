-- ============================================================
-- 04_ctas_union.sql
--
-- CTAS with UNION ALL — the order status history table.
--
-- Merges three disjoint order populations (completed, refunded,
-- cancelled) into a single status-history grain using UNION ALL.
-- Each branch of the union has its own derived columns so the
-- parser must track column lineage separately per branch and
-- then align them by ordinal position.
--
-- Demonstrates: CTAS + UNION ALL, per-branch expressions,
-- ordinal column matching across union arms.
-- ============================================================

CREATE TABLE clean.order_status_history AS

-- Branch 1: completed orders — revenue is positive
SELECT
    o.order_id,
    o.customer_id,
    o.order_date,
    o.channel,
    'COMPLETED'                                         AS status_label,
    SUM(ol.line_total)                                  AS net_revenue,
    SUM(ol.gross_margin)                                AS net_margin,
    COUNT(DISTINCT ol.product_id)                       AS distinct_products
FROM raw.orders o
INNER JOIN clean.order_lines ol ON ol.order_id = o.order_id
WHERE o.status = 'COMPLETED'
GROUP BY o.order_id, o.customer_id, o.order_date, o.channel

UNION ALL

-- Branch 2: refunded orders — revenue is negated
SELECT
    o.order_id,
    o.customer_id,
    o.order_date,
    o.channel,
    'REFUNDED'                                          AS status_label,
    -1 * SUM(ol.line_total)                             AS net_revenue,
    -1 * SUM(ol.gross_margin)                           AS net_margin,
    COUNT(DISTINCT ol.product_id)                       AS distinct_products
FROM raw.orders o
INNER JOIN clean.order_lines ol ON ol.order_id = o.order_id
WHERE o.status = 'REFUNDED'
GROUP BY o.order_id, o.customer_id, o.order_date, o.channel

UNION ALL

-- Branch 3: cancelled orders — zero revenue, still tracked for funnel analysis
SELECT
    o.order_id,
    o.customer_id,
    o.order_date,
    o.channel,
    'CANCELLED'                                         AS status_label,
    0                                                   AS net_revenue,
    0                                                   AS net_margin,
    COUNT(DISTINCT ol.product_id)                       AS distinct_products
FROM raw.orders o
LEFT JOIN clean.order_lines ol ON ol.order_id = o.order_id
WHERE o.status = 'CANCELLED'
GROUP BY o.order_id, o.customer_id, o.order_date, o.channel;