const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const path = require('path');
const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/prices', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM item_prices ORDER BY recorded_at DESC LIMIT 60');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/internal/update', async (req, res) => {
    try {
        const response = await axios.get('https://api.polytoria.com/v1/store/items?isLimited=true');
        const items = response.data.items;
        for (let item of items) {
            await pool.query(
                'INSERT INTO item_prices (item_id, name, price, rap) VALUES ($1, $2, $3, $4)',
                [item.id, item.name, item.price, item.rap]
            );
        }
        res.send("Update successful");
    } catch (err) {
        res.status(500).send("Update failed");
    }
});

app.listen(process.env.PORT || 3000);
