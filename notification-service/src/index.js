const express = require("express");

const app = express();
app.use(express.json());

const PORT = 3004;

let notifications = [];
let notificationCount = 0;

// health
app.get("/health", (req, res) => {
  res.send("Notification service is running");
});

// metrics (for bonus later)
app.get("/metrics", (req, res) => {
  res.type("text/plain");
  res.send(`notifications_total ${notificationCount}`);
});

// create notification (for testing)
app.post("/notifications/test", (req, res) => {
  const notification = {
    id: notifications.length + 1,
    userId: req.body.userId,
    eventId: req.body.eventId,
    message: req.body.message,
  };

  notifications.push(notification);
  notificationCount++;

  console.log("New notification:", notification);

  res.json(notification);
});

// get notifications for a user
app.get("/notifications/user/:userId", (req, res) => {
  const userId = Number(req.params.userId);
  const result = notifications.filter(n => n.userId === userId);
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});