-- ============================================================
-- 05_insert_mart.sql
--
-- INSERT INTO … SELECT — load the customer analytics mart.
--
-- Joins clean.customers to an inline derived table (order_stats)
-- that aggregates clean.order_lines through raw.orders.
-- The explicit column list in the INSERT shows the parser mapping
-- each target column to its SELECT output by ordinal position.
--
-- Demonstrates: INSERT INTO with explicit column list,
-- derived-table subquery, multi-CTE aggregation.
-- ============================================================

INSERT INTO mart.customer_stats (
    customer_id,
    email,
    full_name,
    country,
    total_orders,
    total_spend,
    total_margin,
    avg_order_value,
    first_order_date,
    last_order_date
)
WITH order_agg AS (
    SELECT
        o.customer_id,
        COUNT(DISTINCT o.order_id)      AS total_orders,
        SUM(ol.line_total)              AS total_spend,
        SUM(ol.gross_margin)            AS total_margin,
        AVG(ol.line_total)              AS avg_order_value,
        MIN(o.order_date)               AS first_order_date,
        MAX(o.order_date)               AS last_order_date
    FROM raw.orders o
    INNER JOIN clean.order_lines ol
        ON ol.order_id = o.order_id
    WHERE o.status = 'COMPLETED'
    GROUP BY o.customer_id
)
SELECT
    c.customer_id,
    c.email,
    c.full_name,
    c.country,
    agg.total_orders,
    agg.total_spend,
    agg.total_margin,
    agg.avg_order_value,
    agg.first_order_date,
    agg.last_order_date
FROM clean.customers c
INNER JOIN order_agg agg
    ON agg.customer_id = c.customer_id;