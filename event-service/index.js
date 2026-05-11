require("dotenv").config();

const express = require("express");
const cors = require("cors");
const amqp = require("amqplib");

const PORT = process.env.PORT;
const DATABASE_URL = process.env.DATABASE_URL;
const RABBITMQ_URL = process.env.RABBITMQ_URL;
const USER_SERVICE_URL = process.env.USER_SERVICE_URL;
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;
const axios = require("axios");
const { pool, connectDB } = require("./config/db");

if (!PORT || !DATABASE_URL || !RABBITMQ_URL || !USER_SERVICE_URL || !INTERNAL_SERVICE_TOKEN) {
  console.error("Missing required environment variables:");
  console.error({
    PORT: Boolean(PORT),
    DATABASE_URL: Boolean(DATABASE_URL),
    RABBITMQ_URL: Boolean(RABBITMQ_URL),
    USER_SERVICE_URL: Boolean(USER_SERVICE_URL),
    INTERNAL_SERVICE_TOKEN: Boolean(INTERNAL_SERVICE_TOKEN),
  });
  process.exit(1);
}

async function getUserRole(userId) {
  if (!userId) return null;
  try {
    const response = await axios.get(`${USER_SERVICE_URL}/users/${userId}`);
    const user = response.data.user || response.data.data || response.data;
    return user?.role;
  } catch (error) {
    console.error("Error fetching user role:", error.message);
    return null;
  }
}

function isInternalServiceRequest(req) {
  return (
    INTERNAL_SERVICE_TOKEN &&
    req.get("x-internal-service-token") === INTERNAL_SERVICE_TOKEN
  );
}

function getRequestedOrganizerId(req) {
  return (
    req.body?.organizerId ||
    req.query?.organizerId ||
    req.get("x-organizer-id")
  );
}

async function authorizeOrganizer(organizerId) {
  const organizerIdNumber = Number(organizerId);

  if (!Number.isInteger(organizerIdNumber) || organizerIdNumber < 1) {
    return {
      allowed: false,
      status: 400,
      message: "organizerId is required and must be a valid positive number",
    };
  }

  const role = await getUserRole(organizerIdNumber);

  if (role !== "organizer") {
    return {
      allowed: false,
      status: 403,
      message: "Only organizers can manage events",
      role: role || "unknown",
    };
  }

  return { allowed: true, organizerId: organizerIdNumber };
}

async function authorizeEventOwner(req, event, options = {}) {
  if (options.allowInternal && isInternalServiceRequest(req)) {
    return { allowed: true, internal: true };
  }

  const authorization = await authorizeOrganizer(getRequestedOrganizerId(req));

  if (!authorization.allowed) {
    return authorization;
  }

  if (Number(event.organizer_id) !== Number(authorization.organizerId)) {
    return {
      allowed: false,
      status: 403,
      message: "Organizers can only manage their own events",
    };
  }

  return authorization;
}

const app = express();

app.use(cors());
app.use(express.json());

const RABBITMQ_RETRY_MS = Number(process.env.RABBITMQ_RETRY_MS || 5000);

let rabbitChannel = null;

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`
    );
  });

  next();
});

// Create events table if it does not exist
async function createEventsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      event_date DATE NOT NULL,
      start_time VARCHAR(20) NOT NULL,
      end_time VARCHAR(20) NOT NULL,
      location VARCHAR(255) NOT NULL,
      capacity INTEGER NOT NULL CHECK (capacity > 0),
      booked_seats INTEGER DEFAULT 0,
      available_seats INTEGER NOT NULL,
      category VARCHAR(100) DEFAULT 'General',
      organizer_id INTEGER,
      status VARCHAR(20) DEFAULT 'upcoming',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP
    );
  `);

  console.log("Events table is ready");
}

// RabbitMQ connection
async function connectRabbitMQ() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    rabbitChannel = await connection.createChannel();

    await rabbitChannel.assertExchange("events_exchange", "fanout", {
      durable: true,
    });

    connection.on("close", () => {
      rabbitChannel = null;
      console.log("RabbitMQ connection closed. Reconnecting...");
      setTimeout(connectRabbitMQ, RABBITMQ_RETRY_MS);
    });

    console.log("Connected to RabbitMQ");
  } catch (error) {
    console.log("RabbitMQ not connected:", error.message);
    console.log(`Retrying RabbitMQ in ${RABBITMQ_RETRY_MS / 1000} seconds.`);
    setTimeout(connectRabbitMQ, RABBITMQ_RETRY_MS);
  }
}

