# Infrastructure Architecture Notes

## Overview

Production runs entirely in us-east-1 across three availability zones (1a, 1b, 1c). The application is a mid-size SaaS platform with a monolithic API layer (EC2), microservices (ECS Fargate), and async processing (Lambda).

## Compute Layout

- **EC2 fleet**: 12 production m5.2xlarge instances spread across 3 AZs. Roles: API gateway (3), background workers (3), search indexers (2), ML inference (2), monitoring (1), bastion (1).
- **ECS Fargate**: 8 services, 24 tasks total. Services handle user management, orders, payments, notifications, search API, analytics collection, image processing, and admin dashboard.
- **Lambda**: 47 functions. Most are event-driven. Three high-cost functions run on 5-minute cron schedules for health checks and data syncing.

## Data Layer

- **RDS PostgreSQL**: Primary (db.r5.2xlarge, Multi-AZ) in us-east-1b. Read replica (same class) in us-east-1c. The read replica was originally for a reporting workload that moved to a data warehouse in Q4 2025 but was never decommissioned.
- **ElastiCache Redis**: 3-node cluster (cache.r5.large). Used for session caching and rate limiting. Memory usage is low at 22%.
- **S3**: 18TB across 4 buckets. 14TB is log data older than 90 days sitting in S3 Standard with no lifecycle policies.

## Networking

### Cross-AZ Traffic

This is the biggest hidden cost driver. ECS tasks are distributed across 3 AZs for availability, but the RDS primary is in us-east-1b only. Every query from a task in 1a or 1c incurs cross-AZ data transfer charges. With 24 tasks and frequent database queries, this adds up to approximately $2,240/month in cross-AZ transfer costs (70% of total data transfer).

### NAT Gateway

All Lambda functions in private subnets route outbound traffic through a single NAT Gateway. Processing 2TB/month at $0.045/GB = $90 for processing alone, plus hourly charges. Most of this traffic is outbound API calls to third-party services (Stripe, SendGrid, Datadog, etc.).

### CloudFront

Static assets served via CloudFront, but TTL is set to 5 minutes for all content. Origin fetch rate is 40% of requests, meaning CloudFront is re-fetching content from origin far more often than necessary. Most static assets (JS bundles, images, CSS) change only on deploys (weekly).

## Known Issues

1. Dev/staging instances run 24/7 but are only used during business hours (roughly 9am-6pm ET, weekdays). This wastes approximately 70% of their runtime cost.
2. The bastion host is an m5.2xlarge but should be a t3.micro or similar — it is massively over-provisioned.
3. No autoscaling is configured anywhere — not on EC2 ASGs, not on ECS services. All capacity is statically provisioned.
4. The read replica processes fewer than 5% of queries and costs $1,440/month. It may be unnecessary given the low primary CPU utilization.

## Historical Context

- **2025-Q1**: Purchased 1-year standard Reserved Instances for c5.xlarge. In 2025-Q3, migrated all workloads to m5 family for better memory characteristics. The c5 RIs ran unused for 6 months, wasting approximately $8,400.
- **2025-Q2**: Attempted Spot Instances for production ECS tasks. Three capacity reclamations in one week caused 15-minute outages each time. Root cause: no on-demand fallback was configured, and only one instance type was specified (no diversification). The team reverted to on-demand.
