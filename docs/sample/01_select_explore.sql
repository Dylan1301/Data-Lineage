-- ============================================================
-- 01_select_explore.sql
--
-- Load this file FIRST — before any CREATE TABLE definitions.
--
-- Because raw.customers, raw.orders, and raw.order_lines have no
-- schema defined yet, the graph shows these tables as boxes with
-- no columns. Table-level edges are drawn, but column-level edges
-- cannot be resolved yet.
--
-- After you load 02_create_raw.sql the parser retroactively wires
-- the column-level edges into this query's nodes.
-- ============================================================

SELECT
    c.customer_id,
    c.email,
    c.country,
    o.order_id,
    o.order_date,
    o.status,
    ol.product_id,
    ol.qty,
    ol.unit_price,
    ol.qty * ol.unit_price * (1 - COALESCE(ol.discount, 0)) AS line_total
FROM raw.customers  c
INNER JOIN raw.orders      o  ON o.customer_id = c.customer_id
INNER JOIN raw.order_lines ol ON ol.order_id   = o.order_id
WHERE o.status = 'COMPLETED'
  AND c.country IS NOT NULL