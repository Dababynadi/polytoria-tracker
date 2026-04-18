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
                is_limited BOOLEAN DEFAULT FALSE,
                recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`ALTER TABLE item_prices ADD COLUMN IF NOT EXISTS is_limited BOOLEAN DEFAULT FALSE;`).catch(() => {});
    } catch (err) { console.log("DB Ready"); }
}
initDb();

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// FIXED API: Explicitly filters by RAP or the is_limited flag
app.get('/api/prices', async (req, res) => {
    try {
        const onlyLimited = req.query.limited === 'true';
        const search = req.query.search ? req.query.search.toLowerCase() : '';
        
        let query = `
            SELECT t1.* FROM item_prices t1 
            JOIN (SELECT item_id, MAX(id) as last_id FROM item_prices GROUP BY item_id) t2 
            ON t1.id = t2.last_id
            WHERE 1=1
        `;
        
        const params = [];
        if (onlyLimited) {
            // A limited is defined as having RAP > 0 OR being manually flagged
            query += ` AND (t1.rap > 0 OR t1.is_limited = TRUE)`;
        }
        if (search) {
            params.push(`%${search}%`);
            query += ` AND LOWER(t1.name) LIKE $${params.length}`;
        }
        
        query += ` ORDER BY t1.recorded_at DESC`;
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) { 
        console.error(err);
        res.json([]); 
    }
});

// Individual Item Page
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
                    body { font-family: sans-serif; background: #0b0b0b; color: #eee; margin: 0; padding: 20px; }
                    .container { max-width: 900px; margin: auto; }
                    .card { background: #161616; border: 1px solid #2a2a2a; border-radius: 12px; padding: 25px; margin-bottom: 20px; }
                    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
                    .stat-box { background: #111; padding: 15px; border-radius: 8px; border: 1px solid #222; }
                    .label { font-size: 11px; color: #666; font-weight: bold; text-transform: uppercase; }
                    .value { font-size: 20px; font-weight: bold; margin-top: 5px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="card" style="text-align:center;">
                        <img src="${latest.thumbnail}" width="200">
                        <h1>${latest.name}</h1>
                        <p style="color:#555">ID: #${latest.item_id}</p>
                    </div>
                    <div class="stat-grid">
                        <div class="stat-box"><div class="label">Price</div><div class="value" style="color:#2ecc71">${latest.price.toLocaleString()}</div></div>
                        <div class="stat-box"><div class="label">RAP</div><div class="value">${latest.rap.toLocaleString()}</div></div>
                    </div>
                    <div class="card" style="margin-top:20px;">
                        <canvas id="myChart"></canvas>
                    </div>
                    <a href="/" style="color:#666; text-decoration:none; display:block; text-align:center; margin-top:20px;">← Back</a>
                </div>
                <script>
                    new Chart(document.getElementById('myChart'), {
                        type: 'line',
                        data: {
                            labels: ${JSON.stringify(chartLabels)},
                            datasets: [{ label: 'RAP', data: ${JSON.stringify(chartData)}, borderColor: '#007bff', tension: 0.3, fill: true }]
                        }
                    });
                </script>
            </body>
            </html>
        `);
    } catch (err) { res.status(500).send("Error"); }
});

app.get('/internal/update', (req, res) => {
    res.send(`
        <body style="background:#0b0b0b; color:white; text-align:center; padding:50px;">
            <form action="/internal/save" method="POST">
                <textarea name="data" rows="10" style="width:80%; background:#161616; color:white; border:1px solid #333;"></textarea><br>
                <button type="submit" style="padding:10px 30px; margin-top:10px;">Sync Items</button>
            </form>
        </body>
    `);
});

app.post('/internal/save', async (req, res) => {
    try {
        const rawData = JSON.parse(req.body.data);
        const items = rawData.items || rawData.assets || rawData.data || (Array.isArray(rawData) ? rawData : []);
        for (let item of items) {
            const isLim = (item.rap > 0) || (item.isLimited === true);
            await pool.query(
                'INSERT INTO item_prices (item_id, name, price, rap, thumbnail, is_limited) VALUES ($1, $2, $3, $4, $5, $6)',
                [item.id || item.assetId, item.name, item.price || 0, item.rap || 0, item.thumbnail || '', isLim]
            );
        }
        res.send("Sync Complete. <a href='/'>Home</a>");
    } catch (err) { res.send("Error: " + err.message); }
});

app.listen(process.env.PORT || 3000);
