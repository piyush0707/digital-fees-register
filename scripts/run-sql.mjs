#!/usr/bin/env node
// Run a .sql file against the Supabase Postgres database.
// Usage: node --env-file=.env.db.local scripts/run-sql.mjs <file.sql>
// The connection string is read from SUPABASE_DB_URL and never printed.

import { readFile } from "node:fs/promises";
import { argv, exit, env } from "node:process";
import pg from "pg";

const file = argv[2];
if (!file) {
  console.error("usage: run-sql.mjs <file.sql>");
  exit(2);
}

const connectionString = env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error(
    "SUPABASE_DB_URL is not set. Run with: node --env-file=.env.db.local scripts/run-sql.mjs <file.sql>",
  );
  exit(2);
}

const sql = await readFile(file, "utf8");

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
} catch (err) {
  console.error(`connection failed: ${err.message}`);
  exit(1);
}

try {
  const result = await client.query(sql);
  const results = Array.isArray(result) ? result : [result];
  let printed = false;
  for (const r of results) {
    if (r && Array.isArray(r.rows) && r.rows.length > 0) {
      console.table(r.rows);
      printed = true;
    }
  }
  if (!printed) {
    console.log(`ok: ${file}`);
  }
} catch (err) {
  console.error(`query failed: ${err.message}`);
  if (err.detail) console.error(`detail: ${err.detail}`);
  if (err.hint) console.error(`hint: ${err.hint}`);
  if (err.position) console.error(`position: ${err.position}`);
  exit(1);
} finally {
  await client.end();
}
