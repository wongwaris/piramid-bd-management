import { neon } from '@neondatabase/serverless';

let client;

export function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }
  client ||= neon(process.env.DATABASE_URL);
  return client;
}

export function json(value, fallback) {
  if (value === undefined) return JSON.stringify(fallback);
  return JSON.stringify(value ?? fallback);
}
