'use strict';
// Parses eval/golden-set.csv into typed rows (CONTRACT.md: eval/ owns the golden
// set as data). The first three columns are prose with commas and quotes in
// them, so a naive split(',') corrupts rows — this needs a real RFC 4180
// parser. The state machine below is the same approach scripts/export-shelf.js
// uses for the same reason; not imported from there because that script does
// its own network/env setup at load time and isn't meant to be required.

const fs = require('fs');
const path = require('path');

const DEFAULT_CSV_PATH = path.join(__dirname, 'golden-set.csv');
const DEFAULT_SHELF_EXPORT_PATH = path.join(__dirname, '..', 'shelf', 'shelf-export.json');

// The golden set's shape is fixed by the PRD (§Evaluation) and the technical
// doc: 39 rows, 28 positive / 11 negative. A silent drift here (a row added,
// a Card IDs cell accidentally emptied) would make every downstream score
// meaningless without anyone noticing, so the loader fails loudly instead.
const EXPECTED_ROWS = 39;
const EXPECTED_POSITIVE = 28;
const EXPECTED_NEGATIVE = 11;

const EXPECTED_HEADER = ['Sentence', 'Associated Cards (Comma separated)', 'Explanation', 'Card IDs'];

// RFC 4180: quoted fields may contain commas, doubled `""` as an escaped quote,
// and literal newlines. A regex or String#split cannot express "newline inside
// quotes doesn't end the row," so this is a small character-by-character state
// machine instead.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function splitList(s) {
  return String(s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

// Loads and validates the golden set. Throws on any shape mismatch — this
// function is the one place every eval script trusts, so it never returns a
// silently-wrong row count or split.
function loadGolden(csvPath = DEFAULT_CSV_PATH) {
  const text = fs.readFileSync(csvPath, 'utf8');
  const table = parseCsv(text);
  if (!table.length) throw new Error(`golden: ${csvPath} is empty`);

  const [header, ...dataRows] = table;
  for (let i = 0; i < EXPECTED_HEADER.length; i++) {
    if ((header[i] || '').trim() !== EXPECTED_HEADER[i]) {
      throw new Error(
        `golden: header column ${i} is "${header[i]}", expected "${EXPECTED_HEADER[i]}" — ` +
        `is ${csvPath} still the golden set this harness was built against?`
      );
    }
  }

  // A trailing newline in the file produces one all-empty trailing row from the
  // parser; drop it rather than count it as row 40.
  const rows = dataRows.filter((r) => r.some((f) => (f || '').trim() !== ''));

  const parsed = rows.map((r, i) => {
    const [sentence, associatedCards, explanation, cardIds] = r;
    const card_ids = splitList(cardIds);
    return {
      row: i + 1, // 1-based position among the 39 data rows — the id used everywhere else in eval/
      sentence: (sentence || '').trim(),
      associated_cards: splitList(associatedCards),
      explanation: (explanation || '').trim(),
      card_ids,
      is_negative: card_ids.length === 0,
    };
  });

  if (parsed.length !== EXPECTED_ROWS) {
    throw new Error(`golden: expected ${EXPECTED_ROWS} rows, got ${parsed.length} — check ${csvPath} for a dropped or duplicated row`);
  }
  const positives = parsed.filter((r) => !r.is_negative);
  const negatives = parsed.filter((r) => r.is_negative);
  if (positives.length !== EXPECTED_POSITIVE || negatives.length !== EXPECTED_NEGATIVE) {
    throw new Error(
      `golden: expected ${EXPECTED_POSITIVE} positive / ${EXPECTED_NEGATIVE} negative rows, ` +
      `got ${positives.length} / ${negatives.length}`
    );
  }

  return parsed;
}

function loadShelfIds(shelfPath = DEFAULT_SHELF_EXPORT_PATH) {
  const raw = JSON.parse(fs.readFileSync(shelfPath, 'utf8'));
  const cards = Array.isArray(raw) ? raw : raw.cards;
  if (!Array.isArray(cards)) throw new Error(`golden: ${shelfPath} has no card array`);
  return new Set(cards.map((c) => c.id));
}

// Every card id the golden set references — 113 of them across the 39 rows,
// per shelf/README.md — must resolve against the shelf export, or the
// retrieval scorer would be grading against ids that can never be returned.
function assertCardIdsResolve(rows, shelfIds) {
  const ids = shelfIds || loadShelfIds();
  const missing = [];
  for (const r of rows) {
    for (const id of r.card_ids) {
      if (!ids.has(id)) missing.push({ row: r.row, id });
    }
  }
  if (missing.length) {
    const detail = missing.map((m) => `row ${m.row}: "${m.id}"`).join('; ');
    throw new Error(`golden: ${missing.length} card id(s) don't resolve against the shelf export — ${detail}`);
  }
  return true;
}

module.exports = {
  loadGolden,
  loadShelfIds,
  assertCardIdsResolve,
  parseCsv,
  splitList,
  DEFAULT_CSV_PATH,
  DEFAULT_SHELF_EXPORT_PATH,
  EXPECTED_ROWS,
  EXPECTED_POSITIVE,
  EXPECTED_NEGATIVE,
  EXPECTED_HEADER,
};
