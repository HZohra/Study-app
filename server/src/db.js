import pg from 'pg';
import 'dotenv/config';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Small helpers so route files stay short
export async function query(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows;
}

export async function one(text, params = []) {
  const rows = await query(text, params);
  return rows[0] ?? null;
}
