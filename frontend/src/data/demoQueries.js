/**
 * Demo SQL queries for showcasing lineage capabilities.
 *
 * Each entry has:
 *  - name: Tab label shown in the UI
 *  - sql:  The SQL statement to parse
 *
 * These cover a variety of patterns:
 *  1. Simple JOINs + subquery
 *  2. Multi-table aggregation pipeline
 *  3. INSERT … SELECT (write lineage)
 *  4. CTE with window function
 *  5. Cross-database style staging → mart
 */
const DEMO_QUERIES = [
    {
        name: 'Customer Spend',
        sql: `SELECT
    ranked_customers.customer_id,
    ranked_customers.first_name,
    ranked_customers.last_name,
    ranked_customers.total_spent
FROM (
    SELECT
        c.customer_id,
        c.first_name,
        c.last_name,
        SUM(o.total_amount) AS total_spent
    FROM customers c
    INNER JOIN orders o
        ON o.customer_id = c.customer_id
    WHERE o.status = 'COMPLETED'
    GROUP BY
        c.customer_id,
        c.first_name,
        c.last_name
) AS ranked_customers
WHERE ranked_customers.total_spent > (
    SELECT AVG(o2.total_amount)
    FROM orders o2
    WHERE o2.status = 'COMPLETED'
)
ORDER BY ranked_customers.total_spent DESC`,
    },
    {
        name: 'Revenue Report',
        sql: `SELECT
    p.product_id,
    p.product_name,
    p.category,
    SUM(oi.quantity) AS total_units_sold,
    SUM(oi.quantity * oi.unit_price) AS total_revenue,
    COUNT(DISTINCT o.order_id) AS order_count
FROM products p
INNER JOIN order_items oi
    ON oi.product_id = p.product_id
INNER JOIN orders o
    ON o.order_id = oi.order_id
WHERE o.order_date >= '2025-01-01'
GROUP BY
    p.product_id,
    p.product_name,
    p.category
HAVING SUM(oi.quantity * oi.unit_price) > 1000
ORDER BY total_revenue DESC`,
    },
    {
        name: 'Sales Summary',
        sql: `CREATE TABLE sales_summary AS
SELECT
    s.store_id,
    st.store_name,
    st.region,
    DATE_TRUNC('month', s.sale_date) AS sale_month,
    SUM(s.amount) AS monthly_revenue,
    COUNT(*) AS transaction_count
FROM sales s
INNER JOIN stores st
    ON st.store_id = s.store_id
GROUP BY
    s.store_id,
    st.store_name,
    st.region,
    DATE_TRUNC('month', s.sale_date)`,
    },
    {
        name: 'Top Employees',
        sql: `WITH department_avg AS (
    SELECT
        e.department_id,
        d.department_name,
        AVG(e.salary) AS avg_salary
    FROM employees e
    INNER JOIN departments d
        ON d.department_id = e.department_id
    GROUP BY
        e.department_id,
        d.department_name
),
ranked_employees AS (
    SELECT
        e.employee_id,
        e.first_name,
        e.last_name,
        e.salary,
        e.department_id,
        da.department_name,
        da.avg_salary AS dept_avg_salary,
        RANK() OVER (
            PARTITION BY e.department_id
            ORDER BY e.salary DESC
        ) AS salary_rank
    FROM employees e
    INNER JOIN department_avg da
        ON da.department_id = e.department_id
)
SELECT
    ranked_employees.employee_id,
    ranked_employees.first_name,
    ranked_employees.last_name,
    ranked_employees.salary,
    ranked_employees.department_name,
    ranked_employees.dept_avg_salary,
    ranked_employees.salary_rank
FROM ranked_employees
WHERE ranked_employees.salary_rank <= 3
ORDER BY
    ranked_employees.department_name,
    ranked_employees.salary_rank`,
    },
    {
        name: 'User Metrics',
        sql: `CREATE TABLE mart_user_metrics AS
SELECT
    u.user_id,
    u.username,
    u.signup_date,
    COALESCE(activity.total_sessions, 0) AS total_sessions,
    COALESCE(activity.last_active, u.signup_date) AS last_active,
    COALESCE(payments.lifetime_value, 0) AS lifetime_value
FROM users u
LEFT JOIN (
    SELECT
        s.user_id,
        COUNT(*) AS total_sessions,
        MAX(s.session_start) AS last_active
    FROM sessions s
    GROUP BY s.user_id
) AS activity
    ON activity.user_id = u.user_id
LEFT JOIN (
    SELECT
        p.user_id,
        SUM(p.amount) AS lifetime_value
    FROM payments p
    WHERE p.status = 'completed'
    GROUP BY p.user_id
) AS payments
    ON payments.user_id = u.user_id`,
    },
    {
        name: 'Sample Insert AS Select',
        sql: `INSERT INTO sales_mart.sales (sale_id, sale_date, store_id, product_id, quantity, amount)
SELECT
    s.sale_id,
    s.sale_date,
    s.store_id,
    s.product_id,
    s.quantity,
    s.amount
FROM sales_staging.sales s
WHERE s.sale_date >= '2025-01-01'`,
    },
    {
        name: 'salesmart.sales',
        sql: `CREATE TABLE sales_mart.sales AS
        SELECT sale_id, sale_date, store_id, product_id, quantity, amount
        FROM sales_staging.sales
        WHERE sale_date >= '2025-01-01'`,
    },
];

export default DEMO_QUERIES;
