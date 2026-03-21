/**
 * Demo SQL queries for showcasing lineage capabilities.
 *
 * Each entry has:
 *  - name: Tab label shown in the UI
 *  - sql:  The SQL statement to parse
 *
 * The five queries tell a single end-to-end retail warehouse story across
 * three layers.  Each layer's output tables become the next layer's inputs,
 * so the lineage graph connects naturally across all five tabs.
 *
 *   RAW (assumed to exist)
 *     raw.customers, raw.regions, raw.orders, raw.order_items, raw.products
 *
 *   CLEAN  (queries 1 & 2 — CREATE TABLE AS SELECT)
 *     clean.customers  ←  raw.customers  JOIN  raw.regions
 *     clean.order_items ← raw.order_items JOIN raw.products
 *
 *   MART   (queries 3, 4, 5)
 *     mart.customer_ltv  ← INSERT INTO … SELECT  (clean + raw)
 *     mart.daily_sales   ← CREATE TABLE AS SELECT (clean + raw)
 *     mart.customer_segments ← MERGE INTO … USING (mart + clean)
 */
const DEMO_QUERIES = [

    // ── 1 · RAW → CLEAN ──────────────────────────────────────────────────────
    {
        name: '[Clean] Customers',
        sql: `-- Enrich raw customers with regional metadata and deduplicate by email.
-- A window function (ROW_NUMBER) inside a CTE keeps only the latest record
-- when the same email appears more than once in the source.
CREATE TABLE clean.customers AS
WITH enriched AS (
    SELECT
        c.customer_id,
        TRIM(UPPER(c.first_name))    AS first_name,
        TRIM(UPPER(c.last_name))     AS last_name,
        LOWER(TRIM(c.email))         AS email,
        r.region_name,
        r.country_code,
        c.signup_date,
        c.created_at,
        ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(c.email))
            ORDER BY c.created_at DESC
        )                            AS row_num
    FROM raw.customers c
    INNER JOIN raw.regions r
        ON r.region_id = c.region_id
    WHERE c.email       IS NOT NULL
      AND c.customer_id IS NOT NULL
)
SELECT
    customer_id,
    first_name,
    last_name,
    email,
    region_name,
    country_code,
    signup_date,
    created_at
FROM enriched
WHERE row_num = 1`,
    },

    // ── 2 · RAW → CLEAN ──────────────────────────────────────────────────────
    {
        name: '[Clean] Order Items',
        sql: `-- Join raw line items with the product catalogue to freeze the cost price
-- and category at order time, then pre-compute line_total and gross_margin
-- so every downstream mart can simply aggregate these two columns.
CREATE TABLE clean.order_items AS
SELECT
    oi.item_id,
    oi.order_id,
    oi.product_id,
    p.product_name,
    p.category,
    oi.quantity,
    oi.unit_price,
    p.cost_price,
    COALESCE(oi.discount, 0)                                           AS discount,
    oi.quantity * oi.unit_price * (1 - COALESCE(oi.discount, 0))      AS line_total,
    oi.quantity * (oi.unit_price - p.cost_price)                       AS gross_margin
FROM raw.order_items oi
INNER JOIN raw.products p
    ON p.product_id = oi.product_id
WHERE oi.quantity   > 0
  AND oi.unit_price > 0`,
    },

    // ── 3 · CLEAN → MART  (INSERT INTO … SELECT) ─────────────────────────────
    {
        name: '[Mart] Customer LTV',
        sql: `-- Populate the customer lifetime-value mart using INSERT INTO … SELECT.
-- A derived table (order_stats) aggregates spend per customer from the
-- clean layers, then joins to clean.customers for enrichment.
INSERT INTO mart.customer_ltv (
    customer_id,
    full_name,
    country_code,
    total_orders,
    lifetime_spend,
    avg_order_value,
    first_order_date,
    last_order_date
)
SELECT
    c.customer_id,
    c.first_name || ' ' || c.last_name   AS full_name,
    c.country_code,
    order_stats.total_orders,
    order_stats.lifetime_spend,
    order_stats.avg_order_value,
    order_stats.first_order_date,
    order_stats.last_order_date
FROM clean.customers c
INNER JOIN (
    SELECT
        o.customer_id,
        COUNT(DISTINCT o.order_id)   AS total_orders,
        SUM(ci.line_total)           AS lifetime_spend,
        AVG(ci.line_total)           AS avg_order_value,
        MIN(o.order_date)            AS first_order_date,
        MAX(o.order_date)            AS last_order_date
    FROM raw.orders o
    INNER JOIN clean.order_items ci
        ON ci.order_id = o.order_id
    WHERE o.status = 'COMPLETED'
    GROUP BY o.customer_id
) AS order_stats
    ON order_stats.customer_id = c.customer_id`,
    },

    // ── 4 · CLEAN → MART  (CREATE TABLE AS SELECT + CTE + window) ────────────
    {
        name: '[Mart] Daily Sales',
        sql: `-- Build a daily-by-category sales grain and append a cumulative revenue
-- column using a running SUM window function — useful for trend charts.
CREATE TABLE mart.daily_sales AS
WITH daily AS (
    SELECT
        o.order_date,
        ci.category,
        COUNT(DISTINCT o.order_id)     AS total_orders,
        COUNT(DISTINCT o.customer_id)  AS unique_customers,
        SUM(ci.line_total)             AS daily_revenue,
        SUM(ci.gross_margin)           AS daily_margin
    FROM raw.orders o
    INNER JOIN clean.order_items ci
        ON ci.order_id = o.order_id
    WHERE o.status = 'COMPLETED'
    GROUP BY
        o.order_date,
        ci.category
)
SELECT
    order_date,
    category,
    total_orders,
    unique_customers,
    daily_revenue,
    daily_margin,
    SUM(daily_revenue) OVER (
        PARTITION BY category
        ORDER BY order_date
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )                                  AS cumulative_revenue
FROM daily`,
    },

    // ── 5 · MART + CLEAN → MART  (MERGE INTO) ────────────────────────────────
    {
        name: '[Mart] Customer Segments',
        sql: `-- Upsert the customer-segments mart from the LTV mart and clean customers.
-- WHEN MATCHED refreshes the tier and spend for existing rows;
-- WHEN NOT MATCHED inserts brand-new customers discovered since the last run.
MERGE INTO mart.customer_segments AS target
USING (
    SELECT
        ltv.customer_id,
        c.first_name,
        c.last_name,
        c.region_name,
        c.country_code,
        ltv.lifetime_spend,
        ltv.last_order_date,
        CASE
            WHEN ltv.lifetime_spend >= 10000 THEN 'Platinum'
            WHEN ltv.lifetime_spend >=  5000 THEN 'Gold'
            WHEN ltv.lifetime_spend >=  1000 THEN 'Silver'
            ELSE                                   'Bronze'
        END AS customer_tier
    FROM mart.customer_ltv ltv
    INNER JOIN clean.customers c
        ON c.customer_id = ltv.customer_id
) AS source
ON target.customer_id = source.customer_id
WHEN MATCHED THEN
    UPDATE SET
        target.customer_tier   = source.customer_tier,
        target.lifetime_spend  = source.lifetime_spend,
        target.last_order_date = source.last_order_date,
        target.region_name     = source.region_name
WHEN NOT MATCHED THEN
    INSERT (customer_id, first_name, last_name, region_name, country_code, customer_tier, lifetime_spend, last_order_date)
    VALUES (source.customer_id, source.first_name, source.last_name, source.region_name, source.country_code, source.customer_tier, source.lifetime_spend, source.last_order_date)`,
    },
];

export default DEMO_QUERIES;
