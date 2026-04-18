const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Added a simple table for the site-wide announcement
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
                is_off_sale BOOLEAN DEFAULT TRUE,
                recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS site_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );
            INSERT INTO site_settings (key, value) VALUES ('announcement', 'Welcome to the Archive! New items added daily.') ON CONFLICT DO NOTHING;
        `);
    } catch (err) { console.log("Database initialized."); }
}
initDb();

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Get the current announcement message
app.get('/api/announcement', async (req, res) => {
    const result = await pool.query('SELECT value FROM site_settings WHERE key = $1', ['announcement']);
    res.json({ message: result.rows[0]?.value || "" });
});

app.get('/api/prices', async (req, res) => {
    try {
        const search = req.query.search ? req.query.search.toLowerCase() : '';
        let query = `
            SELECT t1.* FROM item_prices t1 
            JOIN (SELECT item_id, MAX(id) as last_id FROM item_prices GROUP BY item_id) t2 
            ON t1.id = t2.last_id
        `;
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

app.get('/store/:id', async (req, res) => {
    try {
        const itemId = req.params.id;
        const result = await pool.query('SELECT * FROM item_prices WHERE item_id = $1 ORDER BY recorded_at DESC LIMIT 1', [itemId]);
        if (result.rows.length === 0) return res.status(404).send("Item not found.");
        const item = result.rows[0];
        const itemDesc = (item.description && item.description !== 'undefined') ? item.description : 'No description available.';

        res.send(`
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: 'Inter', sans-serif; background: #0d0d0d; color: #fff; margin: 0; padding: 20px; }
                    .wrapper { max-width: 600px; margin: 40px auto; }
                    .header-img { background: #141414; border: 1px solid #222; border-radius: 12px; padding: 40px; text-align: center; margin-bottom: 20px; }
                    .header-img img { width: 100%; max-width: 300px; border-radius: 8px; }
                    .status-banner { border: 1px solid #ff4444; color: #ff4444; padding: 12px; border-radius: 8px; text-align: center; font-weight: 800; margin-bottom: 20px; text-transform: uppercase; }
                    .info-section { background: #141414; border: 1px solid #222; border-radius: 12px; padding: 25px; margin-bottom: 15px; }
                    .label { font-size: 11px; color: #666; font-weight: 800; text-transform: uppercase; margin-bottom: 5px; }
                    .value { font-size: 22px; font-weight: 700; }
                </style>
            </head>
            <body>
                <div class="wrapper">
                    <div class="header-img"><img src="${item.thumbnail}"></div>
                    ${item.price === 0 ? '<div class="status-banner">Off-Sale Item</div>' : ''}
                    <h1>${item.name}</h1>
                    <p style="color: #888; margin-bottom: 30px;">${itemDesc}</p>
                    <div class="info-section">
                        <div class="label">Price</div>
                        <div class="value">${item.price > 0 ? item.price.toLocaleString() + ' Bricks' : 'Off-Sale'}</div>
                    </div>
                    <div class="info-section"><div class="label">Asset ID</div><div class="value">#${item.item_id}</div></div>
                    <a href="/" style="display:block; text-align:center; color:#555; text-decoration:none; margin-top:30px;">← Back</a>
                </div>
            </body>
            </html>
        `);
    } catch (err) { res.status(500).send("Error"); }
});

// Admin update page now includes Announcement editing
app.get('/internal/update', async (req, res) => {
    const ann = await pool.query('SELECT value FROM site_settings WHERE key = $1', ['announcement']);
    res.send(`
        <body style="background:#0d0d0d; color:white; font-family:sans-serif; text-align:center; padding:50px;">
            <h2>Admin Controls</h2>
            <form action="/internal/update-announcement" method="POST" style="margin-bottom:40px;">
                <input type="text" name="msg" value="${ann.rows[0].value}" style="width:70%; padding:10px;">
                <button type="submit">Update Banner Message</button>
            </form>
            <form action="/internal/save" method="POST">
                <textarea name="data" rows="10" style="width:80%; background:#141414; color:white; border:1px solid #333; padding:15px;"></textarea><br>
                <button type="submit" style="padding:15px 40px; margin-top:15px; background:#007bff; color:white; border:none; cursor:pointer;">Push Items</button>
            </form>
        </body>
    `);
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
