# Bincom Recruitment Test: Experienced JavaScript Developer

Full implementation using Express.js + MySQL for election results management.

## Quick Start
1. `npm install`
2. Import `dummy_bincom_test.sql` in phpMyAdmin (bincom_test DB).
3. `npm start`
4. Visit http://localhost:3000

## Features
- **Q1**: Load/display PU results (e.g., /pu/8).
- **Q2**: Select LGA, show summed PU estimates vs. official with differences.
- **Q3**: Chained form (LGA → Ward) to add new PU + party scores.

Dummy data: Delta State (25), 3 LGAs, 6 wards, 10 PUs, 9 parties.

## Deployment
- GitHub repo + Render.com (env vars for DB).

## Notes
- Stack: Express.js (experienced level).
- User-friendly: Bootstrap, AJAX, validation.
- Tested: Matches PDF sample (PU8 scores).

Submitted for Bincom role.