const express = require("express");
const cors = require("cors");
const amqp = require("amqplib");
const { pool, connectDB } = require("./config/db");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3002;
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";

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
      durable: false,
    });

    console.log("Connected to RabbitMQ");
  } catch (error) {
    console.log("RabbitMQ not connected:", error.message);
    console.log("Service will continue without async messaging.");
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
    Buffer.from(JSON.stringify(message))
  );

  console.log(`Published event: ${eventType}`);
}

function isValidDate(date) {
  return !isNaN(Date.parse(date));
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
app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*) FROM events");

    res.json({
      service: "Event Service",
      status: "Running",
      port: PORT,
      database: "PostgreSQL connected",
      totalEvents: Number(result.rows[0].count),
    });
  } catch (error) {
    res.status(500).json({
      message: "Health check failed",
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

    if (Number(capacity) <= 0) {
      return res.status(400).json({
        message: "capacity must be greater than 0",
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
        Number(capacity),
        category || "General",
        organizerId || null,
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
  try {
    const result = await pool.query("SELECT * FROM events WHERE id = $1", [
      req.params.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    res.json(formatEvent(result.rows[0]));
  } catch (error) {
    res.status(400).json({
      message: "Invalid event ID",
      error: error.message,
    });
  }
});

// Update event
app.put("/events/:id", async (req, res) => {
  try {
    const existingResult = await pool.query(
      "SELECT * FROM events WHERE id = $1",
      [req.params.id]
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
    } = req.body;

    if (date && !isValidDate(date)) {
      return res.status(400).json({
        message: "Invalid date format",
      });
    }

    if (capacity && Number(capacity) < existingEvent.booked_seats) {
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

    const newCapacity = capacity ? Number(capacity) : existingEvent.capacity;
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
        req.params.id,
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
  try {
    const result = await pool.query(
      "DELETE FROM events WHERE id = $1 RETURNING *",
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    publishEvent("event.deleted", { id: req.params.id });

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
  try {
    const result = await pool.query(
      `
      UPDATE events
      SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
      `,
      [req.params.id]
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
app.patch("/events/:id/reserve-seat", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM events WHERE id = $1", [
      req.params.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    const event = result.rows[0];

    if (event.status !== "upcoming") {
      return res.status(400).json({
        message: "Cannot reserve seat for non-upcoming event",
      });
    }

    if (event.available_seats <= 0) {
      return res.status(400).json({
        message: "Event is fully booked",
      });
    }

    const updateResult = await pool.query(
      `
      UPDATE events
      SET
        booked_seats = booked_seats + 1,
        available_seats = available_seats - 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
      `,
      [req.params.id]
    );

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
app.patch("/events/:id/release-seat", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM events WHERE id = $1", [
      req.params.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    const event = result.rows[0];

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
      [req.params.id]
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
