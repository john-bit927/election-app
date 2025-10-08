const express = require('express');
const mysql = require('mysql2/promise');  // Promise version
const bodyParser = require('body-parser');
const multer = require('multer');  // New: For multipart/form-data parsing
const path = require('path');

const app = express();
const port = 5000;

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

// Multer setup (for form fields only, no files)
const upload = multer();

// MySQL Pool (promise-enabled)
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',  // Blank for XAMPP; update if set
  database: 'bincom_test',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test connection (async)
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('MySQL Connected to bincom_test');
    connection.release();
  } catch (err) {
    console.error('MySQL Connection Error:', err.message);
  }
})();

// Parties
const PARTIES = ['PDP', 'DPP', 'ACN', 'PPA', 'CDC', 'JP', 'CPC', 'ANPP', 'ACCORD'];

// Global middleware to log content-type for debugging
app.use((req, res, next) => {
  if (req.method === 'POST') {
    console.log(`Incoming POST to ${req.path} with Content-Type: ${req.get('Content-Type')}`);
  }
  next();
});

// Routes
app.get('/', (req, res) => {
  res.render('index', {});
});

// Q1: PU Results
app.get('/pu', (req, res) => {
  const puId = req.query.pu_id;
  if (puId) return res.redirect(`/pu/${puId}`);
  res.render('pu_results', { pu: null, results: {}, puId: '' });
});

app.get('/pu/:id', async (req, res) => {
  try {
    const puId = req.params.id;
    if (!puId || isNaN(puId)) return res.status(400).send('Invalid PU ID');

    const [results] = await pool.execute(
      `SELECT pu.uniqueid, pu.polling_unit_name, apr.party_abbreviation, apr.party_score 
       FROM polling_unit pu 
       LEFT JOIN announced_pu_results apr ON pu.uniqueid = apr.polling_unit_uniqueid 
       WHERE pu.uniqueid = ? 
       ORDER BY apr.party_abbreviation`,
      [puId]
    );

    const pu = results[0] || null;
    const resultsByParty = {};
    results.forEach(row => {
      if (row.party_abbreviation) resultsByParty[row.party_abbreviation] = row.party_score;
    });
    PARTIES.forEach(party => { if (!resultsByParty[party]) resultsByParty[party] = 0; });
    res.render('pu_results', { pu, results: resultsByParty, puId });
  } catch (err) {
    console.error('Query Error (PU):', err.message);
    return res.status(500).send('DB Query Failed');
  }
});

app.post('/pu', (req, res) => {
  const puId = req.body.pu_id;
  if (!puId || isNaN(puId)) return res.status(400).send('Invalid PU ID');
  res.redirect(`/pu/${puId}`);
});

// Q2: LGA Results
app.get('/lga', async (req, res) => {
  try {
    const lgaId = req.query.lga_id;
    const [lgas] = await pool.execute(
      'SELECT lga_id, lga_name FROM lga WHERE state_id = 25 ORDER BY lga_name'
    );

    let estimated = {}, official = {}, comparison = {};
    if (lgaId) {
      const [puSums] = await pool.execute(
        `SELECT apr.party_abbreviation, SUM(apr.party_score) as total_score 
         FROM announced_pu_results apr 
         JOIN polling_unit pu ON apr.polling_unit_uniqueid = pu.uniqueid 
         WHERE pu.lga_id = ? 
         GROUP BY apr.party_abbreviation`,
        [lgaId]
      );
      puSums.forEach(row => estimated[row.party_abbreviation] = row.total_score);

      const [offResults] = await pool.execute(
        `SELECT party_abbreviation, party_score FROM announced_lga_results WHERE lga_id = ?`,
        [lgaId]
      );
      offResults.forEach(row => {
        official[row.party_abbreviation] = row.party_score;
        const est = estimated[row.party_abbreviation] || 0;
        comparison[row.party_abbreviation] = row.party_score - est;
      });
      PARTIES.forEach(party => {
        if (!estimated[party]) estimated[party] = 0;
        if (!official[party]) official[party] = 0;
        if (!comparison[party]) comparison[party] = 0;
      });
      res.render('lga_results', { lgas, selectedLgaId: lgaId, estimated, official, comparison, PARTIES });
    } else {
      res.render('lga_results', { lgas, selectedLgaId: null, estimated: {}, official: {}, comparison: {}, PARTIES });
    }
  } catch (err) {
    console.error('Query Error (LGAs):', err.message);
    return res.status(500).send('DB Query Failed');
  }
});

