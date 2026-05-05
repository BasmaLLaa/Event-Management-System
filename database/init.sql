DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS registrations;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    location VARCHAR(150),
    event_date TIMESTAMP NOT NULL,
    capacity INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE registrations (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    event_id INT NOT NULL,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_user
        FOREIGN KEY(user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_event
        FOREIGN KEY(event_id)
        REFERENCES events(id)
        ON DELETE CASCADE,

    CONSTRAINT unique_registration UNIQUE(user_id, event_id)
);

CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INT,
    event_id INT,
    message TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'sent',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (name, email, password, role) VALUES
('Beso Admin', 'beso.admin@example.com', '123456', 'admin'),
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

INSERT INTO events (title, description, location, event_date, capacity) VALUES
('Docker Workshop', 'Learn Docker, Dockerfiles, images, containers, and Docker Compose.', 'Room 101', '2026-05-10 10:00:00', 30),
('Microservices Architecture Session', 'Introduction to microservices, service communication, and API gateways.', 'Room 202', '2026-05-12 12:00:00', 40),
('RabbitMQ Async Communication Demo', 'Practical session about producers, consumers, queues, and async messaging.', 'Lab 1', '2026-05-14 14:00:00', 25),
('PostgreSQL Database Design', 'Learn relational database tables, primary keys, foreign keys, and constraints.', 'Lab 2', '2026-05-16 09:30:00', 35),
('Prometheus and Grafana Monitoring', 'Collect metrics using Prometheus and create dashboards using Grafana.', 'Room 303', '2026-05-18 11:00:00', 30),
('Kubernetes Deployment Day', 'Deploy project services to Kubernetes using deployments and services.', 'Lab 3', '2026-05-20 13:00:00', 20),
('Frontend Integration Meeting', 'Connect frontend pages with backend microservices APIs.', 'Room 104', '2026-05-22 10:30:00', 30),
('Final Project Demo', 'Team presentation and full project demonstration.', 'Main Hall', '2026-05-25 15:00:00', 100);

INSERT INTO registrations (user_id, event_id) VALUES
(2, 1),
(3, 1),
(4, 1),
(5, 2),
(6, 2),
(7, 2),
(8, 3),
(9, 3),
(10, 4),
(11, 4),
(12, 5),
(2, 5),
(3, 6),
(4, 6),
(5, 7),
(6, 7),
(7, 8),
(8, 8),
(9, 8),
(10, 8);

INSERT INTO notifications (user_id, event_id, message, status) VALUES
(2, 1, 'Sasa User registered for Docker Workshop', 'sent'),
(3, 1, 'Soz User registered for Docker Workshop', 'sent'),
(4, 1, 'Mario User registered for Docker Workshop', 'sent'),
(5, 2, 'Beno User registered for Microservices Architecture Session', 'sent'),
(6, 2, 'Hany User registered for Microservices Architecture Session', 'sent'),
(7, 2, 'Sara Ahmed registered for Microservices Architecture Session', 'sent'),
(8, 3, 'Omar Khaled registered for RabbitMQ Async Communication Demo', 'sent'),
(9, 3, 'Lina Hassan registered for RabbitMQ Async Communication Demo', 'sent'),
(10, 4, 'Youssef Ali registered for PostgreSQL Database Design', 'sent'),
(11, 4, 'Maya Nabil registered for PostgreSQL Database Design', 'sent'),
(12, 5, 'Karim Samir registered for Prometheus and Grafana Monitoring', 'sent'),
(2, 5, 'Sasa User registered for Prometheus and Grafana Monitoring', 'sent'),
(3, 6, 'Soz User registered for Kubernetes Deployment Day', 'sent'),
(4, 6, 'Mario User registered for Kubernetes Deployment Day', 'sent'),
(5, 7, 'Beno User registered for Frontend Integration Meeting', 'sent'),
(6, 7, 'Hany User registered for Frontend Integration Meeting', 'sent'),
(7, 8, 'Sara Ahmed registered for Final Project Demo', 'sent'),
(8, 8, 'Omar Khaled registered for Final Project Demo', 'sent'),
(9, 8, 'Lina Hassan registered for Final Project Demo', 'sent'),
(10, 8, 'Youssef Ali registered for Final Project Demo', 'sent');
