import { cpSync } from 'node:fs';
cpSync('server/fiscal/schemas', 'dist/schemas', { recursive: true });
