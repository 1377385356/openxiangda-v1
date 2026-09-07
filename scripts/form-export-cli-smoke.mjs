import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openxiangda-form-export-'));
const home = path.join(tmp, 'home');
const workspace = path.join(tmp, 'workspace');
fs.mkdirSync(path.join(home, '.openxiangda'), { recursive: true });
fs.mkdirSync(path.join(workspace, '.openxiangda'), { recursive: true });
process.env.HOME = home;
process.env.OPENXIANGDA_RUNTIME_UPLOAD_TIMEOUT_MS = '30000';
process.chdir(workspace);

fs.writeFileSync(
  path.join(home, '.openxiangda', 'profiles.json'),
  JSON.stringify(
    {
      version: 1,
      currentProfile: 'dev',
      profiles: {
        dev: {
          baseUrl: 'https://lowcode.example.com/service',
          token: {
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
          },
        },
      },
    },
    null,
    2
  )
);

fs.writeFileSync(
  path.join(workspace, '.openxiangda', 'state.json'),
  JSON.stringify(
    {
      version: 1,
      profiles: {
        dev: {
          appType: 'APP_TEST',
          resources: {
            forms: {
              customer: {
                formUuid: 'FORM_CUSTOMER',
              },
            },
          },
        },
      },
    },
    null,
    2
  )
);

const requests = [];
globalThis.fetch = async (url, options = {}) => {
  requests.push({ url: String(url), options });
  const pathname = new URL(String(url)).pathname;
  const filename = pathname.endsWith('.zip') ? 'server.zip' : 'server.xlsx';
  return new Response(Buffer.from(`payload:${filename}`), {
    status: 200,
    headers: {
      'content-type': pathname.endsWith('.zip')
        ? 'application/zip'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
};

const require = createRequire(import.meta.url);
const { main } = require(path.join(root, 'lib/cli.js'));

await main([
  'form',
  'export',
  'customer',
  '--mode',
  'xlsx',
  '--profile',
  'dev',
  '--output',
  './exports',
  '--json',
]);
await main([
  'form',
  'export',
  'customer',
  '--mode',
  'xlsx-images',
  '--profile',
  'dev',
  '--all',
  '--fields',
  'formInstId,instance_title,field_img',
  '--filters-json',
  '{"status":"active"}',
  '--output',
  './image-export.xlsx',
]);
await main([
  'form',
  'export',
  'customer',
  '--mode',
  'package',
  '--profile',
  'dev',
  '--order-json',
  '{"field":"createdAt","isAsc":"n"}',
  '--output',
  './exports/',
  '--json',
]);

assert.equal(requests.length, 3);

const xlsxUrl = new URL(requests[0].url);
assert.equal(xlsxUrl.pathname, '/service/APP_TEST/v1/form/advancedExport.xlsx');
assert.equal(xlsxUrl.searchParams.get('formUuid'), 'FORM_CUSTOMER');
assert.equal(xlsxUrl.searchParams.get('embedImages'), 'n');
assert.equal(xlsxUrl.searchParams.get('exportAll'), 'n');
assert.equal(requests[0].options.headers.authorization, 'Bearer access-token');
assert.equal(
  fs.readFileSync(path.join(workspace, 'exports', 'server.xlsx'), 'utf8'),
  'payload:server.xlsx'
);

const imageUrl = new URL(requests[1].url);
assert.equal(imageUrl.pathname, '/service/APP_TEST/v1/form/advancedExport.xlsx');
assert.equal(imageUrl.searchParams.get('embedImages'), 'y');
assert.equal(imageUrl.searchParams.get('exportAll'), 'y');
assert.equal(
  imageUrl.searchParams.get('exportFields'),
  'formInstId,instance_title,field_img'
);
assert.deepEqual(JSON.parse(imageUrl.searchParams.get('filters')), {
  status: 'active',
});
assert.equal(
  fs.readFileSync(path.join(workspace, 'image-export.xlsx'), 'utf8'),
  'payload:server.xlsx'
);

const packageUrl = new URL(requests[2].url);
assert.equal(
  packageUrl.pathname,
  '/service/APP_TEST/v1/form/advancedExportPackage.zip'
);
assert.equal(packageUrl.searchParams.get('embedImages'), 'y');
assert.deepEqual(JSON.parse(packageUrl.searchParams.get('order')), {
  field: 'createdAt',
  isAsc: 'n',
});
assert.equal(
  fs.readFileSync(path.join(workspace, 'exports', 'server.zip'), 'utf8'),
  'payload:server.zip'
);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('form export cli smoke passed');
