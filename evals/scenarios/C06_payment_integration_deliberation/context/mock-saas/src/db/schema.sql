-- Database schema for the SaaS application
-- Last modified: 2026-03-15

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Users ───────────────────────────────────────────────────────────────────

CREATE TYPE plan_tier_enum AS ENUM ('free', 'pro');

CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email       VARCHAR(255) UNIQUE NOT NULL,
    name        VARCHAR(255) NOT NULL,
    plan_tier   plan_tier_enum NOT NULL DEFAULT 'free',
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- NOTE: No billing-related columns exist:
    --   - No stripe_customer_id
    --   - No subscription_id or subscription_status
    --   - No billing_address or payment_method fields
    --   - No billing_email (separate from login email)
    --   - No trial_ends_at or current_period_end
    -- The plan_tier column is a simple enum with no subscription lifecycle.
    -- Upgrading a user currently means a direct UPDATE to plan_tier with
    -- no payment validation, no proration, and no external service sync.

    CONSTRAINT users_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_plan_tier ON users(plan_tier);

-- ─── Projects ────────────────────────────────────────────────────────────────

CREATE TABLE projects (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_projects_owner ON projects(owner_id);

-- ─── Usage Events ────────────────────────────────────────────────────────────
-- Tracks API call events for analytics and rate limiting.
-- Each row represents a single API call made by a user.
--
-- NOTE: This table was designed for analytics dashboards and rate limiting,
-- NOT for billing. There is no guarantee that every billable API call
-- produces exactly one usage_event row. Specifically:
--   - Internal/admin API calls may or may not be logged here
--   - Failed requests (4xx, 5xx) are currently logged as events
--   - Batch endpoints count as a single event regardless of items processed
--   - There is no deduplication mechanism for retry storms
--   - The event_type values are not standardized (free-text from middleware)

CREATE TABLE usage_events (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
    event_type  VARCHAR(100) NOT NULL,
    endpoint    VARCHAR(500),
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_usage_events_user ON usage_events(user_id);
CREATE INDEX idx_usage_events_user_date ON usage_events(user_id, created_at);
CREATE INDEX idx_usage_events_type ON usage_events(event_type);

-- NOTE: No tables exist for:
--   - subscriptions / subscription_items
--   - invoices / invoice_line_items
--   - payment_methods
--   - webhook_events (for idempotent webhook processing)
--   - billing_periods or metered usage aggregation
