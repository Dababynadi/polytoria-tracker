const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// CRASH-PROOF DATABASE INIT
async function initDb() {
    try {
        // 1. Create table if missing
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
        // 2. Double check is_limited exists (prevents Status 1 crash)
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='item_prices' AND column_name='is_limited') THEN
                    ALTER TABLE item_prices ADD COLUMN is_limited BOOLEAN DEFAULT FALSE;
                END IF;
            END $$;
        `);
        console.log("DB Connection Success.");
    } catch (err) { 
        console.error("Critical DB Error:", err); 
    }
}
initDb();

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// SIMPLEST POSSIBLE SQL TO PREVENT STATUS 1
app.get('/api/prices', async (req, res) => {
    try {
        const onlyLimited = req.query.limited === 'true';
        
        // This is a standard query that won't crash Render
        let query = `
            SELECT t1.* FROM item_prices t1
            JOIN (SELECT item_id, MAX(id) as last_id FROM item_prices GROUP BY item_id) t2
            ON t1.id = t2.last_id
        `;
        
        if (onlyLimited) {
            query += ` WHERE (t1.rap > 0 OR t1.is_limited = TRUE)`;
        }
        
        query += ` ORDER BY t1.recorded_at DESC LIMIT 100`;
        
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) { 
        console.error("API Error:", err);
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
                <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
                <style>
                    body { font-family: sans-serif; background: #0b0b0b; color: #eee; padding: 20px; }
                    .card { background: #161616; border: 1px solid #333; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
                    .btn { background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; }
                </style>
            </head>
            <body>
                <div class="card">
                    <img src="${latest.thumbnail}" width="150">
                    <h1>${latest.name}</h1>
                    <p>RAP: ${latest.rap.toLocaleString()}</p>
                    <a href="/" style="color: #666;">← Back</a>
                </div>
                <div class="card">
                    <canvas id="myChart"></canvas>
                </div>
                <script>
                    new Chart(document.getElementById('myChart'), {
                        type: 'line',
                        data: {
                            labels: ${JSON.stringify(chartLabels)},
                            datasets: [{ label: 'RAP', data: ${JSON.stringify(chartData)}, borderColor: '#007bff', fill: true }]
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
        <body style="background:#0b0b0b; color:white; text-align:center;">
            <form action="/internal/save" method="POST">
                <textarea name="data" rows="10" style="width:80%;"></textarea><br>
                <button type="submit">Sync Data</button>
            </form>
        </body>
    `);
});

app.post('/internal/save', async (req, res) => {
    try {
        const rawData = JSON.parse(req.body.data);
        const items = rawData.items || rawData.assets || rawData.data || (Array.isArray(rawData) ? rawData : []);
        for (let item of items) {
            const isLim = item.rap > 0 || item.isLimited === true;
            await pool.query(
                'INSERT INTO item_prices (item_id, name, price, rap, thumbnail, is_limited) VALUES ($1, $2, $3, $4, $5, $6)',
                [item.id || 0, item.name || '?', item.price || 0, item.rap || 0, item.thumbnail || '', isLim]
            );
        }
        res.send("Done! <a href='/'>Home</a>");
    } catch (err) { res.send("Error: " + err.message); }
});

app.listen(process.env.PORT || 3000);
