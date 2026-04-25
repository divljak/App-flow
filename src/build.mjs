#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseAllDocuments } from 'yaml';

const [, , inYamlArg, outHtmlArg] = process.argv;
if (!inYamlArg || !outHtmlArg) {
  console.error('usage: node src/build.mjs <flow.yaml> <out.html>');
  process.exit(1);
}

const inYaml = resolve(inYamlArg);
const outHtml = resolve(outHtmlArg);
const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');
const screenshotsDir = join(repoRoot, 'screenshots');
const viewerPath = join(repoRoot, 'src/viewer.html');
const stylesPath = join(repoRoot, 'src/styles.css');

const docs = parseAllDocuments(readFileSync(inYaml, 'utf8'));
// Maestro is two YAML docs: header + command list. Find the first sequence.
const commands = docs.map((d) => d.toJS()).find((v) => Array.isArray(v));
if (!commands) {
  console.error(`no command list found in ${inYaml}`);
  process.exit(1);
}

function commandLabel(cmd) {
  if (typeof cmd === 'string') return cmd;
  const [name, value] = Object.entries(cmd)[0];
  if (value == null || value === '') return name;
  if (typeof value === 'string') return `${name} "${value}"`;
  if (typeof value === 'object') {
    const inner = Object.entries(value).map(([k, v]) => `${k}: ${v}`).join(', ');
    return `${name}(${inner})`;
  }
  return `${name} ${value}`;
}

function isScreenshot(cmd) {
  return cmd && typeof cmd === 'object' && 'takeScreenshot' in cmd;
}

const nodes = [];
const edges = [];
let pendingActions = [];
let prevNodeId = null;
let screenshotIdx = 0;

for (const cmd of commands) {
  if (isScreenshot(cmd)) {
    const name = String(cmd.takeScreenshot);
    const id = `${name}#${screenshotIdx++}`;
    const pngPath = join(screenshotsDir, `${name}.png`);
    let dataUri;
    try {
      const bytes = readFileSync(pngPath);
      dataUri = `data:image/png;base64,${bytes.toString('base64')}`;
    } catch (e) {
      console.error(`missing screenshot: ${pngPath}`);
      process.exit(1);
    }
    nodes.push({ id, name, image: dataUri });
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
  } else {
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
console.log(`  ${nodes.length} screens, ${edges.length} edges`);
