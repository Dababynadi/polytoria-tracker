const express = require('express');
const { Pool } = require('pg');
const path = require('path');
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
        // Silently try to add column if it was missed in an old version
        await pool.query(`ALTER TABLE item_prices ADD COLUMN IF NOT EXISTS thumbnail TEXT;`).catch(() => {});
        console.log("DB Ready");
    } catch (err) {
        console.error("DB Error:", err);
    }
}
initDb();

app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json()); // Added this to help with JSON parsing

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/prices', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM item_prices ORDER BY recorded_at DESC LIMIT 100');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/internal/update', (req, res) => {
    res.send(`
        <html>
        <body style="font-family:sans-serif;padding:20px;text-align:center;">
            <h2>Sync Market</h2>
            <form action="/internal/save" method="POST">
                <textarea name="data" rows="10" style="width:100%"></textarea><br>
                <button type="submit" style="width:100%;padding:20px;background:green;color:white;border:none;margin-top:10px;">SAVE</button>
            </form>
        </body>
        </html>
    `);
});

app.post('/internal/save', async (req, res) => {
    try {
        const rawData = JSON.parse(req.body.data);
        const items = rawData.items || rawData.assets || rawData.data || (Array.isArray(rawData) ? rawData : []);
        
        for (let item of items) {
            const itemId = item.id || item.assetId || 0;
            const itemThumb = item.thumbnail || item.iconUrl || `https://c0.ptacdn.com/thumbnails/assets/${itemId}-icon.png`;
            await pool.query(
                'INSERT INTO item_prices (item_id, name, price, rap, thumbnail) VALUES ($1, $2, $3, $4, $5)',
                [itemId, item.name || 'Unknown', item.price || 0, item.rap || 0, itemThumb]
            );
        }
        res.send("Success! <a href='/'>Go Home</a>");
    } catch (err) {
        res.status(500).send("Error: " + err.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
