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
                rap INT,
                thumbnail TEXT,
                recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
    } catch (err) { console.log("DB Ready"); }
}
initDb();

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- ROUTES ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Fixed API: This version avoids the 'Status 1' error by using a standard GROUP BY
app.get('/api/prices', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM item_prices 
            WHERE id IN (SELECT MAX(id) FROM item_prices GROUP BY item_id)
            AND rap > 0
            ORDER BY recorded_at DESC
        `);
        res.json(result.rows);
    } catch (err) { 
        console.error(err);
        res.json([]); 
    }
});

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
                    body { font-family: 'Inter', sans-serif; background: #0b0b0b; color: #eee; margin: 0; padding: 20px; }
                    .container { max-width: 1000px; margin: 20px auto; }
                    .main-layout { display: grid; grid-template-columns: 1fr 1.5fr; gap: 20px; }
                    .card { background: #161616; border: 1px solid #2a2a2a; border-radius: 12px; padding: 25px; }
                    .img-container { text-align: center; background: #111; border-radius: 8px; padding: 20px; margin-bottom: 15px; }
                    .img-container img { width: 220px; height: 220px; object-fit: contain; }
                    .info-box { background: #111; border: 1px solid #222; padding: 15px; border-radius: 8px; margin-bottom: 15px; }
                    .label { font-size: 11px; color: #777; font-weight: bold; text-transform: uppercase; }
                    .value { font-size: 18px; font-weight: bold; margin-top: 5px; }
                    .chart-card { background: #161616; border: 1px solid #2a2a2a; border-radius: 12px; padding: 25px; margin-top: 20px; }
                    .btn-buy { display: block; text-align: center; background: #007bff; color: white; border: none; padding: 15px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 10px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="main-layout">
                        <div class="card">
                            <div class="img-container"><img src="${latest.thumbnail}"></div>
                            <h2 style="margin:0;">${latest.name}</h2>
                            <a href="https://polytoria.com/store/${latest.item_id}" target="_blank" class="btn-buy">View on Polytoria</a>
                        </div>
                        <div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                                <div class="info-box"><div class="label">Value</div><div class="value">${latest.price.toLocaleString()}</div></div>
                                <div class="info-box"><div class="label">Recent Avg (RAP)</div><div class="value">${latest.rap.toLocaleString()}</div></div>
                            </div>
                            <div class="card" style="margin-top:10px;">
                                <div class="label">Status</div>
                                <div style="color:#2ecc71; font-weight:bold; margin-top:5px;">Limited / Collectible</div>
                            </div>
                        </div>
                    </div>
                    <div class="chart-card">
                        <canvas id="rapChart"></canvas>
                    </div>
                </div>
                <script>
                    const ctx = document.getElementById('rapChart').getContext('2d');
                    new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: ${JSON.stringify(chartLabels)},
                            datasets: [{
                                label: 'RAP',
                                data: ${JSON.stringify(chartData)},
                                borderColor: '#007bff',
                                backgroundColor: 'rgba(0, 123, 255, 0.1)',
                                fill: true,
                                tension: 0.3
                            }]
                        },
                        options: { responsive: true, plugins: { legend: { display: false } } }
                    });
                </script>
            </body>
            </html>
        `);
    } catch (err) { res.status(500).send("Error"); }
});

app.get('/internal/update', (req, res) => {
    res.send(`
        <html><body style="background:#0b0b0b; color:white; font-family:sans-serif; text-align:center; padding:50px;">
            <h2>Sync Market Data</h2>
            <form action="/internal/save" method="POST">
                <textarea name="data" rows="10" style="width:100%; max-width:500px; background:#161616; color:white; border:1px solid #333; padding:10px;"></textarea><br>
                <button type="submit" style="margin-top:20px; padding:15px 40px; background:#007bff; color:white; border:none; border-radius:8px; font-weight:bold;">SYNC NOW</button>
            </form>
        </body></html>
    `);
});

app.post('/internal/save', async (req, res) => {
    try {
        const rawData = JSON.parse(req.body.data);
        const items = rawData.items || rawData.assets || rawData.data || (Array.isArray(rawData) ? rawData : []);
        for (let item of items) {
            // ONLY SAVE IF IT HAS A RAP (Filter for Limiteds)
            if (item.rap > 0) {
                const itemId = item.id || item.assetId || 0;
                const thumb = item.thumbnail || `https://c0.ptacdn.com/thumbnails/assets/${itemId}-icon.png`;
                await pool.query(
                    'INSERT INTO item_prices (item_id, name, price, rap, thumbnail) VALUES ($1, $2, $3, $4, $5)',
                    [itemId, item.name || 'Unknown', item.price || 0, item.rap || 0, thumb]
                );
            }
        }
        res.send("Sync Complete! <a href='/'>Go Home</a>");
    } catch (err) { res.send("Error: " + err.message); }
});

app.listen(process.env.PORT || 3000);
