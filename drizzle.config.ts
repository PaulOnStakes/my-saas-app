// drizzle.config.ts
import 'dotenv/config'; // Ensures.env variables are loaded
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    schema: './src/db/schema.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL!, // This line needs the DATABASE_URL
    },
    verbose: true,
    strict: true,
});