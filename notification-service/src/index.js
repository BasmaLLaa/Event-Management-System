const express = require("express");

const app = express();
app.use(express.json());

const PORT = 3004;

let notifications = [];
let notificationCount = 0;

// health check
app.get("/health", (req, res) => {
  res.send("Notification service is running");
});

// metrics for monitoring bonus
app.get("/metrics", (req, res) => {
  res.type("text/plain");
  res.send(`notifications_total ${notificationCount}`);
});

// helper function to create notification
function createNotification({ userId, eventId, type, message }) {
  const notification = {
    id: notifications.length + 1,
    userId: Number(userId),
    eventId: eventId ? Number(eventId) : null,
    type,
    message,
    status: "unread",
    createdAt: new Date()
  };

  notifications.push(notification);
  notificationCount++;

  console.log("New notification:", notification);

  return notification;
}

// helper validation
function validateNotificationRequest(req, res) {
  const { userId } = req.body;

  if (!userId) {
    res.status(400).json({
      message: "userId is required"
    });
    return false;
  }

  return true;
}

// create notification manually for testing
app.post("/notifications/test", (req, res) => {
  if (!validateNotificationRequest(req, res)) return;

  const notification = createNotification({
    userId: req.body.userId,
    eventId: req.body.eventId,
    type: req.body.type || "general",
    message: req.body.message || "New notification"
  });

  res.status(201).json(notification);
});

// event update notification
app.post("/notifications/event-update", (req, res) => {
  if (!validateNotificationRequest(req, res)) return;

  if (!req.body.eventId) {
    return res.status(400).json({
      message: "eventId is required for event update notification"
    });
  }

  const notification = createNotification({
    userId: req.body.userId,
    eventId: req.body.eventId,
    type: "event.updated",
    message:
      req.body.message ||
      `Event ${req.body.eventId} has been updated. Please check the latest details.`
  });

  res.status(201).json(notification);
});

// event reminder notification
app.post("/notifications/reminder", (req, res) => {
  if (!validateNotificationRequest(req, res)) return;

  if (!req.body.eventId) {
    return res.status(400).json({
      message: "eventId is required for event reminder notification"
    });
  }

  const notification = createNotification({
    userId: req.body.userId,
    eventId: req.body.eventId,
    type: "event.reminder",
    message:
      req.body.message ||
      `Reminder: Event ${req.body.eventId} is coming soon.`
  });

  res.status(201).json(notification);
});

// payment notification
app.post("/notifications/payment", (req, res) => {
  if (!validateNotificationRequest(req, res)) return;

  if (!req.body.eventId) {
    return res.status(400).json({
      message: "eventId is required for payment notification"
    });
  }

  const paymentStatus = req.body.paymentStatus || "success";

  const notification = createNotification({
    userId: req.body.userId,
    eventId: req.body.eventId,
    type: paymentStatus === "success" ? "payment.success" : "payment.failed",
    message:
      req.body.message ||
      (paymentStatus === "success"
        ? `Payment successful for event ${req.body.eventId}.`
        : `Payment failed for event ${req.body.eventId}. Please try again.`)
  });

  res.status(201).json(notification);
});

// get notifications for a user
app.get("/notifications/user/:userId", (req, res) => {
  const userId = Number(req.params.userId);

  const result = notifications.filter(
    (notification) => notification.userId === userId
  );

  res.json(result);
});

// mark notification as read
app.put("/notifications/:id/read", (req, res) => {
  const id = Number(req.params.id);

  const notification = notifications.find(
    (notification) => notification.id === id
  );

  if (!notification) {
    return res.status(404).json({
      message: "Notification not found"
    });
  }

  notification.status = "read";

  res.json({
    message: "Notification marked as read",
    notification
  });
});

app.listen(PORT, () => {
  console.log(`Notification Service running on port ${PORT}`);
});