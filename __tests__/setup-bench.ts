import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env.local') });

// Allow calls to complete naturally during benchmarking — 8s production timeout
// kills calls before they can be measured. p95 target is enforced by the test assertion.
process.env.OPENAI_TIMEOUT_MS = '30000';
