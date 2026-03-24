/**
 * Demo SQL queries for showcasing lineage capabilities.
 *
 * Each entry has:
 *  - name: Tab label shown in the UI
 *  - sql:  The SQL statement to parse
 *
 * The six queries form a progressive story — from the simplest possible
 * SELECT to a multi-CTE analytical pipeline — sharing a single e-commerce
 * schema across all tabs so the lineage graph connects naturally.
 *
 *   RAW (assumed to exist)
 *     raw.users, raw.orders, raw.order_lines, raw.products, raw.regions
 *
 *   CLEAN  (queries 3)
 *     clean.users  ←  raw.users  JOIN  raw.regions  (CTAS + CTE + window fn)
 *
 *   MART   (queries 4, 5, 6)
 *     mart.user_summary     ← INSERT INTO … SELECT  (derived-table subquery)
 *     mart.user_segments    ← MERGE INTO … USING    (subquery source)
 *     mart.product_perf     ← CTAS with 3 chained CTEs (the complex showcase)
 *
 * Progression of SQL features:
 *   1. SELECT  — simple join, no extras
 *   2. SELECT  — two CTEs + a subquery inside a CTE
 *   3. CTAS    — CREATE TABLE AS with CTE + ROW_NUMBER deduplication
 *   4. INSERT  — INSERT INTO … SELECT with an inline derived table
 *   5. MERGE   — MERGE INTO … USING a subquery
 *   6. Complex — three CTEs chained together + window functions
 */
