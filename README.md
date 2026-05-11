# Event Management System

A microservices-based platform for planning, organizing, and managing events such as conferences, workshops, and seminars. The system allows organizers to create and manage events, and users to browse events and book tickets.

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Components](#components)
3. [Setting Up Development Environments](#setting-up-development-environments)
4. [Deploying the Platform](#deploying-the-platform)
5. [Bonus Features](#bonus-features)

---

## Project Structure

```
Event-Management-System-integration/
│
├── user-service/                  # User management microservice
│   ├── src/
│   │   ├── app.js                 # Express server, routes, authentication
│   │   └── db.js                  # PostgreSQL connection and table setup
│   ├── Dockerfile                 # Container image definition
│   └── package.json
│
├── event-service/                 # Event management microservice
│   ├── config/
│   │   └── db.js                  # PostgreSQL connection
│   ├── index.js                   # Express server, CRUD, seat management
│   ├── Dockerfile
│   └── package.json
│
├── registration-service/          # Booking and ticketing microservice
│   ├── index.js                   # Express server, booking, payment processing
│   ├── Dockerfile
│   └── package.json
│
├── notification-service/          # Notification microservice
│   ├── src/
│   │   └── index.js               # Express server, RabbitMQ consumer
│   ├── Dockerfile
│   └── package.json
│
├── frontend/                      # React single-page application
│   ├── src/
│   │   ├── App.jsx                # Main UI component
│   │   ├── api.js                 # API client for all backend services
│   │   ├── App.css                # Styles
│   │   └── main.jsx               # React entry point
│   ├── nginx.conf.template        # Nginx reverse proxy configuration
│   ├── vite.config.js             # Vite dev server with proxy settings
│   ├── Dockerfile                 # Multi-stage build (Node → Nginx)
│   └── package.json
│
├── database/
│   └── init.sql                   # Database schema and seed data
│
├── monitoring/                    # Prometheus, Grafana, Loki configs
│   ├── prometheus.yml
│   ├── loki-config.yml
│   ├── promtail-compose.yml
│   └── grafana/provisioning/      # Grafana datasource configs
│
├── k8s/                           # Kubernetes manifests
│   ├── namespace.yaml
│   ├── config.yaml                # ConfigMaps and Secrets
│   ├── postgres.yaml              # Database StatefulSet
│   ├── messaging.yaml             # RabbitMQ Deployment
│   ├── backend-services.yaml      # All 4 backend Deployments + Services
│   ├── frontend.yaml              # Frontend Deployment + NodePort Service
│   ├── monitoring.yaml            # Prometheus, Grafana, Loki, Promtail
│   └── kustomization.yaml         # Kustomize entry point
│
├── tests/
│   └── integration.test.sh        # Integration test suite
│
├── docker-compose.yml             # Base multi-container definition
├── docker-compose.dev.yml         # Development environment overrides
├── docker-compose.test.yml        # Testing environment overrides
├── docker-compose.prod.yml        # Production environment overrides
├── .env.dev                       # Development environment variables
├── .env.test                      # Testing environment variables
├── .env.prod                      # Production environment variables
└── README.md
```

---

## Components

### Architecture Overview

```
                        ┌─────────────────┐
                        │    Frontend     │
                        │  (React/Nginx)  │
                        │   Port: 3000    │
                        └──┬──┬──┬──┬────┘
                           │  │  │  │
              ┌────────────┘  │  │  └────────────┐
              ▼               ▼  ▼               ▼
     ┌──────────────┐ ┌────────────────┐ ┌──────────────────┐
     │ User Service  │ │ Event Service  │ │  Notification    │
     │  Port: 3001   │ │  Port: 3002    │ │    Service       │
     └──────┬───────┘ └───┬────┬───────┘ │  Port: 3004      │
            │             │    │         └────────┬─────────┘
            │             │    │                  │
            │    ┌────────┘    │                  │
            │    ▼             │                  │
     ┌──────────────────┐     │         ┌────────┴────────┐
     │  Registration    │     │         │    RabbitMQ      │
     │    Service       │◄────┘         │   Port: 5672    │
     │  Port: 3003      │              └─────────────────┘
     └──────┬───────────┘
            │
     ┌──────┴──────────┐
     │   PostgreSQL     │
     │   Port: 5432     │
     └─────────────────┘
```

### Service Details

#### 1. User Service (Port 3001)

Handles user registration, login, and role management. Supports two roles: `user` (can browse and book events) and `organizer` (can create and manage events).

- **Technology**: Node.js, Express 5, PostgreSQL, bcrypt
- **Key endpoints**: `POST /users/register`, `POST /users/login`, `GET /users/:id`

#### 2. Event Service (Port 3002)

Manages event CRUD operations (create, read, update, delete), event cancellation, and seat inventory (reserve/release seats). Publishes event changes to RabbitMQ for async notification delivery.

- **Technology**: Node.js, Express 5, PostgreSQL, RabbitMQ (amqplib)
- **Key endpoints**: `GET /events`, `POST /events`, `PUT /events/:id`, `DELETE /events/:id`, `PATCH /events/:id/cancel`, `PATCH /events/:id/reserve-seat`
- **Authorization**: Only organizers can create/update/delete events. Internal service token used for cross-service seat management.

#### 3. Registration Service (Port 3003)

Handles event bookings, payment processing (simulated), and participant management. Communicates with the Event Service to reserve/release seats and publishes booking confirmations to RabbitMQ.

- **Technology**: Node.js, Express 5, PostgreSQL, RabbitMQ, Axios
- **Key endpoints**: `POST /registrations`, `GET /registrations/user/:userId`, `GET /registrations/event/:eventId`, `DELETE /registrations/:id`
- **Cross-service calls**: Validates users via User Service, reserves seats via Event Service

#### 4. Notification Service (Port 3004)

Stores and serves notifications. Listens to RabbitMQ for async events (event updates, cancellations, bookings) and creates notifications for all affected users.

- **Technology**: Node.js, Express 5, PostgreSQL, RabbitMQ
- **Key endpoints**: `GET /notifications/user/:userId`, `PUT /notifications/:id/read`, `POST /notifications`
- **Async behavior**: When an event is updated, cancelled, or deleted, all registered users receive a notification automatically.

#### 5. Frontend (Port 3000)

React single-page application served by Nginx. Nginx acts as a reverse proxy, routing API calls (`/api/user-service/`, `/api/event-service/`, etc.) to the corresponding backend services.

- **Technology**: React 19, Vite 8, Nginx 1.27
- **Build**: Multi-stage Docker build — Node builds the app, Nginx serves the static files

#### 6. Infrastructure Services

| Service        | Image                          | Port  | Purpose                          |
|---------------|-------------------------------|-------|----------------------------------|
| PostgreSQL    | `postgres:15`                 | 5432  | Shared relational database       |
| RabbitMQ      | `rabbitmq:3-management-alpine`| 5672  | Async messaging between services |
| Prometheus    | `prom/prometheus`             | 9090  | Metrics collection               |
| Grafana       | `grafana/grafana`             | 3005  | Metrics dashboards               |
| Loki          | `grafana/loki:3.1.2`          | 3100  | Log aggregation                  |
| Promtail      | `grafana/promtail:3.1.2`      | —     | Log shipping to Loki             |

### Inter-Service Communication

- **Synchronous (HTTP)**: Services call each other via REST APIs using internal Docker DNS names (e.g., `http://user-service:3001`).
- **Asynchronous (RabbitMQ)**: The Event Service publishes changes to a `events_exchange` fanout exchange. The Notification Service consumes from a bound queue. The Registration Service sends booking confirmations directly to the notification queue.
- **Authentication**: Cross-service calls use `x-internal-service-token` header for privileged operations like seat reservation.

---

## Setting Up Development Environments

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (v20+)
- [Docker Compose](https://docs.docker.com/compose/) (v2+)

### Environment Configuration

The project supports three environments, each with its own env file and compose override:

| Environment   | Env File     | Compose Override            | Frontend Port | DB Port |
|--------------|-------------|---------------------------|---------------|---------|
| Development  | `.env.dev`   | `docker-compose.dev.yml`   | 3000          | 5432    |
| Testing      | `.env.test`  | `docker-compose.test.yml`  | 3100          | 5433    |
| Production   | `.env.prod`  | `docker-compose.prod.yml`  | 3200          | 5434    |

Each environment uses **different host ports** so all three can run simultaneously on the same machine.

### Starting an Environment

**Development:**

```bash
docker compose -p event-dev \
  --env-file .env.dev \
  -f docker-compose.yml -f docker-compose.dev.yml \
  up --build -d
```

The frontend is accessible at **http://localhost:3000**.

**Testing:**

```bash
docker compose -p event-test \
  --env-file .env.test \
  -f docker-compose.yml -f docker-compose.test.yml \
  up --build -d
```

The frontend is accessible at **http://localhost:3100**.

**Production:**

```bash
docker compose -p event-prod \
  --env-file .env.prod \
  -f docker-compose.yml -f docker-compose.prod.yml \
  up --build -d
```

The frontend is accessible at **http://localhost:3200**.

### Running All Three Environments Simultaneously

Because each environment maps to different host ports, you can spin up all three at the same time:

```bash
# Start all three
docker compose -p event-dev  --env-file .env.dev  -f docker-compose.yml -f docker-compose.dev.yml  up --build -d
docker compose -p event-test --env-file .env.test -f docker-compose.yml -f docker-compose.test.yml up --build -d
docker compose -p event-prod --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

Each project (`-p` flag) creates an isolated set of containers, volumes, and networks.

### Stopping an Environment

```bash
# Stop development (preserving data)
docker compose -p event-dev --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml down

# Stop and remove all data (volumes)
docker compose -p event-dev --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans
```

### Verifying Services Are Running

```bash
# Check container status
docker compose -p event-dev --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml ps

# View logs
docker compose -p event-dev --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml logs -f

# View logs for a specific service
docker compose -p event-dev --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml logs event-service
```

### Health Check Endpoints

Once running, verify each service is healthy:

```bash
curl http://localhost:3001/health    # User Service
curl http://localhost:3002/health    # Event Service
curl http://localhost:3003/           # Registration Service
curl http://localhost:3004/health    # Notification Service
curl http://localhost:3000/health    # Frontend (Nginx)
```

### Seeded Test Accounts

The database is auto-initialized with seed data. Use these accounts to test:

| Email                        | Password | Role      |
|------------------------------|----------|-----------|
| beso.organizer@example.com   | 123456   | organizer |
| sasa@example.com             | 123456   | user      |
| soz@example.com              | 123456   | user      |

### Running Integration Tests

After starting any environment:

```bash
bash tests/integration.test.sh
```

The test suite validates health checks, user registration/login, event creation, booking, cancellation, deletion, overbooking prevention, and notifications.

---

## Deploying the Platform

### Kubernetes Deployment

#### Prerequisites

- A running Kubernetes cluster (minikube, kind, or cloud-managed)
- `kubectl` configured to connect to the cluster
- Docker images built locally

#### Step 1: Build Docker Images

```bash
docker compose build
```

This builds all 5 custom images:
- `event-management-system-integration-user-service`
- `event-management-system-integration-event-service`
- `event-management-system-integration-registration-service`
- `event-management-system-integration-notification-service`
- `event-management-system-integration-frontend`

#### Step 2: Load Images into the Cluster

**For minikube:**

```bash
eval $(minikube docker-env)
docker compose build
```

**For kind:**

```bash
kind load docker-image event-management-system-integration-user-service:latest
kind load docker-image event-management-system-integration-event-service:latest
kind load docker-image event-management-system-integration-registration-service:latest
kind load docker-image event-management-system-integration-notification-service:latest
kind load docker-image event-management-system-integration-frontend:latest
```

#### Step 3: Apply Kubernetes Manifests

Using Kustomize (applies all manifests in the correct order):

```bash
kubectl apply -k k8s/
```

Or apply individually:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/config.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/messaging.yaml
kubectl apply -f k8s/backend-services.yaml
kubectl apply -f k8s/frontend.yaml
kubectl apply -f k8s/monitoring.yaml
```

#### Step 4: Verify the Deployment

```bash
# Check all pods are running
kubectl get pods -n event-management

# Check all services
kubectl get services -n event-management
```

Wait until all pods show `Running` status and `READY 1/1`.

#### Step 5: Access the Application

The frontend is exposed via a NodePort service on port **30000**:

**For minikube:**

```bash
minikube service frontend -n event-management
```

**For other clusters:**

```
http://<node-ip>:30000
```

#### Kubernetes Manifest Overview

| File                      | Resources                                          |
|--------------------------|---------------------------------------------------|
| `namespace.yaml`          | `event-management` namespace                       |
| `config.yaml`            | ConfigMaps (app-config, prometheus, loki, grafana) and Secrets (app-secrets, database-init-sql) |
| `postgres.yaml`          | PostgreSQL StatefulSet + Service + PersistentVolumeClaim |
| `messaging.yaml`         | RabbitMQ Deployment + Service                       |
| `backend-services.yaml`  | user-service, event-service, registration-service, notification-service (Deployments + Services) |
| `frontend.yaml`          | Frontend Deployment + NodePort Service              |
| `monitoring.yaml`        | Prometheus, Grafana, Loki, Promtail                 |
| `kustomization.yaml`     | Kustomize configuration that ties all manifests together |

#### Tearing Down the Deployment

```bash
kubectl delete -k k8s/
```

---

## Bonus Features

### 1. Monitoring and Logging

The system includes a full monitoring and centralized logging stack using **Prometheus**, **Grafana**, **Loki**, and **Promtail**.

#### How It Works

- **Prometheus** scrapes `/metrics` endpoints from all 4 backend services every 5 seconds and stores the time-series data.
- **Grafana** connects to Prometheus and Loki as data sources and provides dashboards for visualization.
- **Loki** is a log aggregation system that receives logs from Promtail.
- **Promtail** runs as a sidecar container that collects Docker container logs and ships them to Loki for centralized storage.

Each backend service exposes a `/metrics` endpoint in Prometheus text format with service-specific counters:

| Service              | Metrics Exposed                                              |
|---------------------|-------------------------------------------------------------|
| User Service         | `user_service_up`, `user_total`                             |
| Event Service        | `event_service_up`, `event_total`                           |
| Registration Service | `registration_service_up`, `registration_total`, `registration_paid_total` |
| Notification Service | `notification_service_up`, `notifications_total`            |

#### Configuration Files

| File                                  | Purpose                                     |
|--------------------------------------|---------------------------------------------|
| `monitoring/prometheus.yml`          | Prometheus scrape configuration (targets)    |
| `monitoring/loki-config.yml`         | Loki storage and ingestion settings          |
| `monitoring/promtail-compose.yml`    | Promtail pipeline and Docker log collection  |
| `monitoring/grafana/provisioning/`   | Grafana auto-provisioned datasources         |

#### How to Test Monitoring and Logging

**Step 1 — Verify Prometheus is scraping all services:**

```bash
# Check Prometheus is healthy
curl http://localhost:9090/-/healthy
# Expected: Prometheus Server is Healthy.

# Check all scrape targets are UP
curl -s http://localhost:9090/api/v1/targets | python3 -c "
import sys, json
data = json.load(sys.stdin)
for t in data['data']['activeTargets']:
    print(f\"  {t['labels']['job']:30s} → {t['health']}\")
"
# Expected output:
#   event-service                  → up
#   notification-service           → up
#   registration-service           → up
#   user-service                   → up
```

**Step 2 — Verify each service exposes metrics:**

```bash
curl http://localhost:3001/metrics   # user_service_up 1
curl http://localhost:3002/metrics   # event_service_up 1
curl http://localhost:3003/metrics   # registration_service_up 1
curl http://localhost:3004/metrics   # notification_service_up 1
```

**Step 3 — Query metrics in Prometheus UI:**

Open http://localhost:9090 in a browser, go to the **Graph** tab, and run these queries:
- `event_total` — total number of events in the system
- `registration_total` — total number of registrations
- `up` — shows which services are being scraped

**Step 4 — Verify Grafana is running and has data sources:**

```bash
# Check Grafana health
curl http://localhost:3005/api/health
# Expected: {"database":"ok", "version":"..."}
```

Open http://localhost:3005 in a browser (default login: `admin` / `admin`). Navigate to **Connections → Data sources** to confirm Prometheus and Loki are listed.

**Step 5 — Verify Loki is collecting logs:**

```bash
# Check Loki is ready
curl http://localhost:3300/ready
# Expected: ready

# Check Loki has received log labels
curl -s http://localhost:3300/loki/api/v1/labels | python3 -c "
import sys, json
data = json.load(sys.stdin)
print('Labels:', data['data'])
"
# Expected: Labels include 'job', 'stream', 'filename', etc.

# Query actual logs from Loki
curl -s "http://localhost:3300/loki/api/v1/query_range" \
  --data-urlencode 'query={job="docker"}' \
  --data-urlencode 'limit=3' | python3 -c "
import sys, json
data = json.load(sys.stdin)
streams = data.get('data', {}).get('result', [])
print(f'Found {len(streams)} log stream(s)')
for s in streams[:2]:
    for val in s.get('values', [])[:1]:
        print(f'  Log: {val[1][:120]}...')
"
```

**Step 6 — View logs in Grafana:**

In Grafana (http://localhost:3005), go to **Explore**, select **Loki** as the data source, and run the query `{job="docker"}` to see all container logs in one place.

---

### 2. Asynchronous Communication

Services communicate asynchronously using **RabbitMQ** message broker. This decouples the Event Service and Registration Service from the Notification Service, allowing notifications to be processed independently without blocking API responses.

#### How It Works

```
Event Service                          Notification Service
     │                                        ▲
     │ publishes to                            │ consumes from
     ▼                                        │
┌─────────────────┐    bound to    ┌──────────────────────┐
│ events_exchange  │──────────────►│ event_notifications   │
│ (fanout)         │               │ (queue)               │
└─────────────────┘               └──────────────────────┘
                                              ▲
Registration Service                          │
     │ sends directly to queue ───────────────┘
```

- **Event Service** publishes messages to the `events_exchange` fanout exchange when events are created, updated, cancelled, or deleted.
- **Notification Service** binds the `event_notifications` queue to the exchange and consumes messages. On receiving update/cancel/delete events, it queries the database for all registered users and creates individual notifications for each one.
- **Registration Service** sends booking confirmation messages directly to the `event_notifications` queue.

#### Message Types

| Event Type           | Published By          | Trigger                        | Who Gets Notified         |
|---------------------|-----------------------|-------------------------------|--------------------------|
| `event.created`      | Event Service         | New event created              | Organizer                |
| `event.updated`      | Event Service         | Event details changed          | All registered users     |
| `event.cancelled`    | Event Service         | Event cancelled by organizer   | All registered users     |
| `event.deleted`      | Event Service         | Event deleted by organizer     | All registered users     |
| `event.seat_reserved`| Event Service         | Seat reserved                  | Organizer                |
| `event.seat_released`| Event Service         | Seat released                  | Organizer                |
| `booking.confirmed`  | Registration Service  | User books an event            | The booking user         |

#### How to Test Asynchronous Communication

**Step 1 — Verify RabbitMQ is running:**

```bash
# Check RabbitMQ is healthy
curl -s http://localhost:15672/api/overview -u guest:guest | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f\"RabbitMQ {data['rabbitmq_version']}\")
print(f\"Exchanges: {data['object_totals']['exchanges']}, Queues: {data['object_totals']['queues']}\")
"
# Expected: RabbitMQ 3.x, at least 1 queue
```

**Step 2 — Verify the exchange and queue are set up:**

```bash
# Check the events_exchange exists
curl -s http://localhost:15672/api/exchanges -u guest:guest | python3 -c "
import sys, json
for ex in json.load(sys.stdin):
    if ex['name'] == 'events_exchange':
        print(f\"Exchange: {ex['name']}, Type: {ex['type']}, Durable: {ex['durable']}\")
"
# Expected: Exchange: events_exchange, Type: fanout, Durable: True

# Check the event_notifications queue exists and has a consumer
curl -s http://localhost:15672/api/queues -u guest:guest | python3 -c "
import sys, json
for q in json.load(sys.stdin):
    if q['name'] == 'event_notifications':
        print(f\"Queue: {q['name']}, Messages: {q['messages']}, Consumers: {q['consumers']}\")
"
# Expected: Queue: event_notifications, Messages: 0, Consumers: 1
```

**Step 3 — Test the full async flow (booking → notification):**

```bash
# Login as organizer (get organizer ID)
ORGANIZER=$(curl -s -X POST http://localhost:3001/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"beso.organizer@example.com","password":"123456"}')
ORG_ID=$(echo $ORGANIZER | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])")

# Create an event
EVENT=$(curl -s -X POST http://localhost:3002/events \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Async Test Event\",\"description\":\"Testing async\",\"date\":\"2026-12-25\",\"startTime\":\"10:00\",\"endTime\":\"12:00\",\"location\":\"Room A\",\"capacity\":50,\"organizerId\":$ORG_ID}")
EVENT_ID=$(echo $EVENT | python3 -c "import sys,json; print(json.load(sys.stdin)['event']['id'])")
echo "Created event: $EVENT_ID"

# Book as user 2
curl -s -X POST http://localhost:3003/registrations \
  -H "Content-Type: application/json" \
  -d "{\"userId\":2,\"eventId\":$EVENT_ID,\"paymentMethod\":\"card\",\"amount\":50}" > /dev/null
echo "User 2 booked event $EVENT_ID"

# Book as user 3
curl -s -X POST http://localhost:3003/registrations \
  -H "Content-Type: application/json" \
  -d "{\"userId\":3,\"eventId\":$EVENT_ID,\"paymentMethod\":\"card\",\"amount\":50}" > /dev/null
echo "User 3 booked event $EVENT_ID"

# Wait for RabbitMQ to deliver booking notifications
sleep 2

# Check booking notifications arrived for both users
echo ""
echo "=== Notifications for User 2 ==="
curl -s http://localhost:3004/notifications/user/2 | python3 -c "
import sys, json
for n in json.load(sys.stdin)[:3]:
    print(f\"  [{n['type']}] {n['message']}\")"

echo ""
echo "=== Notifications for User 3 ==="
curl -s http://localhost:3004/notifications/user/3 | python3 -c "
import sys, json
for n in json.load(sys.stdin)[:3]:
    print(f\"  [{n['type']}] {n['message']}\")"
```

**Step 4 — Test cancellation broadcasts to all registered users:**

```bash
# Cancel the event
curl -s -X PATCH "http://localhost:3002/events/$EVENT_ID/cancel" \
  -H "Content-Type: application/json" \
  -H "x-organizer-id: $ORG_ID" \
  -d "{\"organizerId\":$ORG_ID}" > /dev/null
echo "Event $EVENT_ID cancelled"

# Wait for async processing
sleep 2

# Both users should now have a cancellation notification
echo ""
echo "=== User 2 notifications (should include cancellation) ==="
curl -s http://localhost:3004/notifications/user/2 | python3 -c "
import sys, json
for n in json.load(sys.stdin)[:3]:
    print(f\"  [{n['type']}] {n['message']}\")"

echo ""
echo "=== User 3 notifications (should include cancellation) ==="
curl -s http://localhost:3004/notifications/user/3 | python3 -c "
import sys, json
for n in json.load(sys.stdin)[:3]:
    print(f\"  [{n['type']}] {n['message']}\")"
# Expected: Both users show "event.cancelled" notification
```

**Step 5 — Verify via RabbitMQ Management UI:**

Open http://localhost:15672 (login: `guest` / `guest`) and navigate to:
- **Exchanges** tab → confirm `events_exchange` (fanout type) exists
- **Queues** tab → confirm `event_notifications` queue has 1 consumer and 0 pending messages (all processed)

