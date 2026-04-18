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
        // Using AllOrigins proxy to bypass Cloudflare/403 blocks
        const targetUrl = encodeURIComponent('https://api.polytoria.com/v1/store/items?isLimited=true');
        const proxyUrl = `https://api.allorigins.win/get?url=${targetUrl}`;

        const response = await axios.get(proxyUrl);
        
        // AllOrigins returns the data as a string in the "contents" property
        const data = JSON.parse(response.data.contents);
        const items = data.items;

        if (!items || items.length === 0) {
            throw new Error("No items found in the API response.");
        }

        for (let item of items) {
            await pool.query(
                'INSERT INTO item_prices (item_id, name, price, rap) VALUES ($1, $2, $3, $4)',
                [item.id, item.name, item.price, item.rap]
            );
        }
        res.send(`Update successful! Saved ${items.length} items to your database.`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Update failed: " + err.message);
    }
});

app.listen(process.env.PORT || 3000);
