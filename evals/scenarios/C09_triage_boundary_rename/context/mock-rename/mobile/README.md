# ACME Mobile App (React Native)

## Overview

The ACME mobile app is a React Native application available on iOS and Android.
It communicates with the ACME Platform API (`/api/v1/*`) and maintains a local
SQLite database for offline support and performance.

## Local SQLite Schema

The mobile app stores user data locally for offline access:

```sql
CREATE TABLE local_user (
    user_id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    auth_token TEXT,
    synced_at TEXT NOT NULL
);

CREATE TABLE cached_orders (
    order_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    total_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES local_user(user_id)
);

CREATE INDEX idx_cached_orders_user_id ON cached_orders (user_id);
```

## Sync Behavior

- On app launch, the app calls `GET /api/v1/me` and stores the response in `local_user`.
  The `user_id` from the API response is used as the PK in the local SQLite table.
- Orders are cached locally and synced when connectivity is available.
- The `user_id` field is used extensively throughout the app's React components as the
  key for user identification, navigation params, and AsyncStorage keys.

## Release Cadence

- App store releases go through a 1-2 week review cycle.
- Users update on their own schedule — we typically see 80% adoption within 6 weeks.
- **We cannot force-update the app.** Old versions will continue to run with the
  existing local SQLite schema for months after any backend change.
- Current minimum supported version: 2.10.0 (released 2025-12-01)

## Key Constraint

The mobile app expects the API to return `user_id` in all user-related responses.
If the field is renamed or removed from the API, older app versions will crash on
the user profile screen (the app does `response.user_id` without a fallback).

**Estimated time to safely deprecate `user_id` from the API for mobile users:**
- 1 week to ship an update that reads both `user_id` and `account_id`
- 2 weeks for app store review
- 6 weeks for 80% adoption
- Add 3 months safety margin for the long tail

**Total: ~5 months minimum before `user_id` can be removed from API responses.**
