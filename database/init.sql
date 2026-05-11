DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS registrations;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS users;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS registrations (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  event_id INT NOT NULL,
  status VARCHAR(50) DEFAULT 'confirmed',
  payment_status VARCHAR(50),
  payment_method VARCHAR(50),
  transaction_id VARCHAR(100),
  amount NUMERIC(10, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, event_id)
);

CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  event_id INT,
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'unread',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (name, email, password, role) VALUES
('Beso Organizer', 'beso.organizer@example.com', '123456', 'organizer'),
('Sasa User', 'sasa@example.com', '123456', 'user'),
('Soz User', 'soz@example.com', '123456', 'user'),
('Mario User', 'mario@example.com', '123456', 'user'),
('Beno User', 'beno@example.com', '123456', 'user'),
('Hany User', 'hany@example.com', '123456', 'user'),
('Sara Ahmed', 'sara.ahmed@example.com', '123456', 'user'),
('Omar Khaled', 'omar.khaled@example.com', '123456', 'user'),
('Lina Hassan', 'lina.hassan@example.com', '123456', 'user'),
('Youssef Ali', 'youssef.ali@example.com', '123456', 'user'),
('Maya Nabil', 'maya.nabil@example.com', '123456', 'user'),
('Karim Samir', 'karim.samir@example.com', '123456', 'user');

INSERT INTO events (
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
) VALUES
(
  'Docker Workshop',
  'Learn Docker, Dockerfiles, images, containers, and Docker Compose.',
  '2026-05-10',
  '10:00',
  '12:00',
  'Room 101',
  30,
  3,
  27,
  'DevOps',
  1,
  'upcoming'
),
(
  'Microservices Architecture Session',
  'Introduction to microservices, service communication, and API gateways.',
  '2026-05-12',
  '12:00',
  '14:00',
  'Room 202',
  40,
  3,
  37,
  'Backend',
  1,
  'upcoming'
),
(
  'RabbitMQ Async Communication Demo',
  'Practical session about producers, consumers, queues, and async messaging.',
  '2026-05-14',
  '14:00',
  '16:00',
  'Lab 1',
  25,
  2,
  23,
  'Messaging',
  1,
  'upcoming'
),
(
  'PostgreSQL Database Design',
  'Learn relational database tables, primary keys, foreign keys, and constraints.',
  '2026-05-16',
  '09:30',
  '11:30',
  'Lab 2',
  35,
  2,
  33,
  'Database',
  1,
  'upcoming'
),
(
  'Prometheus and Grafana Monitoring',
  'Collect metrics using Prometheus and create dashboards using Grafana.',
  '2026-05-18',
  '11:00',
  '13:00',
  'Room 303',
  30,
  2,
  28,
  'Monitoring',
  1,
  'upcoming'
),
(
  'Kubernetes Deployment Day',
  'Deploy project services to Kubernetes using deployments and services.',
  '2026-05-20',
  '13:00',
  '16:00',
  'Lab 3',
  20,
  2,
  18,
  'DevOps',
  1,
  'upcoming'
),
(
  'Frontend Integration Meeting',
  'Connect frontend pages with backend microservices APIs.',
  '2026-05-22',
  '10:30',
  '12:00',
  'Room 104',
  30,
  2,
  28,
  'Frontend',
  1,
  'upcoming'
),
(
  'Final Project Demo',
  'Team presentation and full project demonstration.',
  '2026-05-25',
  '15:00',
  '17:00',
  'Main Hall',
  100,
  4,
  96,
  'Presentation',
  1,
  'upcoming'
);

INSERT INTO registrations (
  user_id,
  event_id,
  status,
  payment_status,
  payment_method,
  transaction_id,
  amount
) VALUES
(2, 1, 'confirmed', 'paid', 'card', 'TXN-1001', 100.00),
(3, 1, 'confirmed', 'paid', 'card', 'TXN-1002', 100.00),
(4, 1, 'confirmed', 'paid', 'cash', 'TXN-1003', 100.00),

(5, 2, 'confirmed', 'paid', 'card', 'TXN-1004', 120.00),
(6, 2, 'confirmed', 'paid', 'card', 'TXN-1005', 120.00),
(7, 2, 'confirmed', 'paid', 'cash', 'TXN-1006', 120.00),

(8, 3, 'confirmed', 'paid', 'card', 'TXN-1007', 150.00),
(9, 3, 'confirmed', 'paid', 'card', 'TXN-1008', 150.00),

(10, 4, 'confirmed', 'paid', 'cash', 'TXN-1009', 80.00),
(11, 4, 'confirmed', 'paid', 'card', 'TXN-1010', 80.00),

(12, 5, 'confirmed', 'paid', 'card', 'TXN-1011', 90.00),
(2, 5, 'confirmed', 'paid', 'card', 'TXN-1012', 90.00),

(3, 6, 'confirmed', 'paid', 'cash', 'TXN-1013', 110.00),
(4, 6, 'confirmed', 'paid', 'card', 'TXN-1014', 110.00),

(5, 7, 'confirmed', 'paid', 'card', 'TXN-1015', 70.00),
(6, 7, 'confirmed', 'paid', 'cash', 'TXN-1016', 70.00),

(7, 8, 'confirmed', 'paid', 'card', 'TXN-1017', 200.00),
(8, 8, 'confirmed', 'paid', 'card', 'TXN-1018', 200.00),
(9, 8, 'confirmed', 'paid', 'cash', 'TXN-1019', 200.00),
(10, 8, 'confirmed', 'paid', 'card', 'TXN-1020', 200.00);

INSERT INTO notifications (
  user_id,
  event_id,
  type,
  message,
  status
) VALUES
(2, 1, 'registration', 'Sasa User registered for Docker Workshop', 'unread'),
(3, 1, 'registration', 'Soz User registered for Docker Workshop', 'unread'),
(4, 1, 'registration', 'Mario User registered for Docker Workshop', 'read'),

(5, 2, 'registration', 'Beno User registered for Microservices Architecture Session', 'unread'),
(6, 2, 'registration', 'Hany User registered for Microservices Architecture Session', 'unread'),
(7, 2, 'registration', 'Sara Ahmed registered for Microservices Architecture Session', 'read'),

(8, 3, 'registration', 'Omar Khaled registered for RabbitMQ Async Communication Demo', 'unread'),
(9, 3, 'registration', 'Lina Hassan registered for RabbitMQ Async Communication Demo', 'unread'),

(10, 4, 'registration', 'Youssef Ali registered for PostgreSQL Database Design', 'read'),
(11, 4, 'registration', 'Maya Nabil registered for PostgreSQL Database Design', 'unread'),

(12, 5, 'registration', 'Karim Samir registered for Prometheus and Grafana Monitoring', 'unread'),
(2, 5, 'registration', 'Sasa User registered for Prometheus and Grafana Monitoring', 'read'),

(3, 6, 'registration', 'Soz User registered for Kubernetes Deployment Day', 'unread'),
(4, 6, 'registration', 'Mario User registered for Kubernetes Deployment Day', 'unread'),

(5, 7, 'registration', 'Beno User registered for Frontend Integration Meeting', 'read'),
(6, 7, 'registration', 'Hany User registered for Frontend Integration Meeting', 'unread'),

(7, 8, 'registration', 'Sara Ahmed registered for Final Project Demo', 'unread'),
(8, 8, 'registration', 'Omar Khaled registered for Final Project Demo', 'unread'),
(9, 8, 'registration', 'Lina Hassan registered for Final Project Demo', 'read'),
(10, 8, 'registration', 'Youssef Ali registered for Final Project Demo', 'unread');
