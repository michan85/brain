-- ==========================================================================
-- Reporting / Analytics Dashboard Queries
-- These are the saved queries used by the Metabase instance connected
-- to the PostgreSQL read replica. ~20 dashboards with complex JOINs.
-- ==========================================================================

-- -------------------------------------------------------------------------
-- Dashboard: Revenue Overview (Daily/Weekly/Monthly)
-- -------------------------------------------------------------------------

-- Daily revenue with YoY comparison
SELECT
    d.order_date,
    d.order_count,
    d.gross_revenue,
    d.net_revenue,
    d.unique_customers,
    prev_year.gross_revenue     AS prev_year_revenue,
    ROUND(
        (d.gross_revenue - COALESCE(prev_year.gross_revenue, 0))
        / NULLIF(prev_year.gross_revenue, 0) * 100, 2
    )                           AS yoy_growth_pct
FROM mv_daily_revenue d
LEFT JOIN mv_daily_revenue prev_year
    ON prev_year.order_date = d.order_date - INTERVAL '1 year'
WHERE d.order_date >= CURRENT_DATE - INTERVAL '90 days'
ORDER BY d.order_date DESC;

-- Revenue by category (last 30 days)
SELECT
    c.name                          AS category,
    c.parent_id,
    pc.name                         AS parent_category,
    COUNT(DISTINCT o.id)            AS order_count,
    SUM(oi.quantity)                AS units_sold,
    SUM(oi.total_price)             AS revenue,
    SUM(oi.total_price) / SUM(SUM(oi.total_price)) OVER () * 100 AS revenue_share_pct
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN products p ON p.id = oi.product_id
JOIN categories c ON c.id = p.category_id
LEFT JOIN categories pc ON pc.id = c.parent_id
WHERE o.status NOT IN ('cancelled', 'refunded')
  AND o.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY c.id, c.name, c.parent_id, pc.name
ORDER BY revenue DESC;

-- -------------------------------------------------------------------------
-- Dashboard: Customer Cohort Analysis
-- -------------------------------------------------------------------------

-- Monthly cohort retention (6-table JOIN)
WITH cohorts AS (
    SELECT
        u.id AS user_id,
        DATE_TRUNC('month', u.date_joined)::DATE AS cohort_month
    FROM users u
    WHERE u.is_active = TRUE
),
activity AS (
    SELECT
        c.user_id,
        c.cohort_month,
        DATE_TRUNC('month', o.created_at)::DATE AS activity_month
    FROM cohorts c
    JOIN orders o ON o.user_id = c.user_id
    WHERE o.status NOT IN ('cancelled', 'refunded')
)
SELECT
    a.cohort_month,
    a.activity_month,
    (EXTRACT(YEAR FROM a.activity_month) - EXTRACT(YEAR FROM a.cohort_month)) * 12
        + EXTRACT(MONTH FROM a.activity_month) - EXTRACT(MONTH FROM a.cohort_month)
        AS months_since_signup,
    COUNT(DISTINCT a.user_id) AS active_users,
    (SELECT COUNT(DISTINCT c2.user_id) FROM cohorts c2 WHERE c2.cohort_month = a.cohort_month) AS cohort_size
FROM activity a
GROUP BY a.cohort_month, a.activity_month
ORDER BY a.cohort_month, a.activity_month;

-- Customer lifetime value by acquisition source
SELECT
    u.referral_source,
    COUNT(DISTINCT u.id)                        AS customers,
    AVG(up.total_spent)                         AS avg_ltv,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY up.total_spent) AS median_ltv,
    AVG(up.order_count)                         AS avg_orders,
    SUM(up.total_spent)                         AS total_revenue,
    AVG(DATE_PART('day', first_order.first_at - u.date_joined)) AS avg_days_to_first_order
FROM users u
JOIN user_profiles up ON up.user_id = u.id
LEFT JOIN LATERAL (
    SELECT MIN(o.created_at) AS first_at
    FROM orders o
    WHERE o.user_id = u.id AND o.status NOT IN ('cancelled', 'refunded')
) first_order ON TRUE
WHERE u.date_joined >= CURRENT_DATE - INTERVAL '1 year'
GROUP BY u.referral_source
ORDER BY total_revenue DESC;

-- -------------------------------------------------------------------------
-- Dashboard: Product Performance
-- -------------------------------------------------------------------------

