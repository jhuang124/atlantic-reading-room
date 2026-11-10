// Opening-page art for the front page: each feature's first page (and its
// facing page when the story opens on a left-hand page) at 520px wide, WebP.
// Run from the project root: node scripts/prepare-openers.mjs
// Needs pdftoppm (poppler) and cwebp. Skips files that already exist.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readerIssues } from '../app/reader/catalog.ts';
import { openerPages } from '../app/archive.ts';

const root = 'public/reader-assets';
const scratch = mkdtempSync(join(tmpdir(), 'openers-'));
let made = 0,
  kept = 0;
for (const issue of readerIssues) {
  const pdf = join(root, `${issue.id}.pdf`);
  if (!existsSync(pdf)) continue;
  const pages = new Set(issue.contents.flatMap((story) => openerPages(issue, story)));
  for (const page of pages) {
    const out = join(root, issue.id, `o${page}.webp`);
    if (existsSync(out)) {
      kept++;
      continue;
    }
    const png = join(scratch, `${issue.id}-${page}`);
    execFileSync('pdftoppm', ['-f', String(page), '-l', String(page), '-scale-to-x', '520', '-scale-to-y', '-1', '-png', '-singlefile', pdf, png]);
    execFileSync('cwebp', ['-quiet', '-q', '62', `${png}.png`, '-o', out]);
    made++;
  }
  console.log(issue.id, pages.size);
}
rmSync(scratch, { recursive: true, force: true });
console.log(`made ${made}, kept ${kept}`);
