// Example: src/db/index.ts
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema'; // Your Drizzle schema

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });