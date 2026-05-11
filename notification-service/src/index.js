const express = require("express");
const cors = require("cors");
const amqp = require("amqplib");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT;
const DATABASE_URL = process.env.DATABASE_URL;
const RABBITMQ_URL = process.env.RABBITMQ_URL;
const USER_SERVICE_URL = process.env.USER_SERVICE_URL;

if (!PORT || !DATABASE_URL || !RABBITMQ_URL || !USER_SERVICE_URL) {
  console.error("Missing required environment variables:");
  console.error({
    PORT: Boolean(PORT),
    DATABASE_URL: Boolean(DATABASE_URL),
    RABBITMQ_URL: Boolean(RABBITMQ_URL),
    USER_SERVICE_URL: Boolean(USER_SERVICE_URL),
  });
  process.exit(1);
}

const RABBITMQ_RETRY_MS = Number(process.env.RABBITMQ_RETRY_MS || 5000);
const EVENT_QUEUE = "event_notifications";

// PostgreSQL connection
const pool = new Pool({
  connectionString: DATABASE_URL,
});

// Health check
app.get("/health", (req, res) => {
  res.send("Notification service is running");
});

app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*) FROM notifications");

    res.json({
      service: "Notification Service",
      status: "Running",
      port: Number(PORT),
      database: "PostgreSQL connected",
      totalNotifications: Number(result.rows[0].count),
    });
  } catch (error) {
    res.status(500).json({
      service: "Notification Service",
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

// Database health check
app.get("/health/db", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      service: "notification-service",
      database: "connected",
    });
  } catch (error) {
    res.status(500).json({
      service: "notification-service",
      database: "not connected",
      error: error.message,
    });
  }
});

// Metrics endpoint for monitoring bonus
app.get("/metrics", async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*) FROM notifications");

    res.type("text/plain");
    res.send(`notification_service_up 1
notifications_total ${result.rows[0].count}
`);
  } catch (error) {
    res.status(500);
    res.type("text/plain");
    res.send(`notification_service_up 0
notification_service_error "${error.message}"
`);
  }
});

// Helper function to create notification in database
async function createNotification({ userId, eventId, type, message }) {
  const userIdNumber = Number(userId);
  const eventIdNumber =
    eventId === undefined || eventId === null || eventId === ""
      ? null
      : Number(eventId);

  const result = await pool.query(
    `INSERT INTO notifications (user_id, event_id, type, message, status)
     VALUES ($1, $2, $3, $4, 'unread')
     RETURNING *`,
    [userIdNumber, eventIdNumber, type, message]
  );

  const row = result.rows[0];

  return {
    id: row.id,
    userId: row.user_id,
    eventId: row.event_id,
    type: row.type,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
  };
}

function getAsyncNotification(eventType, data = {}) {
  const eventId = data.id || null;
  const title = data.title ? `"${data.title}"` : `event ${eventId || ""}`.trim();
  const userId = data.organizerId || 1;

  const messages = {
    "event.created": `${title} was created.`,
    "event.updated": `${title} was updated. Please check the latest details.`,
    "event.cancelled": `${title} has been cancelled. Your booking is affected.`,
    "event.deleted": `Event ${eventId || ""} was deleted. Your booking is no longer valid.`.trim(),
    "event.seat_reserved": `A seat was reserved for ${title}.`,
    "event.seat_released": `A seat was released for ${title}.`,
  };

  return {
    userId,
    eventId,
    type: eventType,
    message: messages[eventType] || `Event update received: ${eventType}`,
  };
}

// Query all registered users for a specific event
async function getRegisteredUserIds(eventId) {
  try {
    const result = await pool.query(
      `SELECT DISTINCT user_id FROM registrations
       WHERE event_id = $1 AND status = 'confirmed'`,
      [eventId]
    );

    return result.rows.map((row) => row.user_id);
  } catch (error) {
    console.error(`Failed to query registrations for event ${eventId}:`, error.message);
    return [];
  }
}

// Events that should notify all registered users (not just the organizer)
const BROADCAST_EVENT_TYPES = new Set([
  "event.updated",
  "event.cancelled",
  "event.deleted",
]);

