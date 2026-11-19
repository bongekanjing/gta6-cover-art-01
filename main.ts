// Neon Coast entry program for gta6-cover-art-01 (Node 22, standard library
// only). It hands the app in: it copies this repository's app/ and
// screenshots/ into the output directory and writes /output/dossier.json with
// the vendored make.fun library, so the sealed scorer can gate the entry and
// the judge can read its dossier.
//
// Run it locally with MAKEFUN_OUTPUT_DIR set to a scratch directory:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// In the grader the output directory is /output. The program writes the same
// bytes on every run: it only copies files and builds the dossier from them.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'app'), join(outDir, 'app'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The scorer's caps for this bounty (reference/gate.json): the dossier text
// is capped at 160 KiB; at most 4 screenshots of at most 256 KiB each; app/
// holds at most 993 files and 48 MiB in all, with no path over 1000 bytes.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);
