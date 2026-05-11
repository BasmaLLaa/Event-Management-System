require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const PORT = process.env.PORT;
const DATABASE_URL = process.env.DATABASE_URL;

if (!PORT || !DATABASE_URL) {
  console.error('Missing required environment variables:');
  console.error({
    PORT: Boolean(PORT),
    DATABASE_URL: Boolean(DATABASE_URL),
  });
  process.exit(1);
}

const { pool, initDb, checkDbConnection } = require('./db');

const app = express();
const DATABASE_UNAVAILABLE_MESSAGE = 'Database unavailable. Please try again later.';

app.use(cors());
app.use(express.json());

async function ensureDatabaseAvailable(res) {
  const connected = await checkDbConnection();

  if (!connected) {
    res.status(503).json({ message: DATABASE_UNAVAILABLE_MESSAGE });
    return false;
  }

  return true;
}

function getCleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRole(role) {
  return role === 'organizer' ? 'organizer' : 'user';
}

function isDatabaseUnavailableError(error) {
  const databaseErrorCodes = new Set([
    'ECONNREFUSED',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ETIMEDOUT',
    'ECONNRESET',
    '57P01',
    '08000',
    '08003',
    '08006',
  ]);

  return databaseErrorCodes.has(error.code);
}

async function passwordMatches(password, storedPassword) {
  if (typeof storedPassword !== 'string') {
    return false;
  }

  if (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$')) {
    return bcrypt.compare(password, storedPassword);
  }

  return password === storedPassword;
}

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'user-service',
  });
});

app.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM users');

    return res.json({
      service: 'User Service',
      status: 'Running',
      port: Number(PORT),
      database: 'PostgreSQL connected',
      totalUsers: Number(result.rows[0].count),
    });
  } catch (error) {
    return res.status(500).json({
      service: 'User Service',
      status: 'Running',
      database: 'PostgreSQL disconnected',
      error: error.message,
    });
  }
});

app.get('/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');

    return res.json({
      message: 'Database connection successful',
      time: result.rows[0].now,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Database connection failed',
      error: error.message,
    });
  }
});

app.get('/health/db', async (req, res) => {
  const connected = await checkDbConnection();

  if (!connected) {
    return res.status(503).json({
      status: 'error',
      database: 'disconnected',
      message: 'Database is not reachable',
    });
  }

  return res.status(200).json({
    status: 'ok',
    database: 'connected',
  });
});

app.get('/metrics', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM users');

    res.type('text/plain');
    return res.send(`user_service_up 1
user_total ${result.rows[0].count}
`);
  } catch (error) {
    res.status(500);
    res.type('text/plain');
    return res.send(`user_service_up 0
user_service_error "${error.message}"
`);
  }
});

app.post('/users/register', async (req, res) => {
  const name = getCleanString(req.body.name);
  const email = getCleanString(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const role = normalizeRole(getCleanString(req.body.role).toLowerCase());

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  if (!(await ensureDatabaseAvailable(res))) {
    return undefined;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `
        INSERT INTO users (name, email, password, role)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, email, role, created_at
      `,
      [name, email, passwordHash, role],
    );
    const user = result.rows[0];

    return res.status(201).json({
      message: 'User registered successfully',
      user,
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Email already exists' });
    }

    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json({ message: DATABASE_UNAVAILABLE_MESSAGE });
    }

    console.error(`[Register] Unexpected error: ${error.message}`);
    return res.status(500).json({ message: 'Unexpected server error' });
  }
});

app.post('/users/login', async (req, res) => {
  const email = getCleanString(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  if (!(await ensureDatabaseAvailable(res))) {
    return undefined;
  }

  try {
    const result = await pool.query(
      'SELECT id, name, email, password, role FROM users WHERE email = $1',
      [email],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const role = normalizeRole(user.role);
    const matches = await passwordMatches(password, user.password);

    if (!matches) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    return res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role,
      },
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json({ message: DATABASE_UNAVAILABLE_MESSAGE });
    }

    console.error(`[Login] Unexpected error: ${error.message}`);
    return res.status(500).json({ message: 'Unexpected server error' });
  }
});

app.get('/users/:id', async (req, res) => {
  const userId = Number.parseInt(req.params.id, 10);

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ message: 'User ID must be a positive number' });
  }

  if (!(await ensureDatabaseAvailable(res))) {
    return undefined;
  }

  try {
    const result = await pool.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json({ message: DATABASE_UNAVAILABLE_MESSAGE });
    }

    console.error(`[GetUserById] Unexpected error: ${error.message}`);
    return res.status(500).json({ message: 'Unexpected server error' });
  }
});

app.get('/users/:id/role', async (req, res) => {
  const userId = Number.parseInt(req.params.id, 10);

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ message: 'User ID must be a positive number' });
  }

  if (!(await ensureDatabaseAvailable(res))) {
    return undefined;
  }

  try {
    const result = await pool.query('SELECT id, role FROM users WHERE id = $1', [
      userId,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json({
      id: result.rows[0].id,
      role: normalizeRole(result.rows[0].role),
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json({ message: DATABASE_UNAVAILABLE_MESSAGE });
    }

    console.error(`[GetUserRole] Unexpected error: ${error.message}`);
    return res.status(500).json({ message: 'Unexpected server error' });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ message: 'Invalid JSON body' });
  }

  console.error(`[Server] Unexpected error: ${error.message}`);
  return res.status(500).json({ message: 'Unexpected server error' });
});

app.listen(PORT, () => {
  console.log(`User Service is running on port ${PORT}`);

  initDb().then((connected) => {
    if (!connected) {
      console.error(
        '[Startup] PostgreSQL connection failed. Database-dependent routes will return 503 until PostgreSQL is reachable.',
      );
    }
  });
});