// Publish async event
function publishEvent(eventType, data) {
  if (!rabbitChannel) {
    console.log("RabbitMQ channel not available. Event not published.");
    return;
  }

  const message = {
    eventType,
    data,
    createdAt: new Date(),
  };

  rabbitChannel.publish(
    "events_exchange",
    "",
    Buffer.from(JSON.stringify(message)),
    { persistent: true }
  );

  console.log(`Published event: ${eventType}`);
}

function isValidDate(date) {
  return !isNaN(Date.parse(date));
}

function getValidId(value, fieldName) {
  const id = Number(value);

  if (!Number.isInteger(id) || id < 1) {
    return {
      error: {
        message: `${fieldName} must be a valid positive number`,
      },
    };
  }

  return { id };
}

function formatEvent(row) {
  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    date: row.event_date,
    startTime: row.start_time,
    endTime: row.end_time,
    location: row.location,
    capacity: row.capacity,
    bookedSeats: row.booked_seats,
    availableSeats: row.available_seats,
    category: row.category,
    organizerId: row.organizer_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "event-service",
  });
});

app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*) FROM events");

    res.json({
      service: "Event Service",
      status: "Running",
      port: Number(PORT),
      database: "PostgreSQL connected",
      totalEvents: Number(result.rows[0].count),
    });
  } catch (error) {
    res.status(500).json({
      service: "Event Service",
      status: "Running",
      database: "PostgreSQL disconnected",
      error: error.message,
    });
  }
});

// Db connection test
app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      message: "Database connection successful",
      time: result.rows[0].now,
    });
  } catch (error) {
    res.status(500).json({
      message: "Database connection failed",
      error: error.message,
    });
  }
});

// Create event
app.post("/events", async (req, res) => {
  try {
    const {
      title,
      description,
      date,
      startTime,
      endTime,
      location,
      capacity,
      category,
      organizerId,
    } = req.body;

    if (
      !title ||
      !description ||
      !date ||
      !startTime ||
      !endTime ||
      !location ||
      !capacity
    ) {
      return res.status(400).json({
        message:
          "title, description, date, startTime, endTime, location, and capacity are required",
      });
    }

    if (!isValidDate(date)) {
      return res.status(400).json({
        message: "Invalid date format",
      });
    }

    const capacityNumber = Number(capacity);

    if (Number.isNaN(capacityNumber) || capacityNumber <= 0) {
      return res.status(400).json({
        message: "capacity must be a valid number greater than 0",
      });
    }

    const authorization = await authorizeOrganizer(organizerId);

    if (!authorization.allowed) {
      return res.status(authorization.status).json({
        message: authorization.message,
        role: authorization.role,
      });
    }

    const result = await pool.query(
      `
      INSERT INTO events
      (
        title,
        description,
        event_date,
        start_time,
        end_time,
        location,
        capacity,
        booked_seats,
        available_seats,
        category,
        organizer_id,
        status
      )
      VALUES
      ($1, $2, $3, $4, $5, $6, $7, 0, $7, $8, $9, 'upcoming')
      RETURNING *
      `,
      [
        title,
        description,
        date,
        startTime,
        endTime,
        location,
        capacityNumber,
        category || "General",
        authorization.organizerId,
      ]
    );

    const event = formatEvent(result.rows[0]);

    publishEvent("event.created", event);

    res.status(201).json({
      message: "Event created successfully",
      event,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to create event",
      error: error.message,
    });
  }
});

// Get all events with filters
app.get("/events", async (req, res) => {
  try {
    const { status, category, location, search } = req.query;

    let query = "SELECT * FROM events WHERE 1=1";
    const values = [];

    if (status) {
      values.push(status);
      query += ` AND status = $${values.length}`;
    }

    if (category) {
      values.push(category);
      query += ` AND category = $${values.length}`;
    }

    if (location) {
      values.push(`%${location}%`);
      query += ` AND location ILIKE $${values.length}`;
    }

    if (search) {
      values.push(`%${search}%`);
      query += ` AND (title ILIKE $${values.length} OR description ILIKE $${values.length})`;
    }

    query += " ORDER BY created_at DESC";

    const result = await pool.query(query, values);
    const events = result.rows.map(formatEvent);

    res.json({
      count: events.length,
      events,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to get events",
      error: error.message,
    });
  }
});

