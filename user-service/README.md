# User Service

This project contains only the User Service for the Event Management System.

It does not include a database image, Docker Compose file, frontend, Event Service, Registration Service, or Notification Service. PostgreSQL will be provided separately later as its own container or service.

## Required Environment Variables

```env
PORT=3001
DATABASE_URL=postgresql://postgres:postgres@database:5432/event_management
INITIAL_ORGANIZER_EMAIL=beso.organizer@example.com
```

`DATABASE_URL` must use the hostname that the User Service container can use to reach PostgreSQL. In Docker Compose this is normally `database`.

The service uses PostgreSQL through the `pg` package and creates/migrates the `users` table automatically when PostgreSQL is reachable. Supported roles are `user` and `organizer`.

## Build the Docker Image

Run this command from the `user-service` directory:

```bash
docker build -t event-user-service:latest .
```

## Run Without a Database

You can run the service now even if PostgreSQL is not available:

```bash
docker run -p 3001:3001 \
  -e PORT=3001 \
  -e DATABASE_URL=postgresql://postgres:postgres@database:5432/event_management \
  event-user-service:latest
```

Expected behavior without PostgreSQL:

- `GET /health` works.
- `GET /health/db` returns that the database is disconnected.
- User routes return `503` until PostgreSQL is available.

## Run When PostgreSQL Exists Later

Use the same image and pass the real PostgreSQL connection values:

```bash
docker run -p 3001:3001 \
  -e PORT=3001 \
  -e DATABASE_URL=postgresql://postgres:postgres@database:5432/event_management \
  event-user-service:latest
```

If PostgreSQL runs in another Docker container, both containers must be able to reach each other on the same Docker network, and the database host inside `DATABASE_URL` should be the database container or service name.

## Endpoints

### Health Check

```http
GET /health
```

Success response:

```json
{
  "status": "ok",
  "service": "user-service"
}
```

### Database Health Check

```http
GET /health/db
```

Success response:

```json
{
  "status": "ok",
  "database": "connected"
}
```

Failure response:

```json
{
  "status": "error",
  "database": "disconnected",
  "message": "Database is not reachable"
}
```

### Register User

```http
POST /users/register
```

Request body:

```json
{
  "name": "Sasa",
  "email": "sasa@example.com",
  "password": "123456",
  "role": "user"
}
```

Success response:

```json
{
  "message": "User registered successfully",
  "user": {
    "id": 1,
    "name": "Sasa",
    "email": "sasa@example.com",
    "role": "user",
    "created_at": "..."
  }
}
```

Duplicate email response:

```json
{
  "message": "Email already exists"
}
```

Database unavailable response:

```json
{
  "message": "Database unavailable. Please try again later."
}
```

### Login User

```http
POST /users/login
```

Request body:

```json
{
  "email": "sasa@example.com",
  "password": "123456"
}
```

Success response:

```json
{
  "message": "Login successful",
  "user": {
    "id": 1,
    "name": "Sasa",
    "email": "sasa@example.com",
    "role": "user"
  }
}
```

Invalid login response:

```json
{
  "message": "Invalid email or password"
}
```

Database unavailable response:

```json
{
  "message": "Database unavailable. Please try again later."
}
```

### Get User By ID

```http
GET /users/:id
```

Success response:

```json
{
  "id": 1,
  "name": "Sasa",
  "email": "sasa@example.com",
  "role": "user",
  "created_at": "..."
}
```

### Get User Role

```http
GET /users/:id/role
```

Success response:

```json
{
  "id": 1,
  "role": "user"
}
```

Not found response:

```json
{
  "message": "User not found"
}
```

Database unavailable response:

```json
{
  "message": "Database unavailable. Please try again later."
}
```