-- Top products by revenue with margin analysis (8-table effective JOIN)
SELECT
    p.id,
    p.name,
    p.sku,
    c.name                              AS category,
    b.name                              AS brand,
    SUM(oi.quantity)                     AS units_sold,
    SUM(oi.total_price)                 AS revenue,
    SUM(oi.quantity * p.cost_price)      AS cogs,
    SUM(oi.total_price) - SUM(oi.quantity * p.cost_price) AS gross_profit,
    ROUND(
        (SUM(oi.total_price) - SUM(oi.quantity * p.cost_price))
        / NULLIF(SUM(oi.total_price), 0) * 100, 2
    )                                   AS margin_pct,
    p.avg_rating,
    p.review_count,
    p.stock_quantity                     AS current_stock,
    CASE
        WHEN p.stock_quantity <= 0 THEN 'Out of Stock'
        WHEN p.stock_quantity <= p.low_stock_threshold THEN 'Low Stock'
        ELSE 'In Stock'
    END                                 AS stock_status
FROM products p
JOIN categories c ON c.id = p.category_id
LEFT JOIN brands b ON b.id = p.brand_id
JOIN order_items oi ON oi.product_id = p.id
JOIN orders o ON o.id = oi.order_id
LEFT JOIN reviews r ON r.product_id = p.id
LEFT JOIN promotion_products pp ON pp.product_id = p.id
LEFT JOIN promotions pr ON pr.id = pp.promotion_id AND pr.is_active = TRUE
WHERE o.status NOT IN ('cancelled', 'refunded')
  AND o.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY p.id, p.name, p.sku, c.name, b.name, p.avg_rating, p.review_count,
         p.stock_quantity, p.low_stock_threshold
ORDER BY revenue DESC
LIMIT 50;

-- Product conversion funnel
SELECT
    p.id,
    p.name,
    views.view_count,
    cart_adds.add_count,
    purchases.purchase_count,
    ROUND(cart_adds.add_count::NUMERIC / NULLIF(views.view_count, 0) * 100, 2)
        AS view_to_cart_pct,
    ROUND(purchases.purchase_count::NUMERIC / NULLIF(cart_adds.add_count, 0) * 100, 2)
        AS cart_to_purchase_pct
FROM products p
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS view_count
    FROM user_activities ua
    WHERE ua.product_id = p.id
      AND ua.activity_type = 'page_view'
      AND ua.created_at >= CURRENT_DATE - INTERVAL '30 days'
) views ON TRUE
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS add_count
    FROM user_activities ua
    WHERE ua.product_id = p.id
      AND ua.activity_type = 'add_to_cart'
      AND ua.created_at >= CURRENT_DATE - INTERVAL '30 days'
) cart_adds ON TRUE
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS purchase_count
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.product_id = p.id
      AND o.status NOT IN ('cancelled', 'refunded')
      AND o.created_at >= CURRENT_DATE - INTERVAL '30 days'
) purchases ON TRUE
WHERE p.is_active = TRUE
ORDER BY views.view_count DESC NULLS LAST
LIMIT 100;

-- -------------------------------------------------------------------------
-- Dashboard: Inventory Health
-- -------------------------------------------------------------------------

-- Inventory turnover by category
SELECT
    c.name                              AS category,
    COUNT(p.id)                         AS product_count,
    SUM(p.stock_quantity)               AS total_stock,
    SUM(CASE WHEN p.stock_quantity <= 0 THEN 1 ELSE 0 END) AS out_of_stock,
    SUM(CASE WHEN p.stock_quantity > 0 AND p.stock_quantity <= p.low_stock_threshold THEN 1 ELSE 0 END) AS low_stock,
    COALESCE(sales.units_sold_30d, 0)   AS units_sold_30d,
    ROUND(
        COALESCE(sales.units_sold_30d, 0)::NUMERIC / NULLIF(SUM(p.stock_quantity), 0) * 30, 1
    )                                   AS days_of_stock_remaining
FROM products p
JOIN categories c ON c.id = p.category_id
LEFT JOIN LATERAL (
    SELECT SUM(oi.quantity) AS units_sold_30d
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.product_id = p.id
      AND o.status NOT IN ('cancelled', 'refunded')
      AND o.created_at >= CURRENT_DATE - INTERVAL '30 days'
) sales ON TRUE
WHERE p.is_active = TRUE
GROUP BY c.id, c.name, sales.units_sold_30d
ORDER BY days_of_stock_remaining ASC NULLS LAST;

-- Stock movement audit trail
SELECT
    il.created_at,
    p.name                  AS product,
    p.sku,
    il.change_type,
    il.quantity_change,
    il.quantity_after,
    il.reference_id,
    u.email                 AS changed_by