// Get event by ID
app.get("/events/:id", async (req, res) => {
  const { id, error } = getValidId(req.params.id, "event id");

  if (error) {
    return res.status(400).json(error);
  }

  try {
    const result = await pool.query("SELECT * FROM events WHERE id = $1", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    const event = formatEvent(result.rows[0]);
    res.json({ event });
  } catch (error) {
    res.status(400).json({
      message: "Invalid event ID",
      error: error.message,
    });
  }
});

// Update event
app.put("/events/:id", async (req, res) => {
  const { id, error } = getValidId(req.params.id, "event id");

  if (error) {
    return res.status(400).json(error);
  }

  try {
    const existingResult = await pool.query(
      "SELECT * FROM events WHERE id = $1",
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    const existingEvent = existingResult.rows[0];

    const {
      title,
      description,
      date,
      startTime,
      endTime,
      location,
      capacity,
      category,
      status,
      organizerId,
    } = req.body;

    const authorization = await authorizeEventOwner(req, existingEvent);

    if (!authorization.allowed) {
      return res.status(authorization.status).json({
        message: authorization.message,
        role: authorization.role,
      });
    }

    if (date && !isValidDate(date)) {
      return res.status(400).json({
        message: "Invalid date format",
      });
    }

    const newCapacity = capacity ? Number(capacity) : existingEvent.capacity;

    if (capacity && Number.isNaN(newCapacity)) {
      return res.status(400).json({
        message: "capacity must be a valid number",
      });
    }

    if (capacity && newCapacity < existingEvent.booked_seats) {
      return res.status(400).json({
        message: "capacity cannot be less than booked seats",
      });
    }

    const allowedStatuses = ["upcoming", "cancelled", "completed"];

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "status must be upcoming, cancelled, or completed",
      });
    }

    const newAvailableSeats = capacity
      ? newCapacity - existingEvent.booked_seats
      : existingEvent.available_seats;

    const result = await pool.query(
      `
      UPDATE events
      SET
        title = $1,
        description = $2,
        event_date = $3,
        start_time = $4,
        end_time = $5,
        location = $6,
        capacity = $7,
        available_seats = $8,
        category = $9,
        status = $10,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $11
      RETURNING *
      `,
      [
        title || existingEvent.title,
        description || existingEvent.description,
        date || existingEvent.event_date,
        startTime || existingEvent.start_time,
        endTime || existingEvent.end_time,
        location || existingEvent.location,
        newCapacity,
        newAvailableSeats,
        category || existingEvent.category,
        status || existingEvent.status,
        id,
      ]
    );

    const event = formatEvent(result.rows[0]);

    publishEvent("event.updated", event);

    res.json({
      message: "Event updated successfully",
      event,
    });
  } catch (error) {
    res.status(400).json({
      message: "Failed to update event",
      error: error.message,
    });
  }
});

