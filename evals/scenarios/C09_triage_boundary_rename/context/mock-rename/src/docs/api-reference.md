# ACME Platform API Reference — v1

**Base URL**: `https://api.acme.io/v1`
**Authentication**: Bearer token in `Authorization` header
**Rate Limit**: 1000 requests/minute per API key

> **Partner Integration Note**: 12 partners are currently integrated against this API.
> Field names in response objects are part of the public contract and must not change
> without a deprecation cycle (minimum 6 months per our API versioning policy).

---

## Users

### GET /users/:id

Returns the public profile for a user.

**Response** (200):
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "jane@example.com",
  "name": "Jane Smith",
  "created_at": "2025-01-15T09:30:00Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `user_id` | UUID | Unique user identifier. Use this as the primary key when referencing users in your system. |
| `email` | string | User's email address. |
| `name` | string | User's display name. |
| `created_at` | ISO 8601 | Account creation timestamp. |

### POST /users

Creates a new user account.

**Request Body**:
```json
{
  "email": "jane@example.com",
  "name": "Jane Smith",
  "password": "..."
}
```

**Response** (201):
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "jane@example.com",
  "name": "Jane Smith",
  "created_at": "2025-01-15T09:30:00Z"
}
```

### GET /users/:id/orders

Returns paginated order history for a user.

**Query Parameters**:
- `page` (default: 1) — page number
- `limit` (default: 20, max: 100) — results per page

**Response** (200):
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "orders": [
    {
      "order_id": "...",
      "user_id": "550e8400-e29b-41d4-a716-446655440000",
      "total_cents": 4999,
      "currency": "USD",
      "status": "completed",
      "created_at": "2025-03-01T14:22:00Z"
    }
  ],
  "page": 1,
  "limit": 20
}
```

---

## Audit

### GET /audit/:user_id

Returns the audit trail for a user. Used by compliance integrations.

**Query Parameters**:
- `since` (ISO 8601) — filter entries after this timestamp (default: 30 days ago)

**Response** (200):
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "audit_entries": [
    {
      "log_id": 12345,
      "user_id": "550e8400-e29b-41d4-a716-446655440000",
      "action": "order.created",
      "resource_type": "order",
      "resource_id": "...",
      "metadata": {},
      "timestamp": "2025-03-01T14:22:00Z"
    }
  ]
}
```

---

## Webhooks (Outbound)

ACME sends webhook events to partner endpoints for the following events:

### user.created

Fired when a new user account is created.

```json
{
  "event": "user.created",
  "timestamp": "2025-03-01T14:22:00Z",
  "data": {
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "jane@example.com",
    "name": "Jane Smith"
  }
}
```

### order.completed

Fired when an order is successfully processed.

```json
{
  "event": "order.completed",
  "timestamp": "2025-03-01T14:22:00Z",
  "data": {
    "order_id": "...",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "total_cents": 4999,
    "currency": "USD"
  }
}
```

---

## SDK Examples

### JavaScript
```javascript
const response = await fetch('https://api.acme.io/v1/users/550e8400-e29b-41d4-a716-446655440000', {
  headers: { 'Authorization': `Bearer ${API_KEY}` }
});
const data = await response.json();
console.log(data.user_id); // Partners use this field to link to their internal systems
```

### Python
```python
import requests

resp = requests.get(
    f"https://api.acme.io/v1/users/{user_id}",
    headers={"Authorization": f"Bearer {API_KEY}"}
)
user = resp.json()
# Map ACME user_id to our internal account
our_account = account_mapping[user["user_id"]]
```
