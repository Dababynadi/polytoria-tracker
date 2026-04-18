const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const path = require('path');
const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// AUTO-SETUP: Creates the table if it doesn't exist
async function initDb() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS item_prices (
                id SERIAL PRIMARY KEY,
                item_id INT,
                name TEXT,
                price INT,
                rap INT,
                recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Database table is ready.");
    } catch (err) {
        console.error("Database init error:", err);
    }
}
initDb();

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/prices', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM item_prices ORDER BY recorded_at DESC LIMIT 60');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/internal/update', async (req, res) => {
    try {
        // We add the User-Agent here to stop Polytoria from blocking us (403 error)
        const response = await axios.get('https://api.polytoria.com/v1/store/items?isLimited=true', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        const items = response.data.items;
        for (let item of items) {
            await pool.query(
                'INSERT INTO item_prices (item_id, name, price, rap) VALUES ($1, $2, $3, $4)',
                [item.id, item.name, item.price, item.rap]
            );
        }
        res.send("Update successful! Prices saved to database.");
    } catch (err) {
        res.status(500).send("Update failed: " + err.message);
    }
});

app.listen(process.env.PORT || 3000);
