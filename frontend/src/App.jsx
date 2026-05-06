import { useEffect, useState } from "react";
import axios from "axios";

const USER_API = "http://localhost:3001";
const EVENT_API = "http://localhost:3002";
const REGISTRATION_API = "http://localhost:3003";

function App() {
  const [page, setPage] = useState("events");
  const [message, setMessage] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  const [registerForm, setRegisterForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
  });

  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [bookings, setBookings] = useState([]);

  async function fetchEvents() {
    try {
      const response = await axios.get(`${EVENT_API}/events`);
      setEvents(response.data);
    } catch (error) {
      setMessage("Failed to load events. Make sure Event Service is running on port 3002.");
    }
  }

  useEffect(() => {
    fetchEvents();
  }, []);

  async function handleRegister(e) {
    e.preventDefault();

    try {
      const response = await axios.post(`${USER_API}/users/register`, registerForm);
      setCurrentUser(response.data.user || response.data);
      setMessage("Registered successfully.");
      setRegisterForm({ name: "", email: "", password: "" });
      setPage("events");
    } catch (error) {
      setMessage("Register failed. Check User Service endpoint.");
    }
  }

  async function handleLogin(e) {
    e.preventDefault();

    try {
      const response = await axios.post(`${USER_API}/users/login`, loginForm);
      setCurrentUser(response.data.user || response.data);
      setMessage("Logged in successfully.");
      setLoginForm({ email: "", password: "" });
      setPage("events");
    } catch (error) {
      setMessage("Login failed. Check User Service endpoint.");
    }
  }

  async function openEventDetails(id) {
    try {
      const response = await axios.get(`${EVENT_API}/events/${id}`);
      setSelectedEvent(response.data);
      setPage("details");
    } catch (error) {
      setMessage("Failed to load event details.");
    }
  }

  async function bookEvent(eventId) {
    if (!currentUser) {
      setMessage("Please login first before booking.");
      setPage("login");
      return;
    }

    try {
      await axios.post(`${REGISTRATION_API}/registrations`, {
        userId: currentUser.id,
        eventId: eventId,
      });

      setMessage("Booking successful.");
    } catch (error) {
      setMessage("Booking failed. Make sure all services are running.");
    }
  }

  async function fetchMyBookings() {
    if (!currentUser) {
      setMessage("Please login first.");
      setPage("login");
      return;
    }

    try {
      const response = await axios.get(
        `${REGISTRATION_API}/registrations/user/${currentUser.id}`
      );

      setBookings(response.data);
      setPage("bookings");
    } catch (error) {
      setMessage("Failed to load bookings.");
    }
  }

  async function cancelBooking(id) {
    try {
      await axios.delete(`${REGISTRATION_API}/registrations/${id}`);
      setBookings(bookings.filter((booking) => booking.id !== id));
      setMessage("Booking cancelled.");
    } catch (error) {
      setMessage("Failed to cancel booking.");
    }
  }

  return (
    <div style={styles.page}>
      <nav style={styles.navbar}>
        <h2>Event Management System</h2>

        <div>
          <button style={styles.navButton} onClick={() => setPage("events")}>
            Events
          </button>
          <button style={styles.navButton} onClick={() => setPage("register")}>
            Register
          </button>
          <button style={styles.navButton} onClick={() => setPage("login")}>
            Login
          </button>
          <button style={styles.navButton} onClick={fetchMyBookings}>
            My Bookings
          </button>
        </div>
      </nav>

      <main style={styles.container}>
        {currentUser && (
          <div style={styles.successBox}>
            Logged in as: {currentUser.name || currentUser.email || currentUser.id}
          </div>
        )}

        {message && <div style={styles.messageBox}>{message}</div>}

        {page === "register" && (
          <section style={styles.card}>
            <h1>Register</h1>

            <form onSubmit={handleRegister} style={styles.form}>
              <input
                style={styles.input}
                placeholder="Name"
                value={registerForm.name}
                onChange={(e) =>
                  setRegisterForm({ ...registerForm, name: e.target.value })
                }
              />

              <input
                style={styles.input}
                placeholder="Email"
                type="email"
                value={registerForm.email}
                onChange={(e) =>
                  setRegisterForm({ ...registerForm, email: e.target.value })
                }
              />

              <input
                style={styles.input}
                placeholder="Password"
                type="password"
                value={registerForm.password}
                onChange={(e) =>
                  setRegisterForm({ ...registerForm, password: e.target.value })
                }
              />

              <button style={styles.primaryButton} type="submit">
                Register
              </button>
            </form>
          </section>
        )}

        {page === "login" && (
          <section style={styles.card}>
            <h1>Login</h1>

            <form onSubmit={handleLogin} style={styles.form}>
              <input
                style={styles.input}
                placeholder="Email"
                type="email"
                value={loginForm.email}
                onChange={(e) =>
                  setLoginForm({ ...loginForm, email: e.target.value })
                }
              />

              <input
                style={styles.input}
                placeholder="Password"
                type="password"
                value={loginForm.password}
                onChange={(e) =>
                  setLoginForm({ ...loginForm, password: e.target.value })
                }
              />

              <button style={styles.primaryButton} type="submit">
                Login
              </button>
            </form>
          </section>
        )}

        {page === "events" && (
          <section>
            <h1>Events List</h1>

            <button style={styles.secondaryButton} onClick={fetchEvents}>
              Refresh Events
            </button>

            <div style={styles.grid}>
              {events.length === 0 ? (
                <p>No events found.</p>
              ) : (
                events.map((event) => (
                  <div key={event.id} style={styles.card}>
                    <h2>{event.title}</h2>
                    <p>{event.description}</p>
                    <p><strong>Date:</strong> {event.date}</p>
                    <p><strong>Location:</strong> {event.location}</p>
                    <p><strong>Capacity:</strong> {event.capacity}</p>

                    <button
                      style={styles.primaryButton}
                      onClick={() => openEventDetails(event.id)}
                    >
                      View Details
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {page === "details" && selectedEvent && (
          <section style={styles.card}>
            <h1>{selectedEvent.title}</h1>
            <p>{selectedEvent.description}</p>
            <p><strong>Date:</strong> {selectedEvent.date}</p>
            <p><strong>Location:</strong> {selectedEvent.location}</p>
            <p><strong>Capacity:</strong> {selectedEvent.capacity}</p>

            <button
              style={styles.primaryButton}
              onClick={() => bookEvent(selectedEvent.id)}
            >
              Book Event
            </button>

            <button
              style={styles.secondaryButton}
              onClick={() => setPage("events")}
            >
              Back
            </button>
          </section>
        )}

        {page === "bookings" && (
          <section>
            <h1>My Bookings</h1>

            {bookings.length === 0 ? (
              <p>No bookings found.</p>
            ) : (
              <div style={styles.grid}>
                {bookings.map((booking) => (
                  <div key={booking.id} style={styles.card}>
                    <h2>Booking #{booking.id}</h2>
                    <p><strong>User ID:</strong> {booking.userId}</p>
                    <p><strong>Event ID:</strong> {booking.eventId}</p>
                    <p><strong>Status:</strong> {booking.status}</p>

                    <button
                      style={styles.dangerButton}
                      onClick={() => cancelBooking(booking.id)}
                    >
                      Cancel Booking
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f4f6f8",
    fontFamily: "Arial, sans-serif",
    color: "#222",
  },
  navbar: {
    background: "#1f2937",
    color: "white",
    padding: "16px 28px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
  },
  navButton: {
    margin: "5px",
    padding: "10px 14px",
    border: "none",
    borderRadius: "6px",
    background: "#374151",
    color: "white",
    cursor: "pointer",
  },
  container: {
    maxWidth: "1100px",
    margin: "30px auto",
    padding: "0 20px",
  },
  card: {
    background: "white",
    padding: "20px",
    borderRadius: "10px",
    marginTop: "20px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "20px",
    marginTop: "20px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    maxWidth: "400px",
  },
  input: {
    padding: "12px",
    borderRadius: "6px",
    border: "1px solid #ccc",
    fontSize: "16px",
  },
  primaryButton: {
    background: "#2563eb",
    color: "white",
    border: "none",
    padding: "11px 16px",
    borderRadius: "6px",
    cursor: "pointer",
    marginRight: "10px",
    marginTop: "10px",
  },
  secondaryButton: {
    background: "#6b7280",
    color: "white",
    border: "none",
    padding: "11px 16px",
    borderRadius: "6px",
    cursor: "pointer",
    marginRight: "10px",
    marginTop: "10px",
  },
  dangerButton: {
    background: "#dc2626",
    color: "white",
    border: "none",
    padding: "11px 16px",
    borderRadius: "6px",
    cursor: "pointer",
    marginTop: "10px",
  },
  messageBox: {
    background: "#fff7ed",
    border: "1px solid #fdba74",
    padding: "12px",
    borderRadius: "6px",
    marginBottom: "15px",
  },
  successBox: {
    background: "#ecfdf5",
    border: "1px solid #6ee7b7",
    padding: "12px",
    borderRadius: "6px",
    marginBottom: "15px",
  },
};

export default App;
