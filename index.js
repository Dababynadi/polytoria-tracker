const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Safety check: Test connection but DON'T crash if it fails
pool.connect((err, client, release) => {
  if (err) return console.error('Database connection error:', err.stack);
  console.log('Database connected successfully');
  release();
});

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Home Page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Individual Item Page
app.get('/store/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM item_prices WHERE item_id = $1 ORDER BY recorded_at DESC LIMIT 1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).send("Item not found. Please sync data first.");
        const item = result.rows[0];
        res.send(`
            <html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
            <body style="font-family:sans-serif; background:#f0f2f5; margin:0; padding:20px; display:flex; justify-content:center; align-items:center; min-height:100vh;">
                <div style="background:white; max-width:800px; width:100%; border-radius:15px; padding:30px; display:flex; flex-wrap:wrap; gap:30px; box-shadow:0 4px 20px rgba(0,0,0,0.1);">
                    <div style="flex:1; min-width:250px; background:#f8f9fa; border-radius:10px; padding:20px; text-align:center;">
                        <img src="${item.thumbnail}" style="width:100%;" onerror="this.src='https://polytoria.com/assets/img/icon.png'">
                    </div>
                    <div style="flex:1.5; min-width:250px;">
                        <h1 style="margin:0;">${item.name}</h1>
                        <div style="background:#f8f9fa; padding:20px; border-radius:10px; border-left:5px solid #28a745; margin:20px 0;">
                            <div style="font-size:12px; color:#666;">VALUE</div>
                            <div style="font-size:24px; font-weight:bold; color:#28a745;">${item.price.toLocaleString()} Bricks</div>
                        </div>
                        <p><b>RAP:</b> ${item.rap.toLocaleString()}</p>
                        <p><b>ID:</b> #${item.item_id}</p>
                        <a href="https://polytoria.com/store/${item.item_id}" style="display:block; text-align:center; background:#007bff; color:white; text-decoration:none; padding:15px; border-radius:8px; font-weight:bold;">View on Polytoria</a>
                        <br><a href="/" style="color:#666; text-decoration:none;">← Back to Home</a>
                    </div>
                </div>
            </body></html>
        `);
    } catch (err) { res.status(500).send("Error loading item details."); }
});

// API for Home Grid
app.get('/api/prices', async (req, res) => {
    try {
        const result = await pool.query('SELECT DISTINCT ON (item_id) * FROM item_prices ORDER BY item_id, recorded_at DESC');
        res.json(result.rows);
    } catch (err) { res.json([]); }
});

// Sync Page
app.get('/internal/update', (req, res) => {
    res.send(`
        <html><body style="font-family:sans-serif; text-align:center; padding:50px;">
            <h2>Sync Market</h2>
            <form action="/internal/save" method="POST">
                <textarea name="data" rows="10" style="width:100%; max-width:500px; padding:10px;"></textarea><br>
                <button type="submit" style="margin-top:10px; padding:15px 40px; background:green; color:white; border:none; border-radius:5px; font-weight:bold;">SAVE DATA</button>
            </form>
        </body></html>
    `);
});

// Save Logic
app.post('/internal/save', async (req, res) => {
    try {
        const rawData = JSON.parse(req.body.data);
        const items = rawData.items || rawData.assets || rawData.data || (Array.isArray(rawData) ? rawData : []);
        
        // This line creates the table ONLY when you actually try to save data
        await pool.query('CREATE TABLE IF NOT EXISTS item_prices (id SERIAL PRIMARY KEY, item_id INT, name TEXT, price INT, rap INT, thumbnail TEXT, recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
        
        for (let item of items) {
            const itemId = item.id || item.assetId || 0;
            const thumb = item.thumbnail || item.iconUrl || `https://c0.ptacdn.com/thumbnails/assets/${itemId}-icon.png`;
            await pool.query(
                'INSERT INTO item_prices (item_id, name, price, rap, thumbnail) VALUES ($1, $2, $3, $4, $5)',
                [itemId, item.name || 'Unknown', item.price || 0, item.rap || 0, thumb]
            );
        }
        res.send("Successfully Sync'd! <a href='/'>Go Home</a>");
    } catch (err) { res.send("Error during save: " + err.message); }
});

app.listen(process.env.PORT || 3000);
