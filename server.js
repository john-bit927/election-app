const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const port = 5001;

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

// MySQL Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bincom_test',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  authPlugins: {
    mysql_clear_password: () => () => Buffer.from(''),
    caching_sha2_password: () => () => Buffer.from('')
  }
});

// Test connection
pool.getConnection((err) => {
  if (err) {
    console.error('Full MySQL Connection Error:', err.code, err.message);
  } else {
    console.log('MySQL Connected to bincom_test');
  }
});

// Parties (global for templates)
const PARTIES = ['PDP', 'DPP', 'ACN', 'PPA', 'CDC', 'JP', 'CPC', 'ANPP', 'ACCORD'];
app.locals.parties = PARTIES;
app.locals.PARTIES = PARTIES; // Added for consistency with lga_results template

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

app.get('/pu/:id', (req, res) => {
  const puId = req.params.id;
  if (!puId || isNaN(puId)) return res.status(400).send('Invalid PU ID');

  pool.query(
    `SELECT pu.uniqueid, pu.polling_unit_name, apr.party_abbreviation, apr.party_score 
     FROM polling_unit pu 
     LEFT JOIN announced_pu_results apr ON pu.uniqueid = apr.polling_unit_uniqueid 
     WHERE pu.uniqueid = ? 
     ORDER BY apr.party_abbreviation`,
    [puId],
    (err, results) => {
      if (err) {
        console.error('Query Error (PU):', err.message);
        return res.status(500).send('DB Query Failed');
      }
      const pu = results[0] || null;
      const resultsByParty = {};
      results.forEach(row => {
        if (row.party_abbreviation) resultsByParty[row.party_abbreviation] = row.party_score;
      });
      PARTIES.forEach(party => { if (!resultsByParty[party]) resultsByParty[party] = 0; });
      res.render('pu_results', { pu, results: resultsByParty, puId });
    }
  );
});

app.post('/pu', (req, res) => {
  const puId = req.body.pu_id;
  if (!puId || isNaN(puId)) return res.status(400).send('Invalid PU ID');
  res.redirect(`/pu/${puId}`);
});

// Q2: LGA Results
app.get('/lga', (req, res) => {
  const lgaId = req.query.lga_id;
  pool.query(
    'SELECT lga_id, lga_name FROM lga WHERE state_id = 25 ORDER BY lga_name',
    (err, lgas) => {
      if (err) {
        console.error('Query Error (LGAs):', err.message);
        return res.status(500).send('DB Query Failed');
      }
      let estimated = {}, official = {}, comparison = {};
      if (lgaId) {
        pool.query(
          `SELECT apr.party_abbreviation, SUM(apr.party_score) as total_score 
           FROM announced_pu_results apr 
           JOIN polling_unit pu ON apr.polling_unit_uniqueid = pu.uniqueid 
           WHERE pu.lga_id = ? 
           GROUP BY apr.party_abbreviation`,
          [lgaId],
          (err, puSums) => {
            if (err) {
              console.error('Query Error (Sum):', err.message);
              return res.status(500).send('DB Query Failed');
            }
            puSums.forEach(row => estimated[row.party_abbreviation] = row.total_score);

            pool.query(
              `SELECT party_abbreviation, party_score FROM announced_lga_results WHERE lga_id = ?`,
              [lgaId],
              (err, offResults) => {
                if (err) {
                  console.error('Query Error (Official):', err.message);
                  return res.status(500).send('DB Query Failed');
                }
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
                res.render('lga_results', { lgas, selectedLgaId: lgaId, estimated, official, comparison, parties: PARTIES });
              }
            );
          }
        );
      } else {
        res.render('lga_results', { lgas, selectedLgaId: null, estimated: {}, official: {}, comparison: {}, parties: PARTIES });
      }
    }
  );
});

// Q3: New PU Form
app.get('/new-pu', (req, res) => {
  const lgaId = req.query.lga_id;
  if (lgaId) {
    pool.query(
      `SELECT ward_id, ward_name FROM ward WHERE lga_id = ? ORDER BY ward_name`,
      [lgaId],
      (err, wards) => {
        if (err) {
          console.error('Query Error (Wards):', err.message);
          return res.json({ error: 'DB Query Failed' });
        }
        res.json({ wards });
      }
    );
    return;
  }
  pool.query(
    'SELECT lga_id, lga_name FROM lga WHERE state_id = 25 ORDER BY lga_name',
    (err, lgas) => {
      if (err) {
        console.error('Query Error (LGAs):', err.message);
        return res.status(500).send('DB Query Failed');
      }
      res.render('new_pu_form', { lgas, wards: [], parties: PARTIES });
    }
  );
});

app.post('/new-pu', async (req, res) => {
  console.log('New PU POST received:', req.body);
  const { lga_id, ward_id, pu_name } = req.body;
  if (!lga_id || !ward_id || !pu_name) {
    console.log('Missing fields');
    return res.json({ success: false, message: 'Missing fields' });
  }

  try {
    const [rows] = await pool.promise().query('SELECT COALESCE(MAX(uniqueid), 0) as maxId FROM polling_unit');
    const newId = rows[0].maxId + 1;
    console.log('New ID:', newId);

    await pool.promise().query(
      `INSERT INTO polling_unit (uniqueid, polling_unit_name, ward_id, lga_id, state_id) VALUES (?, ?, ?, ?, 25)`,
      [newId, pu_name, ward_id, lga_id]
    );
    console.log('PU inserted successfully');

    let successCount = 0;
    let errorParties = [];
    for (const party of PARTIES) {
      const score = parseInt(req.body[`score_${party}`]) || 0;
      try {
        await pool.promise().query(
          `INSERT INTO announced_pu_results (polling_unit_uniqueid, party_abbreviation, party_score) VALUES (?, ?, ?)`,
          [newId, party, score]
        );
        successCount++;
      } catch (err) {
        console.error(`Insert Error for ${party}:`, err.message);
        errorParties.push(party);
      }
    }

    if (errorParties.length > 0) {
      console.log('Partial save: Failed for', errorParties);
      res.json({ success: true, message: `New PU ${newId} saved, but failed for ${errorParties.join(', ')} parties.` });
    } else {
      console.log('All results inserted');
      res.json({ success: true, message: `New PU ${newId} saved with all results!` });
    }
  } catch (err) {
    console.error('New PU Error:', err.message);
    res.json({ success: false, message: 'Save failed: ' + err.message });
  }
});

// 404 Handler
app.use((req, res) => {
  console.log('404 for:', req.url);
  res.status(404).send(`
    <h1>404 - Page Not Found</h1>
    <p>The URL ${req.url} doesn't exist.</p>
    <a href="/">Go Home</a>
  `);
});


app.listen(port, () => console.log(`Server: http://localhost:${port} (MySQL Edition)`));