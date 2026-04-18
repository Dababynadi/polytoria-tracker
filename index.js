const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Database Setup
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
    } catch (err) { console.log("DB Init Check Done."); }
}
initDb();

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Helper for Footer
const FOOTER_HTML = `
    <footer style="margin-top: 50px; padding: 40px 20px; border-top: 1px solid #333; color: #888; text-align: center; font-size: 14px;">
        <div style="margin-bottom: 20px;">
            <a href="#" style="color: #bbb; margin: 0 10px; text-decoration: none;">Discord</a>
            <a href="#" style="color: #bbb; margin: 0 10px; text-decoration: none;">GitHub</a>
        </div>
        <p>Not associated with the <a href="https://polytoria.com" style="color: #007bff; text-decoration: none;">Polytoria</a> team</p>
        <p style="font-size: 12px; opacity: 0.6;">&copy; 2026 Richard F. Projects</p>
    </footer>
`;

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Item Page (Dark Mode Style)
app.get('/store/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM item_prices WHERE item_id = $1 ORDER BY recorded_at DESC LIMIT 1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).send("Item not found.");
        const item = result.rows[0];

        res.send(`
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: 'Inter', sans-serif; background: #0f0f0f; color: white; margin: 0; padding: 20px; }
                    .container { max-width: 900px; margin: 40px auto; background: #1a1a1a; border-radius: 12px; border: 1px solid #333; overflow: hidden; }
                    .header-img { width: 100%; background: #252525; padding: 40px 0; text-align: center; border-bottom: 1px solid #333; }
                    .header-img img { width: 250px; height: 250px; object-fit: contain; }
                    .content { padding: 30px; }
                    .tag { color: #888; font-size: 14px; text-transform: capitalize; }
                    h1 { margin: 10px 0 20px 0; font-size: 28px; }
                    .box { background: #111; border: 1px solid #333; padding: 20px; border-radius: 8px; margin-bottom: 15px; }
                    .box-label { color: #888; font-size: 12px; font-weight: bold; margin-bottom: 5px; }
                    .box-value { font-size: 20px; font-weight: bold; }
                    .btn-buy { display: block; text-align: center; background: #333; color: white; text-decoration: none; padding: 15px; border-radius: 6px; font-weight: bold; margin-top: 20px; border: 1px solid #444; }
                    .btn-buy:hover { background: #444; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header-img">
                        <img src="${item.thumbnail}" onerror="this.src='https://polytoria.com/assets/img/icon.png'">
                    </div>
                    <div class="content">
                        <div class="tag">Collectible Item</div>
                        <h1>${item.name}</h1>
                        <div class="box">
                            <div class="box-label">VALUE</div>
                            <div class="box-value">${item.price.toLocaleString()} Bricks</div>
                        </div>
                        <div style="display: flex; gap: 15px;">
                            <div class="box" style="flex: 1;">
                                <div class="box-label">RECENT AVERAGE</div>
                                <div class="box-value">${item.rap.toLocaleString()}</div>
                            </div>
                            <div class="box" style="flex: 1;">
                                <div class="box-label">ASSET ID</div>
                                <div class="box-value">#${item.item_id}</div>
                            </div>
                        </div>
                        <a href="https://polytoria.com/store/${item.item_id}" target="_blank" class="btn-buy">View on Polytoria</a>
                        <a href="/" style="display: block; text-align: center; margin-top: 20px; color: #888; text-decoration: none;">← Back to Catalog</a>
                    </div>
                </div>
                ${FOOTER_HTML}
            </body>
            </html>
        `);
    } catch (err) { res.status(500).send("Error"); }
});

app.get('/api/prices', async (req, res) => {
    try {
        const result = await pool.query('SELECT DISTINCT ON (item_id) * FROM item_prices ORDER BY item_id, recorded_at DESC');
        res.json(result.rows);
    } catch (err) { res.json([]); }
});

app.get('/internal/update', (req, res) => {
    res.send(`
        <html><body style="background:#0f0f0f; color:white; font-family:sans-serif; text-align:center; padding:50px;">
            <h2>Sync Market Data</h2>
            <form action="/internal/save" method="POST">
                <textarea name="data" rows="10" style="width:100%; max-width:500px; background:#1a1a1a; color:white; border:1px solid #333; border-radius:8px; padding:10px;"></textarea><br>
                <button type="submit" style="margin-top:20px; padding:15px 40px; background:#007bff; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold;">SYNC NOW</button>
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
            const thumb = item.thumbnail || `https://c0.ptacdn.com/thumbnails/assets/${itemId}-icon.png`;
            await pool.query(
                'INSERT INTO item_prices (item_id, name, price, rap, thumbnail) VALUES ($1, $2, $3, $4, $5)',
                [itemId, item.name || 'Unknown', item.price || 0, item.rap || 0, thumb]
            );
        }
        res.send("Successfully Sync'd! <a href='/'>Go Home</a>");
    } catch (err) { res.send("Error: " + err.message); }
});

app.listen(process.env.PORT || 3000);
