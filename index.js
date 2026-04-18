const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Database Setup: Includes the 'thumbnail' column
async function initDb() {
    try {
        // 1. Create table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS item_prices (
                id SERIAL PRIMARY KEY,
                item_id INT,
                name TEXT,
                price INT,
                rap INT,
                thumbnail TEXT,
                recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // 2. Add thumbnail column if it's missing (Safe check)
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='item_prices' AND column_name='thumbnail') THEN
                    ALTER TABLE item_prices ADD COLUMN thumbnail TEXT;
                END IF;
            END $$;
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
        const result = await pool.query('SELECT * FROM item_prices ORDER BY recorded_at DESC LIMIT 100');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/internal/update', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:sans-serif; padding:20px; text-align:center;">
            <h2>Market Manual Sync</h2>
            <form action="/internal/save" method="POST">
                <textarea name="data" rows="10" style="width:100%;" placeholder='Paste JSON here...'></textarea>
                <button type="submit" style="width:100%; padding:15px; background:green; color:white; margin-top:10px; border:none; border-radius:5px;">Update Database</button>
            </form>
        </body>
        </html>
    `);
});

app.post('/internal/save', async (req, res) => {
    try {
        const rawData = JSON.parse(req.body.data);
        const items = rawData.items || rawData.assets || rawData.data || (Array.isArray(rawData) ? rawData : []);
        
        if (items.length === 0) {
            return res.send("No items found.");
        }

        for (let item of items) {
            const itemId = item.id || item.assetId || 0;
            const itemName = item.name || 'Unknown';
            const itemPrice = item.price || 0;
            const itemRap = item.rap || 0;
            const itemThumb = item.thumbnail || \`https://c0.ptacdn.com/thumbnails/assets/\${itemId}-icon.png\`;

            await pool.query(
                'INSERT INTO item_prices (item_id, name, price, rap, thumbnail) VALUES ($1, $2, $3, $4, $5)',
                [itemId, itemName, itemPrice, itemRap, itemThumb]
            );
        }
        res.send("Success! <a href='/'>Go Home</a>");
    } catch (err) {
        res.status(500).send("Error: " + err.message);
    }
});

app.listen(process.env.PORT || 3000);
