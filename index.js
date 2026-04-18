 require('path');
const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Simplified Database Setup
async function initDb() {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS item_prices (
            id SERIAL PRIMARY KEY,
            item_id INT,
            name TEXT,
            price INT,
            rap INT,
            thumbnail TEXT,
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`);
        // Silently
