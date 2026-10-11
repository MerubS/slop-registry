import { config } from 'dotenv';
import { resolve } from 'path';

// main.js is compiled to apps/api/dist, so three levels up is the repo root.
// Prisma CLI does not use this file. It reads apps/api/.env, which setup
// links to the same root file.
config({ path: resolve(__dirname, '../../../.env') });