// Q3: New PU Form
app.get('/new-pu', async (req, res) => {
  try {
    const lgaId = req.query.lga_id;
    if (lgaId) {
      const [wards] = await pool.execute(
        `SELECT ward_id, ward_name FROM ward WHERE lga_id = ? ORDER BY ward_name`,
        [lgaId]
      );
      res.json({ wards });
      return;
    }
    const [lgas] = await pool.execute(
      'SELECT lga_id, lga_name FROM lga WHERE state_id = 25 ORDER BY lga_name'
    );
    res.render('new_pu_form', { lgas, wards: [], parties: PARTIES });
  } catch (err) {
    console.error('Query Error (LGAs):', err.message);
    return res.status(500).send('DB Query Failed');
  }
});

app.post('/new-pu', upload.none(), async (req, res) => {  // New: Multer parses multipart
  let connection;
  try {
    console.log('Received req.body:', req.body);  // Debug log

    const { lga_id, ward_id, pu_name } = req.body;
    if (!lga_id || !ward_id || !pu_name) {
      console.log('Missing fields detected:', { lga_id, ward_id, pu_name });
      return res.json({ success: false, message: 'Missing LGA, Ward, or PU Name' });
    }

    // Get connection for transaction
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Get next uniqueid
    const [maxRows] = await connection.execute('SELECT COALESCE(MAX(uniqueid), 0) as maxId FROM polling_unit');
    const newId = maxRows[0].maxId + 1;
    console.log(`Generated new PU ID: ${newId}`);  // Debug

    // Insert PU
    await connection.execute(
      `INSERT INTO polling_unit (uniqueid, polling_unit_name, ward_id, lga_id, state_id) 
       VALUES (?, ?, ?, ?, 25)`,
      [newId, pu_name, ward_id, lga_id]
    );
    console.log(`PU inserted: ${newId}`);  // Debug

    // Insert party results (with defaults to 0)
    const insertPromises = PARTIES.map(party => {
      const score = parseInt(req.body[`score_${party}`]) || 0;
      return connection.execute(
        `INSERT INTO announced_pu_results (polling_unit_uniqueid, party_abbreviation, party_score) 
         VALUES (?, ?, ?)`,
        [newId, party, score]
      ).then(() => console.log(`Party inserted: ${party} = ${score}`))  // Debug
        .catch(err => {
          console.error(`Insert Error (${party}):`, err.message);
          throw err;  // Re-throw to trigger rollback
        });
    });

    await Promise.all(insertPromises);

    await connection.commit();
    console.log(`Transaction committed for PU ${newId}`);  // Debug

    res.json({ success: true, message: `New PU ${newId} saved!` });

  } catch (err) {
    console.error('New PU Error:', err.message);  // Catch-all log
    if (connection) {
      await connection.rollback();
      console.log('Transaction rolled back');
    }
    res.json({ success: false, message: `Save failed: ${err.message}` });
  } finally {
    if (connection) connection.release();
  }
});

// 404 Handler
app.use((req, res) => {
  console.log('404 for:', req.url);
  res.status(404).send(`
    <div class="container mt-5 text-center">
      <h1 class="display-1 text-muted"><i class="fas fa-ghost"></i></h1>
      <h2>404 - Page Not Found</h2>
      <p>The URL ${req.url} doesn't exist.</p>
      <a href="/" class="btn btn-primary">Go Home</a>
    </div>
  `);
});

app.listen(port, () => console.log(`Server: http://localhost:${port} (MySQL Edition)`));