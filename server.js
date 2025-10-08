const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const port = 8000;

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
    console.error('MySQL Connection Error:', err.message);
  } else {
    console.log('MySQL Connected to bincom_test');
  }
});

// Parties
const PARTIES = ['PDP', 'DPP', 'ACN', 'PPA', 'CDC', 'JP', 'CPC', 'ANPP', 'ACCORD'];

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
                // Pass PARTIES here
                res.render('lga_results', { lgas, selectedLgaId: lgaId, estimated, official, comparison, PARTIES });
              }
            );
          }
        );
      } else {
        // Pass PARTIES here too (for the initial load without LGA selected)
        res.render('lga_results', { lgas, selectedLgaId: null, estimated: {}, official: {}, comparison: {}, PARTIES });
      }
    }
  );
});

// Q3: New PU Form
app.get('/new-pu', (req, res) => {
    console.log('Received req.body:', req.body);  // Add this line
  const lgaId = req.query.lga_id;
  if (lgaId) {
    pool.query(
      `SELECT ward_id, ward_name FROM ward WHERE lga_id = ? ORDER BY ward_name`,
      [lgaId],
      (err, wards) => {
        if (err) {
          console.error('Query Error (Wards):', err.message);
          console.log('Missing fields detected:', { lga_id, ward_id, pu_name });  // Add this
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

app.post('/new-pu', (req, res) => {
  const { lga_id, ward_id, pu_name } = req.body;
  if (!lga_id || !ward_id || !pu_name) return res.json({ success: false, message: 'Missing fields' });

  pool.query(
    'SELECT COALESCE(MAX(uniqueid), 0) as maxId FROM polling_unit',
    (err, rows) => {
      if (err) {
        console.error('Query Error (Max ID):', err.message);
        return res.json({ success: false, message: 'DB Error' });
      }
      const newId = rows[0].maxId + 1;

      pool.query(
        `INSERT INTO polling_unit (uniqueid, polling_unit_name, ward_id, lga_id, state_id) 
         VALUES (?, ?, ?, ?, 25)`,
        [newId, pu_name, ward_id, lga_id],
        (err) => {
          if (err) {
            console.error('Insert Error (PU):', err.message);
            return res.json({ success: false, message: 'PU insert failed' });
          }

          let insertCount = 0;
          PARTIES.forEach(party => {
            const score = parseInt(req.body[`score_${party}`]) || 0;
            pool.query(
              `INSERT INTO announced_pu_results (polling_unit_uniqueid, party_abbreviation, party_score) 
               VALUES (?, ?, ?)`,
              [newId, party, score],
              (err) => {
                if (err) console.error(`Insert Error (${party}):`, err.message);
                insertCount++;
                if (insertCount === PARTIES.length) {
                  res.json({ success: true, message: `New PU ${newId} saved!` });
                }
              }
            );
          });
        }
      );
    }
  );
});

// 404 Handler (Fixes "Not Found" errors)
app.use((req, res) => {
  console.log('404 for:', req.url);  // Log to terminal for debug
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