// CPU microbenchmarks, not a claim about end-to-end latency or GPU frame rate.
// Pass a directory containing an earlier model.ts/motion.ts to compare revisions.
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const source = process.argv[2] || 'app/reader';
const model = await import(pathToFileURL(path.resolve(source, 'model.ts')));
const motion = await import(pathToFileURL(path.resolve(source, 'motion.ts')));
const index = JSON.parse(
  gunzipSync(fs.readFileSync('public/reader-assets/202601/index.json.gz')),
);
const queries = [
  'the',
  'science',
  'kennedy',
  'america',
  'government',
  'culture',
  'history',
  'university',
  'people',
  'trump',
];
let checksum = 0;
function measure(label, count, run) {
  for (let i = 0; i < 10; i++) run(i);
  const trials = [];
  for (let trial = 0; trial < 7; trial++) {
    const start = performance.now();
    for (let i = 0; i < count; i++) run(i);
    trials.push((performance.now() - start) / count);
  }
  trials.sort((a, b) => a - b);
  console.log(`${label}: ${trials[3].toFixed(3)} ms median per operation`);
}
measure('Search a complete issue', 100, (i) => {
  checksum += model.searchPages(index, queries[i % queries.length]).length;
});
measure('Compute one 80 x 48 curl mesh', 100, (i) => {
  const ratio = 4 / 3,
    progress = ((i % 99) + 1) / 100;
  const frame = motion.curlFrame?.(ratio, progress);
  for (let row = 0; row <= 48; row++) {
    const y = ratio * (0.5 - row / 48);
    const samples = frame && motion.curlRow(y, frame);
    for (let col = 0; col <= 80; col++) {
      const u = samples
        ? motion.sampleCurlRow(col, 80, samples)
        : motion.curlSampleU(col, 80, y, ratio, progress);
      const point = frame
        ? motion.curlPoint(u, y, frame)
        : motion.cornerCurl(u, y, ratio, progress);
      checksum += point.x + point.y + point.z + point.shade;
    }
  }
});
console.log(`Checksum: ${checksum.toFixed(4)}`);
