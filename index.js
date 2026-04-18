const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Minimalist Database Setup - This prevents the 'Status 1' crash
async function initDb() {
    try {
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
        console.log("Database Ready");
    } catch (err) {
        console.error("DB Init Warning:", err.message);
    }
}
initDb();

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- ROUTES ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Item Page Route (Polytoria.trade Style)
app.get('/store/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM item_prices WHERE item_id = $1 ORDER BY recorded_at DESC LIMIT 1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).send("Item not found. Please sync data first.");
        const item = result.rows[0];

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: sans-serif; background: #f0f2f5; margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
                    .container { background: white; max-width: 800px; width: 100%; border-radius: 15px; padding: 30px; display: flex; flex-wrap: wrap; gap: 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
                    .img-side { flex: 1; min-width: 250px; background: #f8f9fa; border-radius: 10px; padding: 20px; text-align: center; }
                    .img-side img { width: 100%; border-radius: 5px; }
                    .info-side { flex: 1.5; min-width: 250px; }
                    .price-tag { background: #f8f9fa; padding: 20px; border-radius: 10px; border-left: 5px solid #28a745; margin: 20px 0; }
                    .btn { display: block; text-align: center; background: #007bff; color: white; text-decoration: none; padding: 15px; border-radius: 8px; font-weight: bold; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="img-side"><img src="${item.thumbnail}" onerror="this.src='https://polytoria.com/assets/img/icon.png'"></div>
                    <div class="info-side">
                        <h1>${item.name}</h1>
                        <div class="price-tag">
                            <div style="font-size: 12px; color: #666;">VALUE</div>
                            <div style="font-size: 24px; font-weight: bold; color: #28a745;">${item.price.toLocaleString()} Bricks</div>
                        </div>
                        <p><b>RAP:</b> ${item.rap.toLocaleString()}</p>
                        <p><b>ID:</b> #${item.item_id}</p>
                        <a href="https://polytoria.com/store/${item.item_id}" class="btn">View on Polytoria</a>
                        <br><a href="/" style="color: #666; text-decoration: none; font-size: 14px;">← Back</a>
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (err) { res.status(500).send("Error: " + err.message); }
});

app.get('/api/prices', async (req, res) => {
    try {
        const result = await pool.query('SELECT DISTINCT ON (item_id) * FROM item_prices ORDER BY item_id, recorded_at DESC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/internal/update', (req, res) => {
    res.send(`
        <html><body style="font-family:sans-serif; text-align:center; padding:50px;">
            <h2>Sync Market Data</h2>
            <form action="/internal/save" method="POST">
                <textarea name="data" rows="10" style="width:100%; max-width:500px;"></textarea><br>
                <button type="submit" style="margin-top:10px; padding:15px 40px; background:green; color:white; border:none; border-radius:5px;">UPDATE</button>
            </form>
        </body></html>
    `);
});

app.post('/internal/save', async (req, res) => {
    try {
        const rawData = JSON.parse(req.body.data);
        const items = rawData.items || rawData.assets || rawData.data || (Array.isArray(rawData) ? rawData : []);
        for (let item of items) {
            const itemId = item.id || item.assetId || 0;
            const thumb = item.thumbnail || \`https://c0.ptacdn.com/thumbnails/assets/\${itemId}-icon.png\`;
            await pool.query(
                'INSERT INTO item_prices (item_id, name, price, rap, thumbnail) VALUES ($1, $2, $3, $4, $5)',
                [itemId, item.name || 'Unknown', item.price || 0, item.rap || 0, thumb]
            );
        }
        res.send("Successfully Updated! <a href='/'>Go Home</a>");
    } catch (err) { res.status(500).send("Error: " + err.message); }
});

app.listen(process.env.PORT || 3000);
}
initDb();

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- ROUTES ---

// 1. Home Page (Grid View)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. Individual Item Page (Polytoria.trade Style)
app.get('/store/:id', async (req, res) => {
    try {
        const itemId = req.params.id;
        const result = await pool.query('SELECT * FROM item_prices WHERE item_id = $1 ORDER BY recorded_at DESC LIMIT 1', [itemId]);
        
        if (result.rows.length === 0) return res.status(404).send("Item not found in database.");
        const item = result.rows[0];

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${item.name} - Market Tracker</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f0f2f5; margin: 0; padding: 20px; display: flex; justify-content: center; min-height: 100vh; }
                    .item-container { background: white; max-width: 1000px; width: 100%; border-radius: 15px; padding: 40px; display: flex; flex-wrap: wrap; gap: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); align-self: center; }
                    .image-section { flex: 1; min-width: 300px; background: #f8f9fa; border-radius: 20px; display: flex; align-items: center; justify-content: center; border: 1px solid #eee; padding: 20px; }
                    .image-section img { width: 100%; height: auto; border-radius: 10px; }
                    .details-section { flex: 1.5; min-width: 300px; }
                    .tag { background: #007bff; color: white; padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
                    h1 { margin: 15px 0; color: #1a1a1a; font-size: 2.5em; }
                    .price-card { background: #f8f9fa; padding: 25px; border-radius: 15px; margin: 25px 0; border-left: 6px solid #28a745; }
                    .label { font-size: 14px; color: #6c757d; font-weight: 600; text-transform: uppercase; }
                    .value { font-size: 32px; font-weight: 800; color: #28a745; margin-top: 5px; }
                    .stats-row { display: flex; gap: 15px; margin-top: 20px; }
                    .stat-box { background: white; border: 1px solid #e9ecef; padding: 20px; border-radius: 12px; flex: 1; text-align: center; }
                    .stat-val { font-size: 18px; font-weight: bold; color: #333; }
                    .btn-action { display: block; text-align: center; background: #007bff; color: white; text-decoration: none; padding: 18px; border-radius: 10px; font-weight: bold; margin-top: 30px; font-size: 18px; transition: 0.2s; }
                    .btn-action:hover { background: #0056b3; transform: scale(1.02); }
                    .back-link { display: inline-block; margin-top: 25px; color: #6c757d; text-decoration: none; font-weight: 500; }
                </style>
            </head>
            <body>
                <div class="item-container">
                    <div class="image-section">
                        <img src="${item.thumbnail}" onerror="this.src='https://polytoria.com/assets/img/icon.png'">
                    </div>
                    <div class="details-section">
                        <span class="tag">Item Details</span>
                        <h1>${item.name}</h1>
                        <div class="price-card">
                            <div class="label">Current Price</div>
                            <div class="value">${item.price.toLocaleString()} Bricks</div>
                        </div>
                        <div class="stats-row">
                            <div class="stat-box">
                                <div class="label" style="font-size: 11px;">Average Price (RAP)</div>
                                <div class="stat-val">${item.rap.toLocaleString()}</div>
                            </div>
                            <div class="stat-box">
                                <div class="label" style="font-size: 11px;">Asset ID</div>
                                <div class="stat-val">#${item.item_id}</div>
                            </div>
                        </div>
                        <a href="https://polytoria.com/store/${item.item_id}" target="_blank" class="btn-action">Purchase on Polytoria</a>
                        <a href="/" class="back-link">← Back to Catalog</a>
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        res.status(500).send("Error loading item: " + err.message);
    }
});

// 3. API for Homepage
app.get('/api/prices', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM item_prices ORDER BY recorded_at DESC LIMIT 100');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Manual Sync Interface
app.get('/internal/update', (req, res) => {
    res.send(`
        <html>
        <body style="font-family:sans-serif; padding:50px; background:#f4f7f9; text-align:center;">
            <div style="background:white; padding:40px; border-radius:20px; display:inline-block; box-shadow:0 10px 20px rgba(0,0,0,0.05);">
                <h2>Manual Market Sync</h2>
                <form action="/internal/save" method="POST">
                    <textarea name="data" rows="10" style="width:400px; padding:15px; border-radius:10px; border:1px solid #ddd;" placeholder="Paste API Response Body here..."></textarea><br>
                    <button type="submit" style="width:100%; padding:15px; background:#28a745; color:white; border:none; border-radius:10px; margin-top:15px; cursor:pointer; font-weight:bold;">Update Database</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

// 5. Save Data Logic
app.post('/internal/save', async (req, res) => {
    try {
        const rawData = JSON.parse(req.body.data);
        const items = rawData.items || rawData.assets || rawData.data || (Array.isArray(rawData) ? rawData : []);
        
        for (let item of items) {
            const itemId = item.id || item.assetId || 0;
            const itemThumb = item.thumbnail || item.iconUrl || \`https://c0.ptacdn.com/thumbnails/assets/\${itemId}-icon.png\`;
            await pool.query(
                'INSERT INTO item_prices (item_id, name, price, rap, thumbnail) VALUES ($1, $2, $3, $4, $5)',
                [itemId, item.name || 'Unknown', item.price || 0, item.rap || 0, itemThumb]
            );
        }
        res.send("Sync Complete! <a href='/'>View Market</a>");
    } catch (err) {
        res.status(500).send("Sync Error: " + err.message);
    }
});

app.listen(process.env.PORT || 3000);
