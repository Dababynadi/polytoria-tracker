const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const path = require('path');
const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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
        console.log("Database table ready.");
    } catch (err) {
        console.error("DB Error:", err);
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
        const response = await axios.get('https://api.polytoria.com/v1/store/items?isLimited=true', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://polytoria.com/',
                'Origin': 'https://polytoria.com'
            }
        });
        
        const items = response.data.items;
        for (let item of items) {
            await pool.query(
                'INSERT INTO item_prices (item_id, name, price, rap) VALUES ($1, $2, $3, $4)',
                [item.id, item.name, item.price, item.rap]
            );
        }
        res.send("Update successful! Prices saved.");
    } catch (err) {
        console.error(err);
        res.status(500).send("Update failed: " + err.message);
    }
});

app.listen(process.env.PORT || 3000);
