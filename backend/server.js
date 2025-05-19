require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const mysql = require('mysql2/promise');

const app = express();
const upload = multer();
const PORT = process.env.PORT || 3000;
const FM_ENDPOINT = 'https://fmapi.net/api/v2/image';

app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

app.post('/api/v2/image', upload.single('file'), async (req, res) => {
  try {

    const apiKey = req.header('Authorization') || req.query.apiKey;
    if (!apiKey) return res.status(401).json({ error: 'Missing API key' });

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const filename = req.file.originalname;

    const form = new FormData();
    form.append('file', req.file.buffer, filename);
    form.append('metadata', JSON.stringify({ name: filename }));

    const fmRes = await axios.post(FM_ENDPOINT, form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': apiKey,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const { id: fmId, url: fmUrl } = fmRes.data.data;

    await pool.query(
      'INSERT INTO images (api_key, filename, fm_id, fm_url) VALUES (?, ?, ?, ?)',
      [apiKey, filename, fmId, fmUrl]
    );

    const publicUrl = `${req.protocol}://${req.get('host')}/${encodeURIComponent(apiKey)}/${encodeURIComponent(filename)}`;
    return res.json({ data: { id: fmId, url: publicUrl }, status: 'ok' });
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.get('/api/v2/getimage', async (req, res) => {
  try {
    const apiKey = req.header('Authorization') || req.query.apiKey;
    if (!apiKey) return res.status(401).json({ error: 'Missing API key' });

    const [rows] = await pool.query(
      'SELECT filename, fm_url, created_at FROM images WHERE api_key = ? ORDER BY created_at DESC',
      [apiKey]
    );

    const data = rows.map(r => ({
      filename:  r.filename,
      url:       `${req.protocol}://${req.get('host')}/${encodeURIComponent(apiKey)}/${encodeURIComponent(r.filename)}`,
      fm_url:    r.fm_url,
      createdAt: r.created_at
    }));
    return res.json({ status: 'ok', data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/:apiKey/:filename', async (req, res) => {
  try {
    const { apiKey, filename } = req.params;
    const [rows] = await pool.query(
      'SELECT fm_url FROM images WHERE api_key = ? AND filename = ? ORDER BY created_at DESC LIMIT 1',
      [apiKey, filename]
    );
    if (!rows.length) return res.status(404).send('Not found');
    return res.redirect(rows[0].fm_url);
  } catch (err) {
    console.error(err.message);
    return res.status(500).send('Server error');
  }
});

app.delete('/api/v2/image/:filename', async (req, res) => {
  try {
    const apiKey = req.header('Authorization') || req.query.apiKey;
    if (!apiKey) return res.status(401).json({ error: 'Missing API key' });
    const { filename } = req.params;

    const [rows] = await pool.query(
      'SELECT fm_id FROM images WHERE api_key = ? AND filename = ? LIMIT 1',
      [apiKey, filename]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const fmId = rows[0].fm_id;

    await axios.delete(`https://fmapi.net/api/image/delete/${fmId}`, {
      headers: { Authorization: apiKey }
    });
    await pool.query('DELETE FROM images WHERE api_key = ? AND filename = ?', [apiKey, filename]);

    return res.json({ status: 'deleted' });
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
