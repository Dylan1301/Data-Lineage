-- ============================================================
-- 02_create_raw.sql
--
-- DDL definitions for the four raw source tables.
--
-- Load this AFTER 01_select_explore.sql to see the column-level
-- edges retroactively appear on the graph — the parser re-wires
-- all previously unresolved column mappings once it knows the
-- schema of each table.
--
-- Multiple CREATE TABLE statements in one file are all parsed
-- and accumulated into the same session graph.
-- ============================================================

CREATE TABLE raw.customers (
    customer_id   BIGINT       NOT NULL,
    email         VARCHAR(255) NOT NULL,
    name          VARCHAR(255),
    country       VARCHAR(100),
    signup_date   DATE,
    created_at    TIMESTAMP    NOT NULL
);

CREATE TABLE raw.products (
    product_id    BIGINT       NOT NULL,
    name          VARCHAR(255) NOT NULL,
    category      VARCHAR(100),
    cost_price    NUMERIC(10, 2),
    list_price    NUMERIC(10, 2)
);

CREATE TABLE raw.orders (
    order_id      BIGINT       NOT NULL,
    customer_id   BIGINT       NOT NULL,
    status        VARCHAR(50)  NOT NULL,
    order_date    DATE         NOT NULL,
    channel       VARCHAR(50)
);

CREATE TABLE raw.order_lines (
    line_id       BIGINT       NOT NULL,
    order_id      BIGINT       NOT NULL,
    product_id    BIGINT       NOT NULL,
    qty           INT          NOT NULL,
    unit_price    NUMERIC(10, 2) NOT NULL,
    discount      NUMERIC(5, 4)
);