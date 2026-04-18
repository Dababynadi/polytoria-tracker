const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Create table if missing
pool.query(`
    CREATE TABLE IF NOT EXISTS item_prices (
        id SERIAL PRIMARY KEY,
        item_id INT,
        name TEXT,
        price INT,
        rap INT,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
`).catch(err => console.error("DB Error:", err));

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// This is the page that was blank - simplified version:
app.get('/internal/update', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:sans-serif; padding:20px;">
            <h2>Manual Sync Page</h2>
            <p>1. <a href="https://api.polytoria.com/v1/store/items?isLimited=true" target="_blank">Click here for data</a></p>
            <p>2. Copy the text from that page and paste it below:</p>
            <form action="/internal/save" method="POST">
                <textarea name="data" rows="10" style="width:100%;" placeholder='{"success":true...}'></textarea><br><br>
                <button type="submit" style="padding:15px; background:green; color:white; width:100%;">Save to Database</button>
            </form>
        </body>
        </html>
    `);
});

app.post('/internal/save', async (req, res) => {
    try {
        const rawData = JSON.parse(req.body.data);
        const items = rawData.items || [];
        for (let item of items) {
            await pool.query(
                'INSERT INTO item_prices (item_id, name, price, rap) VALUES ($1, $2, $3, $4)',
                [item.id, item.name, item.price, item.rap]
            );
        }
        res.send(`Successfully saved ${items.length} items! <a href="/">Go Home</a>`);
    } catch (err) {
        res.send("Error: " + err.message);
    }
});

app.listen(process.env.PORT || 3000);