async function handleEventMessage(message) {
  const payload = JSON.parse(message.content.toString());

  // If the message already has a userId (e.g. booking confirmation),
  // create a single notification for that user.
  if (payload.userId) {
    const notification = {
      userId: payload.userId,
      eventId: payload.eventId || null,
      type: payload.type || "booking.confirmed",
      message:
        payload.message ||
        `User ${payload.userId} booked event ${payload.eventId}`,
    };

    await createNotification(notification);
    console.log(
      `Created async notification for ${notification.type} and user ${notification.userId}`
    );
    return;
  }

  // Build the base notification from the event-service message
  const base = getAsyncNotification(payload.eventType, payload.data);
  const eventId = payload.data?.id || null;

  // For updates, cancellations, deletions — notify ALL registered users
  if (BROADCAST_EVENT_TYPES.has(payload.eventType) && eventId) {
    const userIds = await getRegisteredUserIds(eventId);
    const title = payload.data?.title
      ? `"${payload.data.title}"`
      : `event ${eventId}`;

    const messages = {
      "event.updated": `${title} has been updated. Please review the new details.`,
      "event.cancelled": `${title} has been cancelled. Your registration may be affected.`,
      "event.deleted": `${title} has been removed. Your registration is no longer valid.`,
    };

    const userMessage = messages[payload.eventType] || base.message;

    let created = 0;

    for (const userId of userIds) {
      try {
        await createNotification({
          userId,
          eventId,
          type: payload.eventType,
          message: userMessage,
        });
        created += 1;
      } catch (error) {
        console.error(
          `Failed to notify user ${userId} about ${payload.eventType}:`,
          error.message
        );
      }
    }

    console.log(
      `Broadcast ${payload.eventType} for event ${eventId}: notified ${created}/${userIds.length} registered users`
    );

    // Also notify the organizer (if not already in the list)
    const organizerId = payload.data?.organizerId || 1;
    if (!userIds.includes(organizerId)) {
      await createNotification(base);
      console.log(
        `Created organizer notification for ${base.type} and user ${base.userId}`
      );
    }
  } else {
    // For other events (created, seat_reserved, etc.), just notify the organizer
    await createNotification(base);
    console.log(
      `Created async notification for ${base.type} and user ${base.userId}`
    );
  }
}

async function connectRabbitMQ() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    // Assert the queue for direct messages (from registration-service)
    await channel.assertQueue(EVENT_QUEUE, { durable: true });

    // Bind the queue to the fanout exchange (from event-service)
    // This ensures event updates, cancellations, and deletions reach us.
    await channel.assertExchange("events_exchange", "fanout", { durable: true });
    await channel.bindQueue(EVENT_QUEUE, "events_exchange", "");

    await channel.consume(EVENT_QUEUE, async (message) => {
      if (!message) return;

      try {
        await handleEventMessage(message);
        channel.ack(message);
      } catch (error) {
        console.log("Failed to process async event:", error.message);
        channel.ack(message);
      }
    });

    connection.on("close", () => {
      console.log("RabbitMQ connection closed. Reconnecting...");
      setTimeout(connectRabbitMQ, RABBITMQ_RETRY_MS);
    });

    console.log(`Notification Service connected to RabbitMQ queue ${EVENT_QUEUE}`);
  } catch (error) {
    console.log("RabbitMQ not connected:", error.message);
    console.log(`Retrying RabbitMQ in ${RABBITMQ_RETRY_MS / 1000} seconds.`);
    setTimeout(connectRabbitMQ, RABBITMQ_RETRY_MS);
  }
}

// Validate userId exists
function validateNotificationRequest(req, res) {
  const { userId } = req.body;
  const userIdNumber = Number(userId);

  if (!userId || Number.isNaN(userIdNumber)) {
    res.status(400).json({
      message: "userId must be a valid number",
    });
    return false;
  }

  if (req.body.eventId !== undefined && req.body.eventId !== null) {
    const eventIdNumber = Number(req.body.eventId);

    if (Number.isNaN(eventIdNumber)) {
      res.status(400).json({
        message: "eventId must be a valid number",
      });
      return false;
    }
  }

  return true;
}

async function getUserById(userId) {
  const response = await fetch(`${USER_SERVICE_URL}/users/${userId}`);

  if (!response.ok) {
    throw new Error(`User Service returned ${response.status}`);
  }

  const data = await response.json();
  return data.user || data.data || data;
}

async function requireOrganizerRequest(req, res, next) {
  const organizerId = Number(req.body.organizerId || req.query.organizerId);

  if (!Number.isInteger(organizerId) || organizerId < 1) {
    return res.status(400).json({
      message: "organizerId is required and must be a valid positive number",
    });
  }

  try {
    const organizer = await getUserById(organizerId);

    if (organizer.role !== "organizer") {
      return res.status(403).json({
        message: "Only organizers can create notifications",
        role: organizer.role || "unknown",
      });
    }

    req.organizer = organizer;
    return next();
  } catch (error) {
    return res.status(503).json({
      message: "User Service unavailable or organizer does not exist",
      service: "user-service",
      error: error.message,
    });
  }
}

