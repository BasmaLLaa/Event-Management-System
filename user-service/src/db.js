require('dotenv').config();

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  connectionTimeoutMillis: 3000,
});

const createUsersTableQuery = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

let usersTableReady = false;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function prepareDatabase() {
  await pool.query('SELECT 1');

  if (!usersTableReady) {
    await pool.query(createUsersTableQuery);
    await pool.query(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user'",
    );
    await pool.query(
      "UPDATE users SET role = 'organizer' WHERE role = 'admin'",
    );
    await pool.query(
      "UPDATE users SET role = 'user' WHERE role IS NULL OR role NOT IN ('organizer', 'user')",
    );

    if (process.env.INITIAL_ORGANIZER_EMAIL) {
      const organizerEmail = process.env.INITIAL_ORGANIZER_EMAIL.trim().toLowerCase();

      if (organizerEmail) {
        const result = await pool.query(
          "UPDATE users SET role = 'organizer' WHERE LOWER(email) = $1 RETURNING id, email",
          [organizerEmail],
        );

        if (result.rowCount > 0) {
          console.log(`[Database] Bootstrapped organizer user ${organizerEmail}.`);
        }
      }
    }

    usersTableReady = true;
  }
}

async function initDb(maxRetries = 5, retryDelayMs = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      await prepareDatabase();
      console.log('[Database] PostgreSQL connected. Users table is ready.');
      return true;
    } catch (error) {
      usersTableReady = false;
      console.error(
        `[Database] PostgreSQL unavailable (attempt ${attempt}/${maxRetries}): ${error.message}`,
      );

      if (attempt < maxRetries) {
        console.log(`[Database] Retrying in ${retryDelayMs / 1000} seconds...`);
        await wait(retryDelayMs);
      }
    }
  }

  console.error(
    '[Database] PostgreSQL is unavailable after startup retries. The app is still running. /health works, /health/db reports disconnected, and user routes return 503 until PostgreSQL is reachable.',
  );
  return false;
}

async function checkDbConnection() {
  try {
    await prepareDatabase();
    return true;
  } catch (error) {
    usersTableReady = false;
    return false;
  }
}

pool.on('error', (error) => {
  usersTableReady = false;
  console.error(`[Database] Unexpected PostgreSQL pool error: ${error.message}`);
});

module.exports = {
  pool,
  initDb,
  checkDbConnection,
};
