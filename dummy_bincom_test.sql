-- Dummy Database for Bincom Recruitment Test (MySQL Version - Idempotent)
-- Delta State (state_id=25) Only, 2011 Elections
-- 3 LGAs, 6 Wards, 10 PUs, 9 Parties, Matches PDF (PU8 exact)

USE bincom_test;

-- Table: states
CREATE TABLE IF NOT EXISTS states (
    state_id INT PRIMARY KEY,
    state_name VARCHAR(100)
);

INSERT IGNORE INTO states (state_id, state_name) VALUES (25, 'Delta State');

-- Table: lga
CREATE TABLE IF NOT EXISTS lga (
    lga_id INT PRIMARY KEY,
    lga_name VARCHAR(100),
    state_id INT,
    FOREIGN KEY (state_id) REFERENCES states(state_id)
);

INSERT IGNORE INTO lga (lga_id, lga_name, state_id) VALUES
(1, 'Aniocha North', 25),
(2, 'Aniocha South', 25),
(3, 'Bomadi', 25);

-- Table: ward
CREATE TABLE IF NOT EXISTS ward (
    ward_id INT PRIMARY KEY,
    ward_name VARCHAR(100),
    lga_id INT,
    state_id INT,
    FOREIGN KEY (lga_id) REFERENCES lga(lga_id),
    FOREIGN KEY (state_id) REFERENCES states(state_id)
);

INSERT IGNORE INTO ward (ward_id, ward_name, lga_id, state_id) VALUES
(1, 'Isiagu Ward', 1, 25),
(2, 'Obomkpa Ward', 1, 25),
(3, 'Ubulu-Okiti Ward', 2, 25),
(4, 'Issele-Ukwu Ward', 2, 25),
(5, 'Ogriagba Ward', 3, 25),
(6, 'Koko Ward', 3, 25);

-- Table: polling_unit
CREATE TABLE IF NOT EXISTS polling_unit (
    uniqueid INT PRIMARY KEY,
    polling_unit_name VARCHAR(200),
    ward_id INT,
    lga_id INT,
    state_id INT,
    FOREIGN KEY (ward_id) REFERENCES ward(ward_id),
    FOREIGN KEY (lga_id) REFERENCES lga(lga_id),
    FOREIGN KEY (state_id) REFERENCES states(state_id)
);

INSERT IGNORE INTO polling_unit (uniqueid, polling_unit_name, ward_id, lga_id, state_id) VALUES
(1, 'PU 001 - Central School', 1, 1, 25),
(2, 'PU 002 - Community Hall', 1, 1, 25),
(3, 'PU 003 - Market Square', 2, 1, 25),
(4, 'PU 004 - Health Center', 3, 2, 25),
(5, 'PU 005 - Primary School A', 3, 2, 25),
(6, 'PU 006 - Primary School B', 4, 2, 25),
(7, 'PU 007 - Village Hall', 5, 3, 25),
(8, 'PU 008 - Test PU (Sample from PDF)', 5, 3, 25),
(9, 'PU 009 - River Side', 6, 3, 25),
(10, 'PU 010 - Bridge End', 6, 3, 25);

-- Table: announced_pu_results
CREATE TABLE IF NOT EXISTS announced_pu_results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    polling_unit_uniqueid INT,
    party_abbreviation VARCHAR(10),
    party_score INT,
    FOREIGN KEY (polling_unit_uniqueid) REFERENCES polling_unit(uniqueid)
);

-- PU Results (9 per PU, exact for ID 8; IGNORE skips duplicates)
INSERT IGNORE INTO announced_pu_results (polling_unit_uniqueid, party_abbreviation, party_score) VALUES
(1, 'PDP', 450), (1, 'DPP', 320), (1, 'ACN', 280), (1, 'PPA', 150), (1, 'CDC', 200), (1, 'JP', 100), (1, 'CPC', 50), (1, 'ANPP', 80), (1, 'ACCORD', 120),
(2, 'PDP', 600), (2, 'DPP', 400), (2, 'ACN', 350), (2, 'PPA', 250), (2, 'CDC', 300), (2, 'JP', 150), (2, 'CPC', 100), (2, 'ANPP', 90), (2, 'ACCORD', 180),
(3, 'PDP', 550), (3, 'DPP', 380), (3, 'ACN', 300), (3, 'PPA', 200), (3, 'CDC', 250), (3, 'JP', 120), (3, 'CPC', 70), (3, 'ANPP', 110), (3, 'ACCORD', 140),
(4, 'PDP', 700), (4, 'DPP', 500), (4, 'ACN', 420), (4, 'PPA', 300), (4, 'CDC', 350), (4, 'JP', 200), (4, 'CPC', 150), (4, 'ANPP', 130), (4, 'ACCORD', 220),
(5, 'PDP', 480), (5, 'DPP', 340), (5, 'ACN', 290), (5, 'PPA', 160), (5, 'CDC', 210), (5, 'JP', 110), (5, 'CPC', 60), (5, 'ANPP', 70), (5, 'ACCORD', 130),
(6, 'PDP', 620), (6, 'DPP', 410), (6, 'ACN', 360), (6, 'PPA', 260), (6, 'CDC', 310), (6, 'JP', 160), (6, 'CPC', 110), (6, 'ANPP', 100), (6, 'ACCORD', 190),
(7, 'PDP', 520), (7, 'DPP', 370), (7, 'ACN', 310), (7, 'PPA', 210), (7, 'CDC', 260), (7, 'JP', 130), (7, 'CPC', 80), (7, 'ANPP', 120), (7, 'ACCORD', 150),
(8, 'PDP', 802), (8, 'DPP', 719), (8, 'ACN', 416), (8, 'PPA', 939), (8, 'CDC', 394), (8, 'JP', 0), (8, 'CPC', 0), (8, 'ANPP', 0), (8, 'ACCORD', 0),
(9, 'PDP', 580), (9, 'DPP', 390), (9, 'ACN', 330), (9, 'PPA', 230), (9, 'CDC', 280), (9, 'JP', 140), (9, 'CPC', 90), (9, 'ANPP', 140), (9, 'ACCORD', 160),
(10, 'PDP', 650), (10, 'DPP', 430), (10, 'ACN', 370), (10, 'PPA', 270), (10, 'CDC', 320), (10, 'JP', 170), (10, 'CPC', 120), (10, 'ANPP', 150), (10, 'ACCORD', 200);

-- Table: announced_lga_results (official with variance)
CREATE TABLE IF NOT EXISTS announced_lga_results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lga_id INT,
    party_abbreviation VARCHAR(10),
    party_score INT,
    FOREIGN KEY (lga_id) REFERENCES lga(lga_id)
);

INSERT IGNORE INTO announced_lga_results (lga_id, party_abbreviation, party_score) VALUES
(1, 'PDP', 1605), (1, 'DPP', 1100), (1, 'ACN', 930), (1, 'PPA', 600), (1, 'CDC', 750), (1, 'JP', 370), (1, 'CPC', 220), (1, 'ANPP', 280), (1, 'ACCORD', 440),
(2, 'PDP', 1800), (2, 'DPP', 1250), (2, 'ACN', 1070), (2, 'PPA', 720), (2, 'CDC', 870), (2, 'JP', 470), (2, 'CPC', 320), (2, 'ANPP', 300), (2, 'ACCORD', 540),
(3, 'PDP', 2552), (3, 'DPP', 1908), (3, 'ACN', 1426), (3, 'PPA', 1646), (3, 'CDC', 1284), (3, 'JP', 440), (3, 'CPC', 290), (3, 'ANPP', 410), (3, 'ACCORD', 510);