import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env.local') });

// Extend timeout for real API calls during eval runs
process.env.OPENAI_TIMEOUT_MS = '30000';