FROM inventory_logs il
JOIN products p ON p.id = il.product_id
LEFT JOIN users u ON u.id = il.created_by
WHERE il.created_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY il.created_at DESC;

-- -------------------------------------------------------------------------
-- Dashboard: Order Fulfillment
-- -------------------------------------------------------------------------

-- Fulfillment pipeline status
SELECT
    o.status,
    COUNT(*)                            AS order_count,
    SUM(o.total)                        AS total_value,
    AVG(EXTRACT(EPOCH FROM (NOW() - o.created_at)) / 3600) AS avg_age_hours,
    MIN(o.created_at)                   AS oldest_order
FROM orders o
WHERE o.status IN ('pending', 'confirmed', 'processing', 'shipped')
GROUP BY o.status
ORDER BY
    CASE o.status
        WHEN 'pending' THEN 1
        WHEN 'confirmed' THEN 2
        WHEN 'processing' THEN 3
        WHEN 'shipped' THEN 4
    END;

-- Shipping performance by carrier
SELECT
    sm.name                             AS shipping_method,
    sm.carrier,
    COUNT(s.id)                         AS shipment_count,
    AVG(EXTRACT(DAY FROM (s.delivered_at - s.shipped_at))) AS avg_delivery_days,
    PERCENTILE_CONT(0.95) WITHIN GROUP (
        ORDER BY EXTRACT(DAY FROM (s.delivered_at - s.shipped_at))
    )                                   AS p95_delivery_days,
    SUM(CASE WHEN s.delivered_at IS NULL AND s.shipped_at < NOW() - INTERVAL '7 days'
        THEN 1 ELSE 0 END)             AS potentially_lost
FROM shipments s
JOIN shipping_methods sm ON sm.id = s.shipping_method_id
JOIN orders o ON o.id = s.order_id
WHERE s.shipped_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY sm.id, sm.name, sm.carrier
ORDER BY shipment_count DESC;

-- -------------------------------------------------------------------------
-- Dashboard: Coupon & Promotion Effectiveness
-- -------------------------------------------------------------------------

-- Coupon performance
SELECT
    cp.code,
    cp.discount_percent,
    cp.discount_amount,
    cp.times_used,
    COUNT(o.id)                         AS orders_with_coupon,
    SUM(o.total)                        AS total_revenue,
    SUM(o.discount_amount)              AS total_discount_given,
    AVG(o.total)                        AS avg_order_value,
    AVG(o.total) - (
        SELECT AVG(o2.total) FROM orders o2
        WHERE o2.coupon_id IS NULL
          AND o2.status NOT IN ('cancelled', 'refunded')
          AND o2.created_at >= CURRENT_DATE - INTERVAL '90 days'
    )                                   AS aov_vs_non_coupon
FROM coupons cp
LEFT JOIN orders o ON o.coupon_id = cp.id
    AND o.status NOT IN ('cancelled', 'refunded')
GROUP BY cp.id, cp.code, cp.discount_percent, cp.discount_amount, cp.times_used
ORDER BY total_revenue DESC;

-- -------------------------------------------------------------------------
-- Nightly batch: Revenue and Cohort Report (scheduled via cron)
-- Joins 6+ tables, runs against read replica
-- -------------------------------------------------------------------------

-- Weekly revenue by customer tier and category (used in executive summary)
SELECT
    DATE_TRUNC('week', o.created_at)::DATE  AS week_start,
    up.tier                                  AS customer_tier,
    c.name                                   AS category,
    COUNT(DISTINCT o.id)                     AS orders,
    COUNT(DISTINCT o.user_id)                AS customers,
    SUM(oi.total_price)                      AS revenue,
    SUM(oi.quantity)                          AS units,
    AVG(o.total)                             AS avg_order_value,
    SUM(oi.total_price) - SUM(oi.quantity * p.cost_price) AS gross_profit
FROM orders o
JOIN users u ON u.id = o.user_id
JOIN user_profiles up ON up.user_id = u.id
JOIN order_items oi ON oi.order_id = o.id
JOIN products p ON p.id = oi.product_id
JOIN categories c ON c.id = p.category_id
WHERE o.status NOT IN ('cancelled', 'refunded')
  AND o.created_at >= CURRENT_DATE - INTERVAL '12 weeks'
GROUP BY 1, 2, 3
ORDER BY 1 DESC, revenue DESC;
