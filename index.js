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
                thumbnail TEXT,
                description TEXT,
                recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS site_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );
            INSERT INTO site_settings (key, value) VALUES ('announcement', 'Welcome to the Archive!') ON CONFLICT DO NOTHING;
        `);
    } catch (err) { console.log("DB Ready"); }
}
initDb();

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/announcement', async (req, res) => {
    const result = await pool.query('SELECT value FROM site_settings WHERE key = $1', ['announcement']);
    res.json({ message: result.rows[0]?.value || "" });
});

app.get('/api/prices', async (req, res) => {
    try {
        const search = req.query.search ? req.query.search.toLowerCase() : '';
        let query = `SELECT t1.* FROM item_prices t1 JOIN (SELECT item_id, MAX(id) as last_id FROM item_prices GROUP BY item_id) t2 ON t1.id = t2.last_id`;
        const params = [];
        if (search) {
            params.push(`%${search}%`);
            query += ` WHERE LOWER(t1.name) LIKE $1`;
        }
        query += ` ORDER BY t1.recorded_at DESC`;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) { res.json([]); }
});

// FIXED VIEW PAGE: Restored the Button and Fixed Description
app.get('/store/:id', async (req, res) => {
    try {
        const itemId = req.params.id;
        const result = await pool.query('SELECT * FROM item_prices WHERE item_id = $1 ORDER BY recorded_at DESC LIMIT 1', [itemId]);
        if (result.rows.length === 0) return res.status(404).send("Item not found.");
        
        const item = result.rows[0];
        
        // Fix for "undefined" or missing description
        const itemDesc = (item.description && item.description !== 'undefined' && item.description !== '') 
                         ? item.description 
                         : 'A look as old as time.';

        res.send(`
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: 'Inter', sans-serif; background: #0d0d0d; color: #fff; margin: 0; padding: 20px; }
                    .wrapper { max-width: 600px; margin: 40px auto; }
                    .header-img { background: #141414; border: 1px solid #222; border-radius: 12px; padding: 40px; text-align: center; margin-bottom: 20px; }
                    .header-img img { width: 100%; max-width: 300px; border-radius: 8px; }
                    .status-banner { background: rgba(255, 68, 68, 0.1); border: 1px solid #ff4444; color: #ff4444; padding: 12px; border-radius: 8px; text-align: center; font-weight: 800; margin-bottom: 20px; text-transform: uppercase; }
                    .info-section { background: #141414; border: 1px solid #222; border-radius: 12px; padding: 25px; margin-bottom: 15px; }
                    .label { font-size: 11px; color: #666; font-weight: 800; text-transform: uppercase; margin-bottom: 5px; }
                    .value { font-size: 22px; font-weight: 700; }
                    /* THE BUTTON */
                    .btn-polytoria { 
                        display: block; text-align: center; background: #222; color: #fff; 
                        text-decoration: none; padding: 18px; border-radius: 10px; 
                        font-weight: bold; margin-bottom: 20px; border: 1px solid #333; 
                        transition: 0.2s;
                    }
                    .btn-polytoria:hover { background: #2a2a2a; border-color: #444; }
                </style>
            </head>
            <body>
                <div class="wrapper">
                    <div class="header-img"><img src="${item.thumbnail}"></div>
                    
                    ${item.price === 0 ? '<div class="status-banner">Off-Sale Item</div>' : ''}
                    
                    <h1 style="margin: 0 0 5px 0;">${item.name}</h1>
                    <p style="color: #888; margin-bottom: 30px; line-height: 1.6;">${itemDesc}</p>
                    
                    <a href="https://polytoria.com/store/${item.item_id}" target="_blank" class="btn-polytoria">View on Polytoria</a>
                    
                    <div class="info-section">
                        <div class="label">Price</div>
                        <div class="value">${item.price > 0 ? item.price.toLocaleString() + ' Bricks' : 'Off-Sale'}</div>
                    </div>
                    
                    <div class="info-section">
                        <div class="label">Asset ID</div>
                        <div class="value">#${item.item_id}</div>
                    </div>

                    <a href="/" style="display:block; text-align:center; color:#555; text-decoration:none; margin-top:30px; font-size:14px;">← Back to Collection</a>
                </div>
            </body>
            </html>
        `);
    } catch (err) { res.status(500).send("Error"); }
});

app.post('/internal/update-announcement', async (req, res) => {
    await pool.query('UPDATE site_settings SET value = $1 WHERE key = $2', [req.body.msg, 'announcement']);
    res.redirect('/internal/update');
});

app.post('/internal/save', async (req, res) => {
    try {
        const rawData = JSON.parse(req.body.data);
        const items = rawData.items || rawData.assets || rawData.data || (Array.isArray(rawData) ? rawData : []);
        for (let item of items) {
            await pool.query(
                'INSERT INTO item_prices (item_id, name, price, thumbnail, description) VALUES ($1, $2, $3, $4, $5)',
                [item.id || item.assetId, item.name, item.price || 0, item.thumbnail || '', item.description]
            );
        }
        res.send("Sync successful! <a href='/'>Go Home</a>");
    } catch (err) { res.send("Error: " + err.message); }
});

app.listen(process.env.PORT || 3000);
