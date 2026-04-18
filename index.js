const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Setup with safety checks for new columns
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
                is_limited BOOLEAN DEFAULT FALSE,
                recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`ALTER TABLE item_prices ADD COLUMN IF NOT EXISTS is_limited BOOLEAN DEFAULT FALSE;`).catch(() => {});
    } catch (err) { console.log("Init sequence complete."); }
}
initDb();

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Helper for Modern Footer
const FOOTER_HTML = `
    <footer style="margin-top: 80px; padding: 60px 20px; border-top: 1px solid #222; text-align: center; background: #0a0a0a;">
        <div style="margin-bottom: 20px;">
            <a href="#" style="color: #666; margin: 0 15px; text-decoration: none; font-size: 14px;">Discord</a>
            <a href="#" style="color: #666; margin: 0 15px; text-decoration: none; font-size: 14px;">Twitter</a>
            <a href="/internal/update" style="color: #444; margin: 0 15px; text-decoration: none; font-size: 14px;">Admin</a>
        </div>
        <p style="color: #444; font-size: 12px;">&copy; 2026 Richard F. | Polytoria Project Properties</p>
        <p style="color: #333; font-size: 11px; margin-top: 10px;">Not affiliated with Polytoria.</p>
    </footer>
`;

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Modern Item Page
app.get('/store/:id', async (req, res) => {
    try {
        const itemId = req.params.id;
        const history = await pool.query('SELECT * FROM item_prices WHERE item_id = $1 ORDER BY recorded_at ASC', [itemId]);
        if (history.rows.length === 0) return res.status(404).send("Item not found.");
        
        const latest = history.rows[history.rows.length - 1];
        const chartLabels = history.rows.map(r => new Date(r.recorded_at).toLocaleDateString());
        const chartData = history.rows.map(r => r.rap);

        res.send(`
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
                <style>
                    body { font-family: 'Inter', sans-serif; background: #0d0d0d; color: #fff; margin: 0; padding: 20px; }
                    .wrapper { max-width: 1100px; margin: 40px auto; }
                    .main-card { background: #141414; border: 1px solid #222; border-radius: 16px; display: flex; flex-wrap: wrap; gap: 40px; padding: 40px; }
                    .item-view { flex: 1; min-width: 300px; text-align: center; }
                    .item-view img { width: 100%; max-width: 300px; background: #1a1a1a; border-radius: 12px; padding: 20px; border: 1px solid #282828; }
                    .stats-view { flex: 1.5; min-width: 300px; }
                    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 25px 0; }
                    .stat-box { background: #1a1a1a; border: 1px solid #282828; padding: 20px; border-radius: 12px; }
                    .stat-label { font-size: 11px; color: #666; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
                    .stat-value { font-size: 22px; font-weight: 700; margin-top: 5px; color: #fff; }
                    .btn-main { display: block; text-align: center; background: #007bff; color: white; text-decoration: none; padding: 18px; border-radius: 10px; font-weight: bold; font-size: 16px; margin-top: 20px; transition: 0.3s; }
                    .btn-main:hover { background: #0056b3; transform: translateY(-2px); }
                    .chart-section { background: #141414; border: 1px solid #222; border-radius: 16px; padding: 30px; margin-top: 30px; }
                </style>
            </head>
            <body>
                <div class="wrapper">
                    <div class="main-card">
                        <div class="item-view">
                            <img src="${latest.thumbnail}">
                            <h1 style="font-size: 32px; margin: 25px 0 10px 0;">${latest.name}</h1>
                            <div style="color: #666; font-size: 14px;">Asset ID: #${latest.item_id}</div>
                        </div>
                        <div class="stats-view">
                            <div class="stat-grid">
                                <div class="stat-box"><div class="stat-label">Value</div><div class="stat-value" style="color:#2ecc71;">${latest.price.toLocaleString()}</div></div>
                                <div class="stat-box"><div class="stat-label">RAP</div><div class="stat-value">${latest.rap.toLocaleString()}</div></div>
                                <div class="stat-box"><div class="stat-label">Demand</div><div class="stat-value" style="color:#f1c40f;">High</div></div>
                                <div class="stat-box"><div class="stat-label">Trend</div><div class="stat-value" style="color:#3498db;">Stable</div></div>
                            </div>
                            <a href="https://polytoria.com/store/${latest.item_id}" class="btn-main">View on Polytoria</a>
                            <a href="/" style="display:block; text-align:center; margin-top:20px; color:#555; text-decoration:none; font-size:14px;">← Back to Market</a>
                        </div>
                    </div>
                    <div class="chart-section">
                        <div class="stat-label" style="margin-bottom: 20px;">Price History</div>
                        <canvas id="itemChart" height="120"></canvas>
                    </div>
                </div>
                ${FOOTER_HTML}
                <script>
                    const ctx = document.getElementById('itemChart').getContext('2d');
                    new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: ${JSON.stringify(chartLabels)},
                            datasets: [{
                                label: 'RAP',
                                data: ${JSON.stringify(chartData)},
                                borderColor: '#007bff',
                                backgroundColor: 'rgba(0, 123, 255, 0.05)',
                                fill: true,
                                tension: 0.4,
                                pointRadius: 5
                            }]
                        },
                        options: {
                            plugins: { legend: { display: false } },
                            scales: { 
                                y: { grid: { color: '#222' }, ticks: { color: '#555' } },
                                x: { grid: { display: false }, ticks: { color: '#555' } }
                            }
                        }
                    });
                </script>
            </body>
            </html>
        `);
    } catch (err) { res.status(500).send("Error"); }
});

