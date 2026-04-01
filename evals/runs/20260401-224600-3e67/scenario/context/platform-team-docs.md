# Platform Team — Technical Documentation

## Tech Stack

### Languages
- **Go**: Primary language for all backend services. Used for the API gateway, internal microservices, and CLI tooling.
- **TypeScript**: Used for internal dashboards, admin tools, and developer experience tooling.

### Infrastructure
- **Kubernetes**: Container orchestration for all environments (staging and production).
- **Terraform**: Infrastructure-as-code for cloud resource provisioning (AWS).
- **ArgoCD**: GitOps-based continuous deployment. Watches Git repos and syncs Kubernetes manifests.

### Observability
- **Datadog**: Metrics collection, APM tracing, and log aggregation.
- **Grafana**: Custom dashboards for team-specific views and SLO tracking.
- **PagerDuty**: Alerting and on-call rotation management.

### API Gateway
- Built on **Envoy proxy** with custom Go filter chains.
- Handles rate limiting, authentication passthrough, and request routing.
- Current capacity: 10,000 RPS at p99 of 50ms.

## Team
The platform team has 6 engineers and owns all shared infrastructure services.
The API gateway is the team's primary externally-facing service.
