#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { dirname, join, resolve, basename } from 'node:path';
import { parseAllDocuments } from 'yaml';

const [, , inYamlArg, outHtmlArg] = process.argv;
if (!inYamlArg || !outHtmlArg) {
  console.error('usage: node src/build.mjs <flow.yaml> <out.html>');
  process.exit(1);
}

const inYaml = resolve(inYamlArg);
const outHtml = resolve(outHtmlArg);
const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');
const viewerPath = join(repoRoot, 'src/viewer.html');
const stylesPath = join(repoRoot, 'src/styles.css');

// Commands that are timing/wait directives, not user actions — strip from edge labels.
const NON_ACTION_COMMANDS = new Set(['waitForAnimationToEnd']);

// Cream "no capture yet" placeholder so the graph still renders before screenshots are captured.
const MISSING_FRAME_DATA_URI = 'data:image/svg+xml;base64,' + Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 844">` +
  `<rect width="100%" height="100%" fill="#1c1f24"/>` +
  `<text x="50%" y="48%" font-family="JetBrains Mono, monospace" font-size="22" fill="#c8503c" text-anchor="middle" opacity="0.65">no capture yet</text>` +
  `<text x="50%" y="56%" font-family="JetBrains Mono, monospace" font-size="14" fill="#d8cfb8" text-anchor="middle" opacity="0.5">run npm run flow</text>` +
  `</svg>`
).toString('base64');

const docs = parseAllDocuments(readFileSync(inYaml, 'utf8'));
const commands = docs.map((d) => d.toJS()).find((v) => Array.isArray(v));
if (!commands) {
  console.error(`no command list found in ${inYaml}`);
  process.exit(1);
}

function commandLabel(cmd) {
  if (typeof cmd === 'string') return cmd;
  const [name, value] = Object.entries(cmd)[0];
  if (value == null || value === '') return name;
  if (typeof value === 'string') return `${name} "${value.replace(/\n/g, ' / ')}"`;
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return `${name} "${value.text}"`;
    const inner = Object.entries(value).map(([k, v]) => `${k}: ${v}`).join(', ');
    return `${name}(${inner})`;
  }
  return `${name} ${value}`;
}

function isScreenshot(cmd) {
  return cmd && typeof cmd === 'object' && 'takeScreenshot' in cmd;
}

function isNonAction(cmd) {
  if (cmd && typeof cmd === 'object') {
    const [name] = Object.entries(cmd)[0];
    return NON_ACTION_COMMANDS.has(name);
  }
  if (typeof cmd === 'string') return NON_ACTION_COMMANDS.has(cmd);
  return false;
}

// Resolve a Maestro takeScreenshot value to an absolute PNG path on disk.
// - "home" → <repo>/screenshots/home.png  (placeholder convention, no slash)
// - "screenshots/10-home-top" → <repo>/screenshots/10-home-top.png  (Maestro path-relative)
// - "screenshots/foo.png" → <repo>/screenshots/foo.png  (explicit extension)
function resolveScreenshot(rawName) {
  const cleaned = rawName.replace(/\.png$/i, '');
  const relPath = cleaned.includes('/') ? `${cleaned}.png` : `screenshots/${cleaned}.png`;
  return { abs: join(repoRoot, relPath), rel: relPath, displayName: basename(cleaned) };
}

const nodes = [];
const edges = [];
let pendingActions = [];
let prevNodeId = null;
let screenshotIdx = 0;
let missingCount = 0;

for (const cmd of commands) {
  if (isScreenshot(cmd)) {
    const rawName = String(cmd.takeScreenshot);
    const { abs, rel, displayName } = resolveScreenshot(rawName);
    const id = `${displayName}#${screenshotIdx++}`;
    let dataUri;
    try {
      const bytes = readFileSync(abs);
      dataUri = `data:image/png;base64,${bytes.toString('base64')}`;
    } catch {
      missingCount++;
      console.warn(`  ⚠ missing: ${rel} — using placeholder frame`);
      dataUri = MISSING_FRAME_DATA_URI;
    }
    nodes.push({ id, name: displayName, image: dataUri });
    if (prevNodeId !== null) {
      edges.push({
        id: `${prevNodeId}->${id}`,
        source: prevNodeId,
        target: id,
        label: pendingActions.length ? pendingActions.join('  →  ') : '',
      });
    }
    prevNodeId = id;
    pendingActions = [];
  } else if (!isNonAction(cmd)) {
    pendingActions.push(commandLabel(cmd));
  }
}

const viewer = readFileSync(viewerPath, 'utf8');
const styles = readFileSync(stylesPath, 'utf8');

const flowDataScript = `const FLOW_DATA = ${JSON.stringify({
  nodes,
  edges,
  meta: { source: inYamlArg, screens: nodes.length },
})};`;

const html = viewer
  .replace('/* {{STYLES}} */', () => styles)
  .replace('/* {{FLOW_DATA}} */', () => flowDataScript);

mkdirSync(dirname(outHtml), { recursive: true });
writeFileSync(outHtml, html);

console.log(`wrote ${outHtml}`);
console.log(`  ${nodes.length} screens, ${edges.length} edges` + (missingCount ? `, ${missingCount} missing screenshots (placeholder frames used)` : ''));
