#!/usr/bin/env bash
# ============================================================================
# Event Management System — Integration Tests
# ============================================================================
# Prerequisites:
#   All services must be running (via Docker Compose or locally).
#
# Usage:
#   bash tests/integration.test.sh                    # default: localhost
#   BASE=http://myhost bash tests/integration.test.sh # custom base URL
#
# Environment variables:
#   BASE           — scheme + host (default: http://localhost)
#   USER_PORT      — user service port (default: 3001)
#   EVENT_PORT     — event service port (default: 3002)
#   REG_PORT       — registration service port (default: 3003)
#   NOTIF_PORT     — notification service port (default: 3004)
# ============================================================================

set -euo pipefail

BASE="${BASE:-http://localhost}"
USER_PORT="${USER_PORT:-3001}"
EVENT_PORT="${EVENT_PORT:-3002}"
REG_PORT="${REG_PORT:-3003}"
NOTIF_PORT="${NOTIF_PORT:-3004}"

USER_URL="${BASE}:${USER_PORT}"
EVENT_URL="${BASE}:${EVENT_PORT}"
REG_URL="${BASE}:${REG_PORT}"
NOTIF_URL="${BASE}:${NOTIF_PORT}"

PASS=0
FAIL=0
TOTAL=0

# ── Helpers ──────────────────────────────────────────────────────────────────

green()  { printf "\033[32m%s\033[0m\n" "$*"; }
red()    { printf "\033[31m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
bold()   { printf "\033[1m%s\033[0m\n" "$*"; }

assert_status() {
  local label="$1" expected="$2" actual="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$actual" = "$expected" ]; then
    PASS=$((PASS + 1))
    green "  ✓ ${label} (HTTP ${actual})"
  else
    FAIL=$((FAIL + 1))
    red "  ✗ ${label} — expected ${expected}, got ${actual}"
  fi
}

assert_contains() {
  local label="$1" expected="$2" body="$3"
  TOTAL=$((TOTAL + 1))
  if echo "$body" | grep -qi "$expected"; then
    PASS=$((PASS + 1))
    green "  ✓ ${label}"
  else
    FAIL=$((FAIL + 1))
    red "  ✗ ${label} — body does not contain '${expected}'"
    echo "    Body: $(echo "$body" | head -c 200)"
  fi
}

# ── 1. Health checks ────────────────────────────────────────────────────────

bold ""
bold "═══ 1. Health checks ═══"

status=$(curl -s -o /dev/null -w "%{http_code}" "${USER_URL}/health")
assert_status "User Service /health" 200 "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" "${EVENT_URL}/health")
assert_status "Event Service /health" 200 "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" "${REG_URL}/")
assert_status "Registration Service /" 200 "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" "${NOTIF_URL}/health")
assert_status "Notification Service /health" 200 "$status"

# ── 2. User registration & login ────────────────────────────────────────────

bold ""
bold "═══ 2. User registration & login ═══"

