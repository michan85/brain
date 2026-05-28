-- ==========================================================================
-- PostgreSQL schema for ecommerce application
-- ~40 tables, heavy use of foreign keys, unique constraints, and indexes
-- ==========================================================================

-- -------------------------------------------------------------------------
-- Users & Authentication
-- -------------------------------------------------------------------------

CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    email           VARCHAR(254) NOT NULL UNIQUE,
    password_hash   VARCHAR(128) NOT NULL,
    first_name      VARCHAR(150) NOT NULL,
    last_name       VARCHAR(150) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_staff        BOOLEAN NOT NULL DEFAULT FALSE,
    is_superuser    BOOLEAN NOT NULL DEFAULT FALSE,
    email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    phone           VARCHAR(20) NOT NULL DEFAULT '',
    referral_source VARCHAR(50) NOT NULL DEFAULT '',
    date_joined     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login      TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_date_joined ON users (date_joined);
CREATE INDEX idx_users_active_joined ON users (is_active, date_joined);

CREATE TABLE user_profiles (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    tier                VARCHAR(20) NOT NULL DEFAULT 'bronze'
                            CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum')),
    total_spent         NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    order_count         INTEGER NOT NULL DEFAULT 0,
    loyalty_points      INTEGER NOT NULL DEFAULT 0,
    preferred_currency  VARCHAR(3) NOT NULL DEFAULT 'USD',
    newsletter_subscribed BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_profiles_tier ON user_profiles (tier);
CREATE INDEX idx_user_profiles_total_spent ON user_profiles (total_spent);

CREATE TABLE user_sessions (
    id          VARCHAR(64) PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    data        JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_user_sessions_user ON user_sessions (user_id);
CREATE INDEX idx_user_sessions_expires ON user_sessions (expires_at);

CREATE TABLE user_activities (
    id              BIGSERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_type   VARCHAR(30) NOT NULL,
    product_id      INTEGER REFERENCES products(id) ON DELETE SET NULL,
    session_id      VARCHAR(64) NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_activities_user_type_time ON user_activities (user_id, activity_type, created_at);
CREATE INDEX idx_user_activities_time ON user_activities (created_at);

CREATE TABLE shipping_addresses (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name       VARCHAR(255) NOT NULL,
    street_address  VARCHAR(500) NOT NULL,
    city            VARCHAR(100) NOT NULL,
    state           VARCHAR(100) NOT NULL,
    postal_code     VARCHAR(20) NOT NULL,
    country         VARCHAR(2) NOT NULL DEFAULT 'US',
    phone           VARCHAR(20) NOT NULL DEFAULT '',
    is_default      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_shipping_addr_user_default ON shipping_addresses (user_id, is_default);

-- -------------------------------------------------------------------------
-- Products & Catalog
-- -------------------------------------------------------------------------

CREATE TABLE categories (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL UNIQUE,
    slug        VARCHAR(200) NOT NULL UNIQUE,
    parent_id   INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    description TEXT NOT NULL DEFAULT '',
    image_url   VARCHAR(500) NOT NULL DEFAULT '',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_parent_sort ON categories (parent_id, sort_order);
CREATE INDEX idx_categories_slug ON categories (slug);

CREATE TABLE brands (
    id       SERIAL PRIMARY KEY,
    name     VARCHAR(200) NOT NULL UNIQUE,
    slug     VARCHAR(200) NOT NULL UNIQUE,
    logo_url VARCHAR(500) NOT NULL DEFAULT '',
    website  VARCHAR(500) NOT NULL DEFAULT ''
);

CREATE TABLE tags (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE products (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(500) NOT NULL,
    slug                VARCHAR(500) NOT NULL UNIQUE,
    sku                 VARCHAR(50) NOT NULL UNIQUE,
    description         TEXT NOT NULL,
    short_description   VARCHAR(500) NOT NULL DEFAULT '',
    price               NUMERIC(10, 2) NOT NULL CHECK (price > 0),
    compare_at_price    NUMERIC(10, 2),
    cost_price          NUMERIC(10, 2),
    category_id         INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    brand_id            INTEGER REFERENCES brands(id) ON DELETE SET NULL,
    stock_quantity      INTEGER NOT NULL DEFAULT 0,
    low_stock_threshold INTEGER NOT NULL DEFAULT 10,
    weight_grams        INTEGER,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    is_featured         BOOLEAN NOT NULL DEFAULT FALSE,
    is_digital          BOOLEAN NOT NULL DEFAULT FALSE,
    avg_rating          NUMERIC(3, 2) NOT NULL DEFAULT 0.00,
    review_count        INTEGER NOT NULL DEFAULT 0,
    total_sold          INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_category_active ON products (category_id, is_active);
CREATE INDEX idx_products_price ON products (price);
CREATE INDEX idx_products_created ON products (created_at);
CREATE INDEX idx_products_featured ON products (is_active, is_featured);
CREATE INDEX idx_products_stock ON products (stock_quantity);
CREATE INDEX idx_products_sku ON products (sku);

CREATE TABLE product_tags (
    product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, tag_id)
);

CREATE TABLE product_variants (
    id               SERIAL PRIMARY KEY,
    product_id       INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name             VARCHAR(200) NOT NULL,
    sku_suffix       VARCHAR(20) NOT NULL,
    price_adjustment NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    stock_quantity   INTEGER NOT NULL DEFAULT 0,
    attributes       JSONB NOT NULL DEFAULT '{}',
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (product_id, sku_suffix)
);

CREATE TABLE product_images (
    id          SERIAL PRIMARY KEY,
    product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    url         VARCHAR(500) NOT NULL,
    alt_text    VARCHAR(300) NOT NULL DEFAULT '',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_primary  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_product_images_product ON product_images (product_id, sort_order);

-- -------------------------------------------------------------------------
-- Orders & Payments
-- -------------------------------------------------------------------------

CREATE TABLE orders (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'confirmed', 'processing',
                                              'shipped', 'delivered', 'cancelled', 'refunded')),
    shipping_address_id INTEGER NOT NULL REFERENCES shipping_addresses(id) ON DELETE RESTRICT,
    coupon_id           INTEGER REFERENCES coupons(id) ON DELETE SET NULL,
    subtotal            NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
    tax_amount          NUMERIC(12, 2) NOT NULL CHECK (tax_amount >= 0),
    shipping_cost       NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    discount_amount     NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total               NUMERIC(12, 2) NOT NULL CHECK (total >= 0),
    notes               TEXT NOT NULL DEFAULT '',
    tracking_number     VARCHAR(100) NOT NULL DEFAULT '',
    estimated_delivery  DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_user_status ON orders (user_id, status);
CREATE INDEX idx_orders_created_status ON orders (created_at, status);
CREATE INDEX idx_orders_status_created ON orders (status, created_at);

CREATE TABLE order_items (
    id                  SERIAL PRIMARY KEY,
    order_id            INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id          INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    variant_id          INTEGER REFERENCES product_variants(id) ON DELETE RESTRICT,
    quantity            INTEGER NOT NULL CHECK (quantity > 0),
    unit_price          NUMERIC(10, 2) NOT NULL,
    total_price         NUMERIC(12, 2) NOT NULL,
    product_snapshot    JSONB NOT NULL DEFAULT '{}',
    UNIQUE (order_id, product_id, variant_id)
);

CREATE INDEX idx_order_items_order ON order_items (order_id);
CREATE INDEX idx_order_items_product ON order_items (product_id);

CREATE TABLE payment_records (
    id                      SERIAL PRIMARY KEY,
    order_id                INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    method                  VARCHAR(20) NOT NULL
                                CHECK (method IN ('credit_card', 'debit_card', 'paypal', 'bank_transfer')),
    status                  VARCHAR(20) NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'authorized', 'captured', 'failed', 'refunded')),
    amount                  NUMERIC(12, 2) NOT NULL,
    currency                VARCHAR(3) NOT NULL DEFAULT 'USD',
    gateway_transaction_id  VARCHAR(255) NOT NULL UNIQUE,
    gateway_response        JSONB NOT NULL DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_records_order_status ON payment_records (order_id, status);

CREATE TABLE refunds (
    id              SERIAL PRIMARY KEY,
    order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    payment_id      INTEGER NOT NULL REFERENCES payment_records(id) ON DELETE RESTRICT,
    amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    reason          TEXT NOT NULL DEFAULT '',
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    processed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- Coupons & Promotions
-- -------------------------------------------------------------------------

CREATE TABLE coupons (
    id                  SERIAL PRIMARY KEY,
    code                VARCHAR(50) NOT NULL UNIQUE,
    discount_percent    NUMERIC(5, 2),
    discount_amount     NUMERIC(10, 2),
    min_order_amount    NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    max_uses            INTEGER NOT NULL DEFAULT 0,
    times_used          INTEGER NOT NULL DEFAULT 0,
    valid_from          TIMESTAMPTZ NOT NULL,
    valid_until         TIMESTAMPTZ NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    CHECK (discount_percent IS NOT NULL OR discount_amount IS NOT NULL)
);

CREATE TABLE promotions (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(200) NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    discount_type   VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed', 'bogo')),
    discount_value  NUMERIC(10, 2) NOT NULL,
    start_date      TIMESTAMPTZ NOT NULL,
    end_date        TIMESTAMPTZ NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE promotion_products (
    promotion_id    INTEGER NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
    product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    PRIMARY KEY (promotion_id, product_id)
);

-- -------------------------------------------------------------------------
-- Reviews & Ratings
-- -------------------------------------------------------------------------

CREATE TABLE reviews (
    id                      SERIAL PRIMARY KEY,
    user_id                 INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id              INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    rating                  SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title                   VARCHAR(200) NOT NULL,
    body                    TEXT NOT NULL,
    is_verified_purchase    BOOLEAN NOT NULL DEFAULT FALSE,
    helpful_count           INTEGER NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, product_id)
);

CREATE INDEX idx_reviews_product_rating ON reviews (product_id, rating);
CREATE INDEX idx_reviews_created ON reviews (created_at);

-- -------------------------------------------------------------------------
-- Shopping Cart
-- -------------------------------------------------------------------------

CREATE TABLE carts (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_id  VARCHAR(64),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_carts_user ON carts (user_id);
CREATE INDEX idx_carts_session ON carts (session_id);

CREATE TABLE cart_items (
    id          SERIAL PRIMARY KEY,
    cart_id     INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id  INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
    quantity    INTEGER NOT NULL CHECK (quantity > 0),
    added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (cart_id, product_id, variant_id)
);

-- -------------------------------------------------------------------------
-- Wishlists
-- -------------------------------------------------------------------------

CREATE TABLE wishlist_items (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, product_id)
);

-- -------------------------------------------------------------------------
-- Inventory Audit
-- -------------------------------------------------------------------------

CREATE TABLE inventory_logs (
    id                  BIGSERIAL PRIMARY KEY,
    product_id          INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    change_type         VARCHAR(20) NOT NULL
                            CHECK (change_type IN ('order', 'cancel', 'restock', 'adjustment', 'return')),
    quantity_change     INTEGER NOT NULL,
    quantity_after      INTEGER NOT NULL,
    reference_id        VARCHAR(100) NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_inventory_logs_product_time ON inventory_logs (product_id, created_at);
CREATE INDEX idx_inventory_logs_type_time ON inventory_logs (change_type, created_at);

-- -------------------------------------------------------------------------
-- Notifications
-- -------------------------------------------------------------------------

CREATE TABLE notifications (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            VARCHAR(50) NOT NULL,
    title           VARCHAR(300) NOT NULL,
    body            TEXT NOT NULL DEFAULT '',
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_read ON notifications (user_id, is_read, created_at);

-- -------------------------------------------------------------------------
-- Shipping & Fulfillment
-- -------------------------------------------------------------------------

CREATE TABLE shipping_methods (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    carrier         VARCHAR(50) NOT NULL,
    base_cost       NUMERIC(10, 2) NOT NULL,
    cost_per_kg     NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    min_days        INTEGER NOT NULL,
    max_days        INTEGER NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE shipments (
    id                  SERIAL PRIMARY KEY,
    order_id            INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    shipping_method_id  INTEGER NOT NULL REFERENCES shipping_methods(id) ON DELETE RESTRICT,
    tracking_number     VARCHAR(100),
    status              VARCHAR(20) NOT NULL DEFAULT 'pending',
    shipped_at          TIMESTAMPTZ,
    delivered_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shipments_order ON shipments (order_id);
CREATE INDEX idx_shipments_tracking ON shipments (tracking_number);

-- -------------------------------------------------------------------------
-- Tax Configuration
-- -------------------------------------------------------------------------

CREATE TABLE tax_rates (
    id          SERIAL PRIMARY KEY,
    country     VARCHAR(2) NOT NULL,
    state       VARCHAR(100) NOT NULL DEFAULT '',
    rate        NUMERIC(6, 4) NOT NULL,
    name        VARCHAR(100) NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (country, state)
);

-- -------------------------------------------------------------------------
-- Audit Log (general)
-- -------------------------------------------------------------------------

CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(50) NOT NULL,
    table_name      VARCHAR(100) NOT NULL,
    record_id       INTEGER,
    old_values      JSONB,
    new_values      JSONB,
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_table_time ON audit_log (table_name, created_at);
CREATE INDEX idx_audit_log_user ON audit_log (user_id, created_at);

-- -------------------------------------------------------------------------
-- Materialized Views (used by Metabase dashboards)
-- -------------------------------------------------------------------------

CREATE MATERIALIZED VIEW mv_daily_revenue AS
SELECT
    DATE_TRUNC('day', o.created_at)::DATE AS order_date,
    COUNT(DISTINCT o.id)                  AS order_count,
    SUM(o.total)                          AS gross_revenue,
    SUM(o.discount_amount)                AS total_discounts,
    SUM(o.total - o.discount_amount)      AS net_revenue,
    SUM(o.tax_amount)                     AS total_tax,
    COUNT(DISTINCT o.user_id)             AS unique_customers
FROM orders o
WHERE o.status NOT IN ('cancelled', 'refunded')
GROUP BY 1
ORDER BY 1 DESC;

CREATE UNIQUE INDEX idx_mv_daily_revenue_date ON mv_daily_revenue (order_date);

CREATE MATERIALIZED VIEW mv_product_performance AS
SELECT
    p.id                            AS product_id,
    p.name                          AS product_name,
    p.sku,
    c.name                          AS category_name,
    SUM(oi.quantity)                AS units_sold,
    SUM(oi.total_price)             AS total_revenue,
    SUM(oi.quantity * p.cost_price) AS total_cost,
    AVG(r.rating)                   AS avg_rating,
    COUNT(DISTINCT r.id)            AS review_count
FROM products p
JOIN categories c ON c.id = p.category_id
LEFT JOIN order_items oi ON oi.product_id = p.id
LEFT JOIN orders o ON o.id = oi.order_id AND o.status NOT IN ('cancelled', 'refunded')
LEFT JOIN reviews r ON r.product_id = p.id
GROUP BY p.id, p.name, p.sku, c.name;

CREATE UNIQUE INDEX idx_mv_product_perf_product ON mv_product_performance (product_id);