// Delete event
app.delete("/events/:id", async (req, res) => {
  const { id, error } = getValidId(req.params.id, "event id");

  if (error) {
    return res.status(400).json(error);
  }

  try {
    const existingResult = await pool.query(
      "SELECT * FROM events WHERE id = $1",
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    const authorization = await authorizeEventOwner(req, existingResult.rows[0]);

    if (!authorization.allowed) {
      return res.status(authorization.status).json({
        message: authorization.message,
        role: authorization.role,
      });
    }

    const result = await pool.query(
      "DELETE FROM events WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    publishEvent("event.deleted", { id });

    res.json({
      message: "Event deleted successfully",
    });
  } catch (error) {
    res.status(400).json({
      message: "Failed to delete event",
      error: error.message,
    });
  }
});

// Cancel event
app.patch("/events/:id/cancel", async (req, res) => {
  const { id, error } = getValidId(req.params.id, "event id");

  if (error) {
    return res.status(400).json(error);
  }

  try {
    const existingResult = await pool.query(
      "SELECT * FROM events WHERE id = $1",
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    const authorization = await authorizeEventOwner(req, existingResult.rows[0]);

    if (!authorization.allowed) {
      return res.status(authorization.status).json({
        message: authorization.message,
        role: authorization.role,
      });
    }

    const result = await pool.query(
      `
      UPDATE events
      SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    const event = formatEvent(result.rows[0]);

    publishEvent("event.cancelled", event);

    res.json({
      message: "Event cancelled successfully",
      event,
    });
  } catch (error) {
    res.status(400).json({
      message: "Failed to cancel event",
      error: error.message,
    });
  }
});

// Reserve seat
// Internal service requests (from registration-service) are allowed without owner check.
// Organizer requests require owner verification.
app.patch("/events/:id/reserve-seat", async (req, res) => {
  const { id, error } = getValidId(req.params.id, "event id");

  if (error) {
    return res.status(400).json(error);
  }

  try {
    const result = await pool.query("SELECT * FROM events WHERE id = $1", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    const event = result.rows[0];

    // Internal service requests are authorized by token alone (no owner check).
    if (!isInternalServiceRequest(req)) {
      const authorization = await authorizeEventOwner(req, event);

      if (!authorization.allowed) {
        return res.status(authorization.status).json({
          message: authorization.message,
          role: authorization.role,
        });
      }
    }

    if (event.status !== "upcoming") {
      return res.status(400).json({
        message: "Cannot reserve seat for non-upcoming event",
        status: event.status,
      });
    }

    if (event.available_seats <= 0) {
      return res.status(400).json({
        message: "Event is fully booked",
        availableSeats: 0,
      });
    }

    const updateResult = await pool.query(
      `
      UPDATE events
      SET
        booked_seats = booked_seats + 1,
        available_seats = available_seats - 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND available_seats > 0
      RETURNING *
      `,
      [id]
    );

    if (updateResult.rows.length === 0) {
      return res.status(400).json({
        message: "Event is fully booked (race condition prevented)",
        availableSeats: 0,
      });
    }

    const updatedEvent = formatEvent(updateResult.rows[0]);

    publishEvent("event.seat_reserved", updatedEvent);

    res.json({
      message: "Seat reserved successfully",
      event: updatedEvent,
    });
  } catch (error) {
    res.status(400).json({
      message: "Failed to reserve seat",
      error: error.message,
    });
  }
});

// Release seat
// Internal service requests (from registration-service) are allowed without owner check.
app.patch("/events/:id/release-seat", async (req, res) => {
  const { id, error } = getValidId(req.params.id, "event id");

  if (error) {
    return res.status(400).json(error);
  }

  try {
    const result = await pool.query("SELECT * FROM events WHERE id = $1", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    const event = result.rows[0];

    // Internal service requests are authorized by token alone (no owner check).
    if (!isInternalServiceRequest(req)) {
      const authorization = await authorizeEventOwner(req, event);

      if (!authorization.allowed) {
        return res.status(authorization.status).json({
          message: authorization.message,
          role: authorization.role,
        });
      }
    }

    if (event.booked_seats <= 0) {
      return res.status(400).json({
        message: "No booked seats to release",
      });
    }

    const updateResult = await pool.query(
      `
      UPDATE events
      SET
        booked_seats = booked_seats - 1,
        available_seats = available_seats + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    const updatedEvent = formatEvent(updateResult.rows[0]);

    publishEvent("event.seat_released", updatedEvent);

    res.json({
      message: "Seat released successfully",
      event: updatedEvent,
    });
  } catch (error) {
    res.status(400).json({
      message: "Failed to release seat",
      error: error.message,
    });
  }
});

// Metrics endpoint
app.get("/metrics", async (req, res) => {
  try {
    const totalEvents = await pool.query("SELECT COUNT(*) FROM events");
    const upcomingEvents = await pool.query(
      "SELECT COUNT(*) FROM events WHERE status = 'upcoming'"
    );
    const cancelledEvents = await pool.query(
      "SELECT COUNT(*) FROM events WHERE status = 'cancelled'"
    );
    const completedEvents = await pool.query(
      "SELECT COUNT(*) FROM events WHERE status = 'completed'"
    );

    res.type("text/plain");
    res.send(`
event_service_up 1
event_total ${totalEvents.rows[0].count}
event_upcoming_total ${upcomingEvents.rows[0].count}
event_cancelled_total ${cancelledEvents.rows[0].count}
event_completed_total ${completedEvents.rows[0].count}
`);
  } catch (error) {
    res.status(500).send(`event_service_up 0
event_service_error "${error.message}"
`);
  }
});

app.listen(PORT, async () => {
  await connectDB();
  await createEventsTable();
  await connectRabbitMQ();
  console.log(`Event Service running on port ${PORT}`);
});