# Register a test user
REGISTER_BODY=$(curl -s -w "\n%{http_code}" -X POST "${USER_URL}/users/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"testuser_'$$'@example.com","password":"test123456","role":"user"}')
REGISTER_STATUS=$(echo "$REGISTER_BODY" | tail -1)
REGISTER_BODY=$(echo "$REGISTER_BODY" | sed '$d')
assert_status "Register user" 201 "$REGISTER_STATUS"
assert_contains "Register response has user" "user" "$REGISTER_BODY"

TEST_USER_ID=$(echo "$REGISTER_BODY" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')

# Login as seeded organizer
LOGIN_BODY=$(curl -s -w "\n%{http_code}" -X POST "${USER_URL}/users/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"beso.organizer@example.com","password":"123456"}')
LOGIN_STATUS=$(echo "$LOGIN_BODY" | tail -1)
LOGIN_BODY=$(echo "$LOGIN_BODY" | sed '$d')
assert_status "Login organizer" 200 "$LOGIN_STATUS"
assert_contains "Login response has organizer role" "organizer" "$LOGIN_BODY"

ORGANIZER_ID=$(echo "$LOGIN_BODY" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
echo "    Organizer ID: ${ORGANIZER_ID}"

# Login as seeded user
LOGIN_USER_BODY=$(curl -s -w "\n%{http_code}" -X POST "${USER_URL}/users/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"sasa@example.com","password":"123456"}')
LOGIN_USER_STATUS=$(echo "$LOGIN_USER_BODY" | tail -1)
LOGIN_USER_BODY=$(echo "$LOGIN_USER_BODY" | sed '$d')
assert_status "Login user" 200 "$LOGIN_USER_STATUS"
assert_contains "Login response has user role" '"role":"user"' "$LOGIN_USER_BODY"

USER_ID=$(echo "$LOGIN_USER_BODY" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
echo "    User ID: ${USER_ID}"

# ── 3. Event creation (organizer) ───────────────────────────────────────────

bold ""
bold "═══ 3. Event creation ═══"

# Create event as organizer
CREATE_BODY=$(curl -s -w "\n%{http_code}" -X POST "${EVENT_URL}/events" \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Integration Test Event",
    "description":"Created by integration test",
    "date":"2026-12-25",
    "startTime":"10:00",
    "endTime":"12:00",
    "location":"Test Room",
    "capacity":5,
    "category":"Testing",
    "organizerId":'"${ORGANIZER_ID}"'
  }')
CREATE_STATUS=$(echo "$CREATE_BODY" | tail -1)
CREATE_BODY=$(echo "$CREATE_BODY" | sed '$d')
assert_status "Create event" 201 "$CREATE_STATUS"
assert_contains "Create response has event" "event" "$CREATE_BODY"

EVENT_ID=$(echo "$CREATE_BODY" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
echo "    Created event ID: ${EVENT_ID}"

# Verify event appears in list
LIST_BODY=$(curl -s "${EVENT_URL}/events")
assert_contains "Event appears in list" "Integration Test Event" "$LIST_BODY"

# Get event by ID
GET_BODY=$(curl -s -w "\n%{http_code}" "${EVENT_URL}/events/${EVENT_ID}")
GET_STATUS=$(echo "$GET_BODY" | tail -1)
GET_BODY=$(echo "$GET_BODY" | sed '$d')
assert_status "Get event by ID" 200 "$GET_STATUS"
assert_contains "Get response has event wrapper" '"event"' "$GET_BODY"

# Non-organizer cannot create event
NOAUTH_BODY=$(curl -s -w "\n%{http_code}" -X POST "${EVENT_URL}/events" \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Unauthorized Event",
    "description":"Should fail",
    "date":"2026-12-25",
    "startTime":"10:00",
    "endTime":"12:00",
    "location":"Test Room",
    "capacity":10,
    "organizerId":'"${USER_ID}"'
  }')
NOAUTH_STATUS=$(echo "$NOAUTH_BODY" | tail -1)
assert_status "Non-organizer cannot create event" 403 "$NOAUTH_STATUS"

# ── 4. Event booking (user) ─────────────────────────────────────────────────

bold ""
bold "═══ 4. Event booking ═══"

# Book event as user (using test user to avoid pre-existing registrations)
BOOK_BODY=$(curl -s -w "\n%{http_code}" -X POST "${REG_URL}/registrations" \
  -H "Content-Type: application/json" \
  -d '{
    "userId":'"${TEST_USER_ID}"',
    "eventId":'"${EVENT_ID}"',
    "paymentMethod":"card",
    "amount":50
  }')
BOOK_STATUS=$(echo "$BOOK_BODY" | tail -1)
BOOK_BODY=$(echo "$BOOK_BODY" | sed '$d')
assert_status "Book event" 201 "$BOOK_STATUS"
assert_contains "Booking response has registration" "registration" "$BOOK_BODY"

REGISTRATION_ID=$(echo "$BOOK_BODY" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
echo "    Registration ID: ${REGISTRATION_ID}"

# Verify available seats decreased
GET_AFTER_BOOK=$(curl -s "${EVENT_URL}/events/${EVENT_ID}")
assert_contains "Available seats decreased" '"availableSeats":4' "$GET_AFTER_BOOK"

# Duplicate booking should fail
DUP_BODY=$(curl -s -w "\n%{http_code}" -X POST "${REG_URL}/registrations" \
  -H "Content-Type: application/json" \
  -d '{
    "userId":'"${TEST_USER_ID}"',
    "eventId":'"${EVENT_ID}"',
    "paymentMethod":"card",
    "amount":50
  }')
DUP_STATUS=$(echo "$DUP_BODY" | tail -1)
assert_status "Duplicate booking rejected" 409 "$DUP_STATUS"

# Organizer cannot book
ORG_BOOK_BODY=$(curl -s -w "\n%{http_code}" -X POST "${REG_URL}/registrations" \
  -H "Content-Type: application/json" \
  -d '{
    "userId":'"${ORGANIZER_ID}"',
    "eventId":'"${EVENT_ID}"',
    "paymentMethod":"card",
    "amount":50
  }')
ORG_BOOK_STATUS=$(echo "$ORG_BOOK_BODY" | tail -1)
assert_status "Organizer cannot book" 403 "$ORG_BOOK_STATUS"

# ── 5. Event cancellation ───────────────────────────────────────────────────

bold ""
bold "═══ 5. Event cancel & delete ═══"

# Create another event for cancellation test
CANCEL_CREATE=$(curl -s -w "\n%{http_code}" -X POST "${EVENT_URL}/events" \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Cancel Test Event",
    "description":"Will be cancelled",
    "date":"2026-12-26",
    "startTime":"14:00",
    "endTime":"16:00",
    "location":"Cancel Room",
    "capacity":10,
    "organizerId":'"${ORGANIZER_ID}"'
  }')
CANCEL_CREATE_STATUS=$(echo "$CANCEL_CREATE" | tail -1)
CANCEL_CREATE=$(echo "$CANCEL_CREATE" | sed '$d')
CANCEL_EVENT_ID=$(echo "$CANCEL_CREATE" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
assert_status "Create event for cancellation" 201 "$CANCEL_CREATE_STATUS"

# Cancel event
CANCEL_BODY=$(curl -s -w "\n%{http_code}" -X PATCH "${EVENT_URL}/events/${CANCEL_EVENT_ID}/cancel" \
  -H "Content-Type: application/json" \
  -d '{"organizerId":'"${ORGANIZER_ID}"'}')
CANCEL_STATUS=$(echo "$CANCEL_BODY" | tail -1)
CANCEL_BODY=$(echo "$CANCEL_BODY" | sed '$d')
assert_status "Cancel event" 200 "$CANCEL_STATUS"
assert_contains "Cancel response shows cancelled status" "cancelled" "$CANCEL_BODY"

# Booking cancelled event should fail
CANCEL_BOOK=$(curl -s -w "\n%{http_code}" -X POST "${REG_URL}/registrations" \
  -H "Content-Type: application/json" \
  -d '{
    "userId":'"${TEST_USER_ID}"',
    "eventId":'"${CANCEL_EVENT_ID}"',
    "paymentMethod":"card",
    "amount":50
  }')
CANCEL_BOOK_STATUS=$(echo "$CANCEL_BOOK" | tail -1)
assert_status "Cannot book cancelled event" 400 "$CANCEL_BOOK_STATUS"

# Create event for deletion test
DELETE_CREATE=$(curl -s -w "\n%{http_code}" -X POST "${EVENT_URL}/events" \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Delete Test Event",
    "description":"Will be deleted",
    "date":"2026-12-27",
    "startTime":"09:00",
    "endTime":"11:00",
    "location":"Delete Room",
    "capacity":10,
    "organizerId":'"${ORGANIZER_ID}"'
  }')
DELETE_CREATE_STATUS=$(echo "$DELETE_CREATE" | tail -1)
DELETE_CREATE=$(echo "$DELETE_CREATE" | sed '$d')
DELETE_EVENT_ID=$(echo "$DELETE_CREATE" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
assert_status "Create event for deletion" 201 "$DELETE_CREATE_STATUS"

# Delete event
DELETE_BODY=$(curl -s -w "\n%{http_code}" -X DELETE \
  "${EVENT_URL}/events/${DELETE_EVENT_ID}?organizerId=${ORGANIZER_ID}" \
  -H "Content-Type: application/json" \
  -d '{"organizerId":'"${ORGANIZER_ID}"'}')
DELETE_STATUS=$(echo "$DELETE_BODY" | tail -1)
DELETE_BODY=$(echo "$DELETE_BODY" | sed '$d')
assert_status "Delete event" 200 "$DELETE_STATUS"
assert_contains "Delete response confirms deletion" "deleted" "$DELETE_BODY"

# Verify deleted event is gone
GONE_BODY=$(curl -s -w "\n%{http_code}" "${EVENT_URL}/events/${DELETE_EVENT_ID}")
GONE_STATUS=$(echo "$GONE_BODY" | tail -1)
assert_status "Deleted event returns 404" 404 "$GONE_STATUS"

# ── 6. Overbooking prevention ───────────────────────────────────────────────

bold ""
bold "═══ 6. Overbooking prevention ═══"

# Create event with capacity 1
SMALL_CREATE=$(curl -s -w "\n%{http_code}" -X POST "${EVENT_URL}/events" \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Tiny Event",
    "description":"Only 1 seat",
    "date":"2026-12-28",
    "startTime":"10:00",
    "endTime":"11:00",
    "location":"Small Room",
    "capacity":1,
    "organizerId":'"${ORGANIZER_ID}"'
  }')
SMALL_CREATE_STATUS=$(echo "$SMALL_CREATE" | tail -1)
SMALL_CREATE=$(echo "$SMALL_CREATE" | sed '$d')
SMALL_EVENT_ID=$(echo "$SMALL_CREATE" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
assert_status "Create event with capacity 1" 201 "$SMALL_CREATE_STATUS"

# Book the only seat
FIRST_BOOK=$(curl -s -w "\n%{http_code}" -X POST "${REG_URL}/registrations" \
  -H "Content-Type: application/json" \
  -d '{
    "userId":'"${TEST_USER_ID}"',
    "eventId":'"${SMALL_EVENT_ID}"',
    "paymentMethod":"card",
    "amount":25
  }')
FIRST_BOOK_STATUS=$(echo "$FIRST_BOOK" | tail -1)
assert_status "Book only seat" 201 "$FIRST_BOOK_STATUS"

# Register another user for overbooking test
OVERBOOK_REG=$(curl -s -X POST "${USER_URL}/users/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"Overbook Test","email":"overbook_'$$'@example.com","password":"test123456","role":"user"}')
OVERBOOK_USER_ID=$(echo "$OVERBOOK_REG" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')

# Try to book when full
OVERBOOK=$(curl -s -w "\n%{http_code}" -X POST "${REG_URL}/registrations" \
  -H "Content-Type: application/json" \
  -d '{
    "userId":'"${OVERBOOK_USER_ID}"',
    "eventId":'"${SMALL_EVENT_ID}"',
    "paymentMethod":"card",
    "amount":25
  }')
OVERBOOK_STATUS=$(echo "$OVERBOOK" | tail -1)
assert_status "Overbooking prevented" 400 "$OVERBOOK_STATUS"

# ── 7. Notifications ────────────────────────────────────────────────────────

bold ""
bold "═══ 7. Notifications ═══"

# Get notifications for a user
NOTIF_BODY=$(curl -s -w "\n%{http_code}" "${NOTIF_URL}/notifications/user/${USER_ID}")
NOTIF_STATUS=$(echo "$NOTIF_BODY" | tail -1)
assert_status "Get user notifications" 200 "$NOTIF_STATUS"

# ── Summary ──────────────────────────────────────────────────────────────────

bold ""
bold "════════════════════════════════════════════════"
echo "  Total: ${TOTAL}  |  $(green "Pass: ${PASS}")  |  $(red "Fail: ${FAIL}")"
bold "════════════════════════════════════════════════"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
