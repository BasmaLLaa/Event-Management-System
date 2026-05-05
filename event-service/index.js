const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3002;

// Temporary in-memory data until database is added
let events = [];
let nextId = 1;

// Health check
app.get("/", (req, res) => {
  res.json({
    service: "Event Service",
    status: "Running",
    port: PORT,
  });
});

// Create event
app.post("/events", (req, res) => {
  const { title, description, date, location, capacity } = req.body;

  if (!title || !description || !date || !location || !capacity) {
    return res.status(400).json({
      message: "title, description, date, location, and capacity are required",
    });
  }

  const newEvent = {
    id: nextId++,
    title,
    description,
    date,
    location,
    capacity,
    createdAt: new Date(),
  };

  events.push(newEvent);

  res.status(201).json({
    message: "Event created successfully",
    event: newEvent,
  });
});

// View all events
app.get("/events", (req, res) => {
  res.json(events);
});

// View event by ID
app.get("/events/:id", (req, res) => {
  const id = Number(req.params.id);

  const event = events.find((event) => event.id === id);

  if (!event) {
    return res.status(404).json({
      message: "Event not found",
    });
  }

  res.json(event);
});

// Update event
app.put("/events/:id", (req, res) => {
  const id = Number(req.params.id);

  const event = events.find((event) => event.id === id);

  if (!event) {
    return res.status(404).json({
      message: "Event not found",
    });
  }

  const { title, description, date, location, capacity } = req.body;

  if (title) event.title = title;
  if (description) event.description = description;
  if (date) event.date = date;
  if (location) event.location = location;
  if (capacity) event.capacity = capacity;

  event.updatedAt = new Date();

  res.json({
    message: "Event updated successfully",
    event,
  });
});

// Delete event
app.delete("/events/:id", (req, res) => {
  const id = Number(req.params.id);

  const eventExists = events.find((event) => event.id === id);

  if (!eventExists) {
    return res.status(404).json({
      message: "Event not found",
    });
  }

  events = events.filter((event) => event.id !== id);

  res.json({
    message: "Event deleted successfully",
  });
});

// Simple metrics endpoint for bonus
app.get("/metrics", (req, res) => {
  res.type("text/plain");
  res.send(`
event_service_up 1
event_total ${events.length}
`);
});

app.listen(PORT, () => {
  console.log(`Event Service running on port ${PORT}`);
});
