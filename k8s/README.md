# Kubernetes Setup

This folder runs the same app stack as `docker-compose.yml` with simple Kubernetes manifests.

## Services

- `database` - PostgreSQL 15 with a persistent volume and seeded `init.sql`
- `user-service` - user registration/login API
- `event-service` - event API
- `registration-service` - booking/registration API
- `notification-service` - notification API
- `frontend` - React/Vite frontend with API proxy routes
- `prometheus` - metrics scraping
- `grafana` - dashboards UI

## Local Run

Build the local images first:

```bash
docker compose build
```

If the Kubernetes stack is already running and you rebuild an image with the same `latest` tag, restart the affected deployment:

```bash
kubectl -n event-management rollout restart deployment/frontend
```

Apply everything:

```bash
kubectl apply -k k8s
```

Check the pods:

```bash
kubectl -n event-management get pods
kubectl -n event-management get services
```

Open the frontend:

```bash
kubectl -n event-management port-forward svc/frontend 3000:3000
```

Then visit:

```text
http://localhost:3000
```

Prometheus and Grafana can also be opened with port-forwarding:

```bash
kubectl -n event-management port-forward svc/prometheus 9090:9090
kubectl -n event-management port-forward svc/grafana 3005:3000
```

## Notes

- The Kubernetes service names intentionally match Docker Compose names. The frontend uses full Kubernetes DNS names in `app-config` because Nginx resolves runtime proxy targets directly:
  - `http://user-service.event-management.svc.cluster.local:3001`
  - `http://event-service.event-management.svc.cluster.local:3002`
  - `http://registration-service.event-management.svc.cluster.local:3003`
  - `http://notification-service.event-management.svc.cluster.local:3004`
  - `postgresql://postgres:postgres@database:5432/event_management`
- The frontend browser calls `/api/...`; the frontend container proxies those requests to the internal Kubernetes services.
- Docker Desktop Kubernetes can usually use the images built by `docker compose build`.
- If you use Minikube or Kind, load the local images into that cluster before applying the manifests.

## Reset

To remove the Kubernetes stack:

```bash
kubectl delete -k k8s
```

If you also want to remove database data, delete the PVC:

```bash
kubectl -n event-management delete pvc postgres-data
```
