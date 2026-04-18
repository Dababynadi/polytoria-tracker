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
            CREATE TABLE IF NOT EXISTS archived_items (
                id SERIAL PRIMARY KEY,
                item_id INT,
                name TEXT,
                thumbnail TEXT,
                is_limited BOOLEAN DEFAULT FALSE,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
    } catch (err) { console.log("Archive DB Ready"); }
}
initDb();

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API: Optimized for Archive Searching
app.get('/api/items', async (req, res) => {
    try {
        const onlyLimited = req.query.limited === 'true';
        const search = req.query.search ? req.query.search.toLowerCase() : '';
        
        let query = `SELECT * FROM archived_items WHERE 1=1`;
        const params = [];

        if (onlyLimited) {
            query += ` AND is_limited = TRUE`;
        }
        if (search) {
            params.push(`%${search}%`);
            query += ` AND LOWER(name) LIKE $${params.length}`;
        }
        
        query += ` ORDER BY added_at DESC`;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) { res.json([]); }
});

// Single Item View (Simplified)
app.get('/view/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM archived_items WHERE item_id = $1 LIMIT 1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).send("Item not found in archive.");
        const item = result.rows[0];

        res.send(`
            <html>
            <head>
                <style>
                    body { font-family: sans-serif; background: #0d0d0d; color: #fff; text-align: center; padding: 50px; }
                    .card { background: #141414; border: 1px solid #222; border-radius: 20px; display: inline-block; padding: 40px; }
                    img { width: 250px; background: #000; border-radius: 15px; padding: 20px; border: 1px solid #333; }
                    .status { color: #ff4444; font-weight: bold; text-transform: uppercase; margin-top: 20px; letter-spacing: 1px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <img src="${item.thumbnail}">
                    <h1>${item.name}</h1>
                    <p style="color:#666">Archive ID: #${item.item_id}</p>
                    <div class="status">● Offline / Removed</div>
                    <br><br>
                    <a href="/" style="color:#007bff; text-decoration:none;">← Return to Archive</a>
                </div>
            </body>
            </html>
        `);
    } catch (err) { res.status(500).send("Error"); }
});

app.get('/internal/update', (req, res) => {
    res.send(`
        <body style="background:#0d0d0d; color:white; font-family:sans-serif; text-align:center; padding:50px;">
            <h2>Archive Sync</h2>
            <form action="/internal/save" method="POST">
                <textarea name="data" rows="10" placeholder="Paste Item JSON here..." style="width:80%; background:#141414; color:white; border:1px solid #333; padding:15px;"></textarea><br>
                <button type="submit" style="padding:15px 40px; margin-top:15px; background:#007bff; color:white; border:none; border-radius:8px; cursor:pointer;">Push to Archive</button>
            </form>
        </body>
    `);
});

app.post('/internal/save', async (req, res) => {
    try {
        const rawData = JSON.parse(req.body.data);
        const items = rawData.items || rawData.assets || rawData.data || (Array.isArray(rawData) ? rawData : []);
        for (let item of items) {
            await pool.query(
                'INSERT INTO archived_items (item_id, name, thumbnail, is_limited) VALUES ($1, $2, $3, $4)',
                [item.id || item.assetId, item.name, item.thumbnail || '', item.isLimited || false]
            );
        }
        res.send("Archive updated. <a href='/'>Go Home</a>");
    } catch (err) { res.send("Error: " + err.message); }
});

app.listen(process.env.PORT || 3000);
