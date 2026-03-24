-- ============================================================
-- 06_merge_segments.sql
--
-- MERGE INTO … USING — upsert the customer segmentation mart.
--
-- The USING clause is a subquery that reads mart.customer_stats
-- (built in 05_insert_mart.sql) and applies tiering logic, showing
-- that MERGE lineage correctly chains through the upstream mart.
--
-- WHEN MATCHED refreshes segment + spend for existing rows.
-- WHEN NOT MATCHED inserts new customers discovered since the
-- last run.
--
-- Demonstrates: MERGE with subquery source, CASE expression
-- in USING clause, column lineage through UPDATE and INSERT arms.
-- ============================================================

MERGE INTO mart.customer_segments AS target
USING (
    SELECT
        customer_id,
        email,
        full_name,
        country,
        total_spend,
        total_orders,
        last_order_date,
        CASE
            WHEN total_spend  >= 20000 THEN 'Platinum'
            WHEN total_spend  >= 10000 THEN 'Gold'
            WHEN total_spend  >=  2000 THEN 'Silver'
            WHEN total_orders >=     1 THEN 'Bronze'
            ELSE                            'Prospect'
        END AS segment
    FROM mart.customer_stats
) AS source
ON target.customer_id = source.customer_id

WHEN MATCHED THEN
    UPDATE SET
        target.segment        = source.segment,
        target.total_spend    = source.total_spend,
        target.total_orders   = source.total_orders,
        target.last_order_date = source.last_order_date

WHEN NOT MATCHED THEN
    INSERT (
        customer_id,
        email,
        full_name,
        country,
        segment,
        total_spend,
        total_orders,
        last_order_date
    )
    VALUES (
        source.customer_id,
        source.email,
        source.full_name,
        source.country,
        source.segment,
        source.total_spend,
        source.total_orders,
        source.last_order_date
    );