const DEMO_QUERIES = [

    // ── 1 · Simple SELECT ─────────────────────────────────────────────────────
    {
        name: '[SELECT] Simple Join',
        sql: `-- The most basic case: a two-table join.
-- Shows that even a plain SELECT produces a clean lineage graph
-- with column-level links from both source tables.
SELECT
    u.user_id,
    u.email,
    u.country,
    o.order_id,
    o.order_date,
    o.status,
    o.total_amount
FROM raw.users  u
INNER JOIN raw.orders o
    ON o.user_id = u.user_id
WHERE o.status = 'COMPLETED'`,
    },

    // ── 2 · SELECT with CTEs + subquery ───────────────────────────────────────
    {
        name: '[SELECT] CTEs + Subquery',
        sql: `-- Two named CTEs where the second one embeds a subquery in its FROM clause.
-- Demonstrates that the parser correctly resolves CTE-to-CTE references
-- and tracks column lineage through the intermediate subquery layer.
WITH us_users AS (
    -- CTE 1: filter to a specific country
    SELECT
        user_id,
        email,
        country
    FROM raw.users
    WHERE country = 'US'
),
order_totals AS (
    -- CTE 2: aggregate orders, but only for the US cohort above
    SELECT
        o.user_id,
        COUNT(DISTINCT o.order_id)  AS order_count,
        SUM(o.total_amount)         AS total_spend
    FROM raw.orders o
    -- Inline subquery — a third level of nesting the parser must handle
    INNER JOIN (
        SELECT user_id FROM us_users
    ) AS cohort ON cohort.user_id = o.user_id
    WHERE o.status = 'COMPLETED'
    GROUP BY o.user_id
)
SELECT
    u.user_id,
    u.email,
    u.country,
    COALESCE(ot.order_count, 0) AS order_count,
    COALESCE(ot.total_spend,  0) AS total_spend
FROM us_users u
LEFT JOIN order_totals ot
    ON ot.user_id = u.user_id`,
    },

    // ── 3 · CTAS with CTE + window function ───────────────────────────────────
    {
        name: '[CTAS] Clean Users',
        sql: `-- CREATE TABLE AS SELECT: materialise a deduplicated, enriched user table.
-- A ROW_NUMBER window function inside a CTE keeps only the most recent
-- record when the same email appears more than once in the raw source.
CREATE TABLE clean.users AS
WITH enriched AS (
    SELECT
        u.user_id,
        LOWER(TRIM(u.email))         AS email,
        TRIM(u.name)                 AS name,
        u.country,
        r.region_name,
        u.created_at,
        ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(u.email))
            ORDER BY u.created_at DESC
        )                            AS rn
    FROM raw.users u
    LEFT JOIN raw.regions r
        ON r.country = u.country
    WHERE u.email IS NOT NULL
)
SELECT
    user_id,
    email,
    name,
    country,
    region_name,
    created_at
FROM enriched
WHERE rn = 1`,
    },

    // ── 4 · INSERT INTO with derived-table subquery ───────────────────────────
    {
        name: '[INSERT] User Summary',
        sql: `-- INSERT INTO … SELECT: load an aggregated mart table.
-- The SELECT joins clean.users to an inline derived table (order_stats)
-- that aggregates raw.orders, demonstrating that INSERT lineage is tracked
-- through both the explicit column list and the subquery layer.
INSERT INTO mart.user_summary (
    user_id,
    email,
    region_name,
    total_orders,
    total_spend,
    avg_order_value,
    first_order_date,
    last_order_date
)
SELECT
    u.user_id,
    u.email,
    u.region_name,
    stats.total_orders,
    stats.total_spend,
    stats.avg_order_value,
    stats.first_order_date,
    stats.last_order_date
FROM clean.users u
INNER JOIN (
    SELECT
        user_id,
        COUNT(DISTINCT order_id)  AS total_orders,
        SUM(total_amount)         AS total_spend,
        AVG(total_amount)         AS avg_order_value,
        MIN(order_date)           AS first_order_date,
        MAX(order_date)           AS last_order_date
    FROM raw.orders
    WHERE status = 'COMPLETED'
    GROUP BY user_id
) AS stats
    ON stats.user_id = u.user_id`,
    },

    // ── 5 · MERGE with subquery USING clause ─────────────────────────────────
    {
        name: '[MERGE] User Segments',
        sql: `-- MERGE INTO … USING a subquery: upsert a segmentation mart.
-- WHEN MATCHED refreshes the segment for existing rows;
-- WHEN NOT MATCHED inserts users discovered since the last run.
-- The USING subquery itself reads from mart.user_summary, showing that
-- MERGE lineage correctly chains through the upstream mart layer.
MERGE INTO mart.user_segments AS target
USING (
    SELECT
        user_id,
        total_spend,
        CASE
            WHEN total_spend >= 10000 THEN 'Platinum'
            WHEN total_spend >=  5000 THEN 'Gold'
            WHEN total_spend >=  1000 THEN 'Silver'
            ELSE                           'Bronze'
        END AS segment
    FROM mart.user_summary
) AS source
ON target.user_id = source.user_id
WHEN MATCHED THEN
    UPDATE SET
        target.segment     = source.segment,
        target.total_spend = source.total_spend
WHEN NOT MATCHED THEN
    INSERT (user_id, segment, total_spend)
    VALUES (source.user_id, source.segment, source.total_spend)`,
    },

    // ── 6 · Complex: three chained CTEs + window functions ────────────────────
    {
        name: '[Complex] Product Performance',
        sql: `-- The full-complexity showcase: three CTEs where each one builds on the last.
-- line_revenue  →  monthly_product  →  product_running  →  final SELECT
--
-- Features exercised in a single query:
--   • Three CTEs with inter-CTE references (CTE fan-out / fan-in)
--   • Multi-table JOIN inside the first CTE (raw.order_lines + raw.products)
--   • A second JOIN that bridges a CTE to a raw table (raw.orders)
--   • Two window functions: SUM() running total + RANK() within partition
--   • Column expressions (computed revenue, margin) tracked end-to-end
CREATE TABLE mart.product_perf AS
WITH
-- Step 1: Compute revenue and margin at the order-line level
line_revenue AS (
    SELECT
        ol.order_id,
        ol.product_id,
        p.name                                                      AS product_name,
        p.category,
        ol.qty,
        ol.unit_price,
        p.cost,
        ol.qty * ol.unit_price * (1 - COALESCE(ol.discount, 0))    AS revenue,
        ol.qty * (ol.unit_price - p.cost)                          AS gross_margin
    FROM raw.order_lines ol
    INNER JOIN raw.products p
        ON p.product_id = ol.product_id
),
-- Step 2: Roll up to product × month, joining to raw.orders for the date
monthly_product AS (
    SELECT
        lr.product_id,
        lr.product_name,
        lr.category,
        DATE_TRUNC('month', o.order_date)   AS month,
        COUNT(DISTINCT o.order_id)          AS orders,
        SUM(lr.revenue)                     AS monthly_revenue,
        SUM(lr.gross_margin)                AS monthly_margin
    FROM line_revenue lr
    INNER JOIN raw.orders o
        ON o.order_id = lr.order_id
    WHERE o.status = 'COMPLETED'
    GROUP BY
        lr.product_id,
        lr.product_name,
        lr.category,
        DATE_TRUNC('month', o.order_date)
),
-- Step 3: Add running totals and within-category rank using window functions
product_running AS (
    SELECT
        product_id,
        product_name,
        category,
        month,
        orders,
        monthly_revenue,
        monthly_margin,
        SUM(monthly_revenue) OVER (
            PARTITION BY product_id
            ORDER BY month
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )                                   AS cumulative_revenue,
        RANK() OVER (
            PARTITION BY category
            ORDER BY monthly_revenue DESC
        )                                   AS rank_in_category
    FROM monthly_product
)
SELECT
    product_id,
    product_name,
    category,
    month,
    orders,
    monthly_revenue,
    monthly_margin,
    cumulative_revenue,
    rank_in_category
FROM product_running
WHERE rank_in_category <= 10`,
    },
];

export default DEMO_QUERIES;