const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Database Setup: Includes the 'thumbnail' column now
async function initDb() {
    try {
        // Create table if it doesn't exist
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
        
        // Add thumbnail column if it's missing (for existing users)
        await pool.query(`
            ALTER TABLE item_prices ADD COLUMN IF NOT EXISTS thumbnail TEXT;
        `);
        
        console.log("Database table is ready with thumbnails.");
    } catch (err) {
        console.error("Database init error:", err);
    }
}
initDb();

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API for the frontend
app.get('/api/prices', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM item_prices ORDER BY recorded_at DESC LIMIT 100');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Manual Sync Page
app.get('/internal/update', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: sans-serif; padding: 20px; background: #f0f2f5; text-align: center; }
                .box { max-width: 500px; margin: auto; background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                textarea { width: 100%; padding: 10px; border-radius: 5px; border: 1px solid #ccc; font-size: 14px; }
                button { width: 100%; padding: 15px; background: #28a745; color: white; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; font-weight: bold; margin-top: 10px; }
            </style>
        </head>
        <body>
            <div class="box">
                <h2>Market Manual Sync</h2>
                <p>Paste the "Response Body" from Polytoria below:</p>
                <form action="/internal/save" method="POST">
                    <textarea name="data" rows="10" placeholder='{"success":true...}'></textarea>
                    <button type="submit">Update Database</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

// Enhanced Saving Logic with Images
app.post('/internal/save', async (req, res) => {
    try {
        const rawData = JSON.parse(req.body.data);
        const items = rawData.items || rawData.assets || rawData.data || (Array.isArray(rawData) ? rawData : []);
        
        if (items.length === 0) {
            return res.send("<b>Error:</b> No items found.");
        }

        for (let item of items) {
            const itemId = item.id || item.assetId || 0;
            const itemName = item.name || item.assetName || 'Unknown Item';
            const itemPrice = item.price || item.value || 0;
            const itemRap = item.rap || item.avgPrice || 0;
            
            // Try to find the thumbnail in the data, or build the fallback link
            const itemThumb = item.thumbnail || item.iconUrl || \`https://c0.ptacdn.com/thumbnails/assets/\${itemId}-icon.png\`;

            await pool.query(
                'INSERT INTO item_prices (item_id, name, price, rap, thumbnail) VALUES ($1, $2, $3, $4, $5)',
                [itemId, itemName, itemPrice, itemRap, itemThumb]
            );
        }
        res.send(\`Successfully saved \${items.length} items with images! <a href="/">Go to Home</a>\`);
    } catch (err) {
        res.status(500).send("<b>Sync Error:</b> " + err.message);
    }
});

app.listen(process.env.PORT || 3000);