app.get('/api/prices', async (req, res) => {
    try {
        const onlyLimited = req.query.limited === 'true';
        let query = `SELECT t1.* FROM item_prices t1 JOIN (SELECT item_id, MAX(id) as last_id FROM item_prices GROUP BY item_id) t2 ON t1.id = t2.last_id`;
        if (onlyLimited) { query += ` WHERE (t1.rap > 0 OR t1.is_limited = TRUE)`; }
        query += ` ORDER BY t1.recorded_at DESC`;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) { res.json([]); }
});

app.get('/internal/update', (req, res) => {
    res.send(`
        <body style="background:#0d0d0d; color:white; font-family:sans-serif; text-align:center; padding:100px;">
            <div style="max-width:500px; margin:auto; background:#141414; padding:40px; border-radius:12px; border:1px solid #222;">
                <h2>System Sync</h2>
                <form action="/internal/save" method="POST">
                    <textarea name="data" rows="10" style="width:100%; background:#0d0d0d; color:white; border:1px solid #333; border-radius:8px; padding:15px; margin-bottom:20px;"></textarea>
                    <button type="submit" style="width:100%; background:#007bff; color:white; border:none; padding:15px; border-radius:8px; cursor:pointer; font-weight:bold;">Push Data</button>
                </form>
            </div>
        </body>
    `);
});

app.post('/internal/save', async (req, res) => {
    try {
        const rawData = JSON.parse(req.body.data);
        const items = rawData.items || rawData.assets || rawData.data || (Array.isArray(rawData) ? rawData : []);
        for (let item of items) {
            const itemId = item.id || item.assetId || 0;
            const thumb = item.thumbnail || `https://c0.ptacdn.com/thumbnails/assets/${itemId}-icon.png`;
            const isLim = item.rap > 0 || item.isLimited === true;
            await pool.query(
                'INSERT INTO item_prices (item_id, name, price, rap, thumbnail, is_limited) VALUES ($1, $2, $3, $4, $5, $6)',
                [itemId, item.name || 'Unknown', item.price || 0, item.rap || 0, thumb, isLim]
            );
        }
        res.send("Sync successful! <a href='/'>Return Home</a>");
    } catch (err) { res.send("Error: " + err.message); }
});

app.listen(process.env.PORT || 3000);
