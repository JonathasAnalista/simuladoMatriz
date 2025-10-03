#!/usr/bin/env node
// Utility to apply the configuration of a specific autoescola (client).
// Usage: node scripts/apply-config.js client-name
// Copies configs/<client>/frontend/config.js -> frontend/js/config.js
//         configs/<client>/backend/.env      -> backend/.env

const fs = require('node:fs/promises');
const path = require('node:path');

async function copyFile(source, target, label) {
  try {
    await fs.access(source);
  } catch {
    throw new Error(`Missing ${label} file: ${source}`);
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
  console.log(`Copied ${label}`);
  console.log(`  from: ${source}`);
  console.log(`    to: ${target}`);
}

async function main() {
  const client = process.argv[2];
  if (!client) {
    console.error('Usage: node scripts/apply-config.js client-name');
    process.exit(1);
  }

  const root = path.resolve(__dirname, '..');
  const clientDir = path.join(root, 'configs', client);
  try {
    await fs.access(clientDir);
  } catch {
    console.error(`Client folder not found: ${clientDir}`);
    console.error('Create it by copying configs/template and filling the values.');
    process.exit(1);
  }

  const mappings = [
    {
      source: path.join(clientDir, 'frontend', 'config.js'),
      target: path.join(root, 'frontend', 'js', 'config.js'),
      label: 'frontend config'
    },
    {
      source: path.join(clientDir, 'backend', '.env'),
      target: path.join(root, 'backend', '.env'),
      label: 'backend .env'
    }
  ];

  for (const mapping of mappings) {
    await copyFile(mapping.source, mapping.target, mapping.label);
  }

  console.log('\nConfiguration applied. Review the copied files before deploying.');
}

main().catch((err) => {
  console.error('Error applying configuration:');
  console.error(err.message || err);
  process.exit(1);
});