// Create notification manually for testing
app.post("/notifications", requireOrganizerRequest, async (req, res) => {
  if (!validateNotificationRequest(req, res)) return;

  try {
    const notification = await createNotification({
      userId: req.body.userId,
      eventId: req.body.eventId,
      type: req.body.type || "general",
      message: req.body.message || "New notification",
    });

    res.status(201).json(notification);
  } catch (error) {
    res.status(500).json({
      message: "Failed to create notification",
      error: error.message,
    });
  }
});

app.post("/notifications/test", requireOrganizerRequest, async (req, res) => {
  if (!validateNotificationRequest(req, res)) return;

  try {
    const notification = await createNotification({
      userId: req.body.userId,
      eventId: req.body.eventId,
      type: req.body.type || "general",
      message: req.body.message || "New notification",
    });

    res.status(201).json(notification);
  } catch (error) {
    res.status(500).json({
      message: "Failed to create notification",
      error: error.message,
    });
  }
});

// Event update notification
app.post("/notifications/event-update", requireOrganizerRequest, async (req, res) => {
  if (!validateNotificationRequest(req, res)) return;

  if (!req.body.eventId) {
    return res.status(400).json({
      message: "eventId is required for event update notification",
    });
  }

  try {
    const notification = await createNotification({
      userId: req.body.userId,
      eventId: req.body.eventId,
      type: "event.updated",
      message:
        req.body.message ||
        `Event ${req.body.eventId} has been updated. Please check the latest details.`,
    });

    res.status(201).json(notification);
  } catch (error) {
    res.status(500).json({
      message: "Failed to create event update notification",
      error: error.message,
    });
  }
});

// Event reminder notification
app.post("/notifications/reminder", requireOrganizerRequest, async (req, res) => {
  if (!validateNotificationRequest(req, res)) return;

  if (!req.body.eventId) {
    return res.status(400).json({
      message: "eventId is required for event reminder notification",
    });
  }

  try {
    const notification = await createNotification({
      userId: req.body.userId,
      eventId: req.body.eventId,
      type: "event.reminder",
      message:
        req.body.message ||
        `Reminder: Event ${req.body.eventId} is coming soon.`,
    });

    res.status(201).json(notification);
  } catch (error) {
    res.status(500).json({
      message: "Failed to create event reminder notification",
      error: error.message,
    });
  }
});

// Payment notification
app.post("/notifications/payment", requireOrganizerRequest, async (req, res) => {
  if (!validateNotificationRequest(req, res)) return;

  if (!req.body.eventId) {
    return res.status(400).json({
      message: "eventId is required for payment notification",
    });
  }

  const paymentStatus = req.body.paymentStatus || "success";

  try {
    const notification = await createNotification({
      userId: req.body.userId,
      eventId: req.body.eventId,
      type: paymentStatus === "success" ? "payment.success" : "payment.failed",
      message:
        req.body.message ||
        (paymentStatus === "success"
          ? `Payment successful for event ${req.body.eventId}.`
          : `Payment failed for event ${req.body.eventId}. Please try again.`),
    });

    res.status(201).json(notification);
  } catch (error) {
    res.status(500).json({
      message: "Failed to create payment notification",
      error: error.message,
    });
  }
});

// Get notifications for one user
app.get("/notifications/user/:userId", async (req, res) => {
  const userId = Number(req.params.userId);

  if (Number.isNaN(userId)) {
    return res.status(400).json({
      message: "userId must be a valid number",
    });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    const notifications = result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      eventId: row.event_id,
      type: row.type,
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
    }));

    res.json(notifications);
  } catch (error) {
    res.status(500).json({
      message: "Failed to get notifications",
      error: error.message,
    });
  }
});

// Mark notification as read
app.put("/notifications/:id/read", async (req, res) => {
  const id = Number(req.params.id);
  const userId = Number(req.body.userId || req.query.userId);

  if (Number.isNaN(id)) {
    return res.status(400).json({
      message: "notification id must be a valid number",
    });
  }

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({
      message: "userId is required and must be a valid positive number",
    });
  }

  try {
    const existing = await pool.query("SELECT * FROM notifications WHERE id = $1", [
      id,
    ]);

    if (existing.rows.length === 0) {
      return res.status(404).json({
        message: "Notification not found",
      });
    }

    if (userId !== Number(existing.rows[0].user_id)) {
      return res.status(403).json({
        message: "Users can only update their own notifications",
      });
    }

    const result = await pool.query(
      `UPDATE notifications
       SET status = 'read'
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Notification not found",
      });
    }

    const row = result.rows[0];

    res.json({
      message: "Notification marked as read",
      notification: {
        id: row.id,
        userId: row.user_id,
        eventId: row.event_id,
        type: row.type,
        message: row.message,
        status: row.status,
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to mark notification as read",
      error: error.message,
    });
  }
});

app.listen(PORT, () => {
  connectRabbitMQ();
  console.log(`Notification Service running on port ${PORT}`);
});
