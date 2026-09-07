import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  OPEN_API_SPEC_FILE,
  sha256File,
  validateOpenApiDocument,
} = require('../lib/open-api');

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SOURCE = path.resolve(
  ROOT_DIR,
  '..',
  '..',
  'sy-lowcode-platform-server',
  'doc',
  'dingtalk-api.openapi.json'
);

function parseArgs(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--check') {
      flags.check = true;
      continue;
    }
    if (item === '--source') {
      flags.source = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${item}`);
  }
  return flags;
}

function validateFile(file) {
  const document = JSON.parse(fs.readFileSync(file, 'utf8'));
  validateOpenApiDocument(document);
  return document;
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  const source = path.resolve(flags.source || DEFAULT_SOURCE);
  if (!fs.existsSync(source)) {
    throw new Error(`DingTalk OpenAPI source not found: ${source}`);
  }
  validateFile(source);

  if (flags.check) {
    if (!fs.existsSync(OPEN_API_SPEC_FILE)) {
      throw new Error(`Bundled DingTalk OpenAPI snapshot not found: ${OPEN_API_SPEC_FILE}`);
    }
    validateFile(OPEN_API_SPEC_FILE);
    const sourceHash = sha256File(source);
    const bundledHash = sha256File(OPEN_API_SPEC_FILE);
    if (sourceHash !== bundledHash) {
      throw new Error(
        `Bundled DingTalk OpenAPI snapshot is stale: source=${sourceHash} bundled=${bundledHash}`
      );
    }
    process.stdout.write(`DingTalk OpenAPI snapshot is current: ${sourceHash}\n`);
    return;
  }

  fs.mkdirSync(path.dirname(OPEN_API_SPEC_FILE), { recursive: true });
  fs.copyFileSync(source, OPEN_API_SPEC_FILE);
  validateFile(OPEN_API_SPEC_FILE);
  const sourceHash = sha256File(source);
  const bundledHash = sha256File(OPEN_API_SPEC_FILE);
  if (sourceHash !== bundledHash) {
    throw new Error(
      `DingTalk OpenAPI snapshot copy failed integrity check: source=${sourceHash} bundled=${bundledHash}`
    );
  }
  process.stdout.write(`DingTalk OpenAPI snapshot synchronized: ${bundledHash}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
