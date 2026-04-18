const express = require('express');
const { Pool } = require('pg');
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
        console.log("Database table is ready.");
    } catch (err) {
        console.error("Database init error:", err);
    }
}
initDb();

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

// Manual Sync UI
app.get('/internal/update', (req, res) => {
    res.send(`
        <html>
        <body style="font-family:sans-serif; padding:20px; background:#f0f2f5; text-align:center;">
            <div style="max-width:500px; margin:auto; background:white; padding:30px; border-radius:15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <h2 style="color:#333;">Market Manual Sync</h2>
                <p>1. <a href="https://api.polytoria.com/v1/store/items?isLimited=true" target="_blank" style="color:#007bff; font-weight:bold;">Tap here to open data</a></p>
                <p style="font-size:0.9em; color:#666;">If the page looks like a normal website, it <b>WONT</b> work. It must look like messy text starting with {"success":true...</p>
                <form action="/internal/save" method="POST">
                    <textarea name="data" rows="8" placeholder="Paste messy text here..." style="width:100%; padding:10px; border-radius:5px; border:1px solid #ccc;"></textarea><br><br>
                    <button type="submit" style="width:100%; padding:15px; background:#28a745; color:white; border:none; border-radius:5px; font-size:16px; cursor:pointer;">Update Database</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

app.post('/internal/save', async (req, res) => {
    try {
        if (!req.body.data.trim().startsWith('{')) {
            return res.status(400).send("<b>Error:</b> That looks like HTML or an error page. Make sure you copy the RAW messy text from the link.");
        }
        
        const rawData = JSON.parse(req.body.data);
        const items = rawData.items || [];
        
        for (let item of items) {
            await pool.query(
                'INSERT INTO item_prices (item_id, name, price, rap) VALUES ($1, $2, $3, $4)',
                [item.id, item.name, item.price, item.rap]
            );
        }
        res.send(`Successfully saved ${items.length} items! <a href="/">Return Home</a>`);
    } catch (err) {
        res.status(500).send("<b>Sync Error:</b> Make sure you copied the entire page. Error: " + err.message);
    }
});

app.listen(process.env.PORT || 3000);
