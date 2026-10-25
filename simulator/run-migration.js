const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.PGPASSWORD;
  if (!dbPassword) {
    console.error('Please specify SUPABASE_DB_PASSWORD or PGPASSWORD environment variable.');
    process.exit(1);
  }

  const client = new Client({
    host: process.env.SUPABASE_DB_HOST || 'db.jtxatelmmgsprghvtyhh.supabase.co',
    port: parseInt(process.env.SUPABASE_DB_PORT || '5432', 10),
    user: process.env.SUPABASE_DB_USER || 'postgres',
    password: dbPassword,
    database: process.env.SUPABASE_DB_NAME || 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  console.log('Connecting to Supabase PostgreSQL...');
  await client.connect();
  console.log('Connected successfully!');

  const sqlPath = path.resolve(__dirname, '..', 'supabase', 'setup_complete.sql');
  console.log('Reading SQL script from:', sqlPath);
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Executing setup_complete.sql (creating tables, policies, functions, triggers, and seed data)...');
  await client.query(sql);
  console.log('Migration and seeding completed successfully!');

  await client.end();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
