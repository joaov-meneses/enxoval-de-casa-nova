import { getPool } from './database.ts';
import { migrateDatabase } from './migrations.ts';

try {
  await migrateDatabase();
  console.log('Migrations executadas com sucesso.');
} finally {
  await getPool().end();
}