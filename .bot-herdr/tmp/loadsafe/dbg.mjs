// quick debug of declarations for one file
import fs from 'node:fs';
const mod = await import('./scan.mjs').catch(e=>null);
