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

app.use(express.urlencoded({ extended: true }));

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

// The "Manual Sync" Page - Use this to bypass the 403 error!
app.get('/internal/update', (req, res) => {
    res.send(`
        <html>
        <body style="font-family:sans-serif; padding:20px; background:#f4f7f9;">
            <div style="max-width:500px; margin:auto; background:white; padding:20px; border-radius:10px; border:1px solid #ddd;">
                <h2>Market Sync</h2>
                <p>1. <a href="https://api.polytoria.com/v1/store/items?isLimited=true" target="_blank">Tap here</a> to see the data.</p>
                <p>2. <b>Select All</b> and <b>Copy</b> all the text on that page.</p>
                <p>3. Paste it below and hit Save.</p>
                <form action="/internal/save" method="POST">
                    <textarea name="data" rows="10" style="width:100%; border:1px solid #ccc; border-radius:5px;"></textarea><br><br>
                    <button type="submit" style="width:100%; padding:15px; background:#007bff; color:white; border:none; border-radius:5px; font-weight:bold;">Save to Database</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

app.post('/internal/save', async (req, res) => {
    try {
        const rawData = JSON.parse(req.body.data);
        const items = rawData.items;
        for (let item of items) {
            await pool.query(
                'INSERT INTO item_prices (item_id, name, price, rap) VALUES ($1, $2, $3, $4)',
                [item.id, item.name, item.price, item.rap]
            );
        }
        res.send(`Successfully saved ${items.length} items! <a href="/">Go to Home</a>`);
    } catch (err) {
        res.status(500).send("Error saving data: " + err.message);
    }
});

app.listen(process.env.PORT || 3000);
