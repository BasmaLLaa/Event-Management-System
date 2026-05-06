const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3004;

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Health check
app.get("/health", (req, res) => {
  res.send("Notification service is running");
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
    res.send(`notifications_total ${result.rows[0].count}`);
  } catch (error) {
    res.status(500);
    res.type("text/plain");
    res.send("notifications_metrics_error 1");
  }
});

// Helper function to create notification in database
async function createNotification({ userId, eventId, type, message }) {
  const result = await pool.query(
    `INSERT INTO notifications (user_id, event_id, type, message, status)
     VALUES ($1, $2, $3, $4, 'unread')
     RETURNING *`,
    [userId, eventId || null, type, message]
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

// Validate userId exists
function validateNotificationRequest(req, res) {
  const { userId } = req.body;

  if (!userId) {
    res.status(400).json({
      message: "userId is required",
    });
    return false;
  }

  return true;
}

// Create notification manually for testing
app.post("/notifications/test", async (req, res) => {
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
app.post("/notifications/event-update", async (req, res) => {
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
app.post("/notifications/reminder", async (req, res) => {
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
app.post("/notifications/payment", async (req, res) => {
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

  try {
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
  console.log(`Notification Service running on port ${PORT}`);
});
