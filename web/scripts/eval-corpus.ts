/**
 * Eval: decode + re-encode every string in the wago corpus and report per-version results.
 * Run: npm run eval
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeLayoutString, encodeLayoutString, tokenize } from "../src/editmode/layoutString";
import { summarize } from "../src/editmode/describe";

const here = path.dirname(fileURLToPath(import.meta.url));
type Fixture = { id: string; name: string | null; author: string | null; date: string | null; version: number; string: string };
const fixtures: Fixture[] = JSON.parse(fs.readFileSync(path.join(here, "..", "test", "fixtures", "wago-corpus.json"), "utf8"));

type Row = { version: number; n: number; decoded: number; exact: number; styleHeader: number; dupHeader: number; beta: number; unknownSys: number; unknownSet: number; warnings: number; first: string; last: string };
const rows = new Map<number, Row>();
const failures: string[] = [];
for (const f of fixtures) {
  const r = rows.get(f.version) ?? { version: f.version, n: 0, decoded: 0, exact: 0, styleHeader: 0, dupHeader: 0, beta: 0, unknownSys: 0, unknownSet: 0, warnings: 0, first: "9999", last: "0000" };
  rows.set(f.version, r);
  r.n++;
  if (f.date) { if (f.date < r.first) r.first = f.date; if (f.date > r.last) r.last = f.date; }
  try {
    const l = decodeLayoutString(f.string);
    r.decoded++;
    if (encodeLayoutString(l) === tokenize(f.string).join(" ")) r.exact++; else failures.push(`${f.id}: not byte-exact`);
    if (l.headerKind === "style") r.styleHeader++;
    if (l.headerKind === "dupCount") r.dupHeader++;
    if (l.grammar === "beta2022") r.beta++;
    const s = summarize(l);
    if (s.unknownSystems.length) r.unknownSys++;
    if (s.unknownSettings.length) r.unknownSet++;
    if (l.warnings.length) r.warnings++;
  } catch (e) {
    failures.push(`${f.id}: ${(e as Error).message}`);
  }
}
const table = [...rows.values()].sort((a, b) => a.version - b.version);
const pad = (s: string | number, n: number) => String(s).padStart(n);
console.log("version  count decoded exact  style dupHdr beta  unkSys unkSet warn  dates");
for (const r of table) {
  console.log(`${pad(r.version, 7)}  ${pad(r.n, 5)} ${pad(r.decoded, 7)} ${pad(r.exact, 5)}  ${pad(r.styleHeader, 5)} ${pad(r.dupHeader, 6)} ${pad(r.beta, 4)}  ${pad(r.unknownSys, 6)} ${pad(r.unknownSet, 6)} ${pad(r.warnings, 4)}  ${r.first}..${r.last}`);
}
const total = table.reduce((a, r) => a + r.n, 0), exact = table.reduce((a, r) => a + r.exact, 0);
console.log(`\nTOTAL ${total} strings, ${exact} byte-exact round trips (${((100 * exact) / total).toFixed(1)}%), ${failures.length} failures`);
for (const f of failures) console.log("  " + f);
const report = { generatedAt: new Date().toISOString(), total, exact, failures, perVersion: table };
fs.writeFileSync(path.join(here, "..", "test", "eval-report.json"), JSON.stringify(report, null, 2));
process.exit(failures.length ? 1 : 0);
