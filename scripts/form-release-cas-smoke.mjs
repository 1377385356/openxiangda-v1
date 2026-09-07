import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createOpenApiForm,
  mutateOpenXiangdaFormConfig,
} from "../packages/sdk/src/build-source/scripts/utils/form-api.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appType = "APP_FORM_RELEASE_CAS";
const formUuid = "FORM_CUSTOMER";
const calls = [];
let bundleMode = "conflict";

const readRequestJson = request =>
  new Promise(resolve => {
    let raw = "";
    request.on("data", chunk => {
      raw += chunk;
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });

const respond = (response, data, status = 200) => {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(data));
};

const currentSnapshot = {
  revision: 2,
  etag: '"form-FORM_CUSTOMER-r2"',
  activeFormReleaseHead: {
    releaseId: "REL_FORM_CUSTOMER_2",
    releaseHash: "hash-form-customer-r2",
    revision: 2,
  },
  snapshot: {
    formUuid,
    name: "Customer",
    schema: { components: [] },
  },
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  const body = request.method === "GET" ? undefined : await readRequestJson(request);
  calls.push({
    method: request.method,
    path: url.pathname,
    headers: request.headers,
    body,
  });

  const api = `/service/openxiangda-api/v1/apps/${appType}`;
  if (
    request.method === "GET" &&
    url.pathname === `${api}/forms/${formUuid}/snapshot`
  ) {
    respond(response, { code: 200, data: currentSnapshot });
    return;
  }

  if (request.method === "POST" && url.pathname === `${api}/forms/${formUuid}/bundle`) {
    if (bundleMode === "conflict") {
      respond(
        response,
        {
          code: 409,
          errorCode: "FORM_REVISION_CONFLICT",
          message: "stale form revision",
        },
        409,
      );
      return;
    }
    const activate = body.activate === true;
    respond(response, {
      code: 200,
      data: activate
        ? {
            revision: 3,
            etag: '"form-FORM_CUSTOMER-r3"',
            activeFormReleaseHead: {
              releaseId: "REL_FORM_CUSTOMER_3",
              releaseHash: "hash-form-customer-r3",
              revision: 3,
            },
            release: {
              id: "REL_FORM_CUSTOMER_3",
              contentHash: "f".repeat(64),
              parentReleaseId: "REL_FORM_CUSTOMER_1",
              baseRevision: 2,
            },
            staged: true,
            active: true,
            activationRequested: true,
            releaseStatus: "active",
          }
        : {
            revision: 2,
            etag: currentSnapshot.etag,
            activeFormReleaseHead: currentSnapshot.activeFormReleaseHead,
            release: {
              id: "REL_FORM_CUSTOMER_STAGED",
              contentHash: "e".repeat(64),
              parentReleaseId: "REL_FORM_CUSTOMER_1",
              baseRevision: 2,
            },
            staged: true,
            active: false,
            activationRequested: false,
            releaseStatus: "staged",
          },
    });
    return;
  }

  if (request.method === "POST" && url.pathname === `${api}/forms`) {
    respond(response, {
      code: 200,
      data: {
        form: {
          formUuid: "FORM_NEW",
          revision: 1,
          etag: '"form-FORM_NEW-r1"',
        },
        activeFormReleaseHead: {
          releaseId: "REL_FORM_NEW_1",
          releaseHash: "hash-form-new-r1",
          revision: 1,
        },
      },
    });
    return;
  }

  respond(response, { code: 404, message: `unhandled ${request.method} ${url.pathname}` }, 404);
});

await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const config = {
  appType,
  platformUrl: `http://127.0.0.1:${address.port}`,
  servicePrefix: "/service",
  openXiangdaAccessToken: "test-token",
  defaults: {},
};

try {
  calls.length = 0;
  await assert.rejects(
    mutateOpenXiangdaFormConfig(config, "test-token", {
      formUuid,
      endpoint: "bundle",
      operation: "config-bundle",
      payload: { settings: { title: "stale" } },
      expected: {
        revision: 1,
        etag: '"form-FORM_CUSTOMER-r1"',
        activeFormReleaseHead: {
          releaseId: "REL_FORM_CUSTOMER_1",
          releaseHash: "hash-form-customer-r1",
          revision: 1,
        },
      },
    }),
    error => error?.code === "FORM_REVISION_CONFLICT",
  );
  assert.equal(calls.filter(call => call.method !== "GET").length, 0, "stale baseline must write zero requests");

  calls.length = 0;
  bundleMode = "conflict";
  await assert.rejects(
    mutateOpenXiangdaFormConfig(config, "test-token", {
      formUuid,
      endpoint: "bundle",
      operation: "config-bundle",
      payload: { settings: { title: "conflict" } },
      expected: currentSnapshot,
    }),
    error => error?.code === "FORM_REVISION_CONFLICT" && error?.status === 409,
  );
  const conflictPosts = calls.filter(call => call.method === "POST");
  assert.equal(conflictPosts.length, 1, "CAS conflict must not retry the mutation");
  assert.equal(conflictPosts[0].headers["if-match"], currentSnapshot.etag);
  assert.equal(conflictPosts[0].body.expectedRevision, currentSnapshot.revision);
  assert.deepEqual(conflictPosts[0].body.expectedParent, currentSnapshot.activeFormReleaseHead);
  assert.match(conflictPosts[0].body.artifactId, /^form:config-bundle:/);

  calls.length = 0;
  bundleMode = "success";
  const published = await mutateOpenXiangdaFormConfig(config, "test-token", {
    formUuid,
    endpoint: "bundle",
    operation: "config-bundle",
    payload: {
      schema: { components: [{ id: "name", componentName: "TextField" }] },
      settings: { title: "Customer" },
      indexes: [{ name: "idx_customer_name", fields: ["name"] }],
    },
    expected: currentSnapshot,
  });
  assert.equal(published.data.revision, 2);
  assert.equal(published.data.staged, true);
  assert.equal(published.data.active, false);
  assert.deepEqual(
    published.data.activeFormReleaseHead,
    currentSnapshot.activeFormReleaseHead,
    "default bundle must not advance the live Form head",
  );
  assert.equal(calls.filter(call => call.method === "GET").length, 1);
  assert.equal(calls.filter(call => call.method === "POST").length, 1, "one frozen Form bundle must use one mutation request");
  assert.equal(calls.find(call => call.method === "POST").body.activate, undefined);

  calls.length = 0;
  const activated = await mutateOpenXiangdaFormConfig(config, "test-token", {
    formUuid,
    endpoint: "bundle",
    operation: "config-bundle",
    payload: {
      schema: { components: [{ id: "name", componentName: "TextField" }] },
      settings: { title: "Customer" },
      indexes: [{ name: "idx_customer_name", fields: ["name"] }],
      activate: true,
    },
    expected: currentSnapshot,
  });
  assert.equal(activated.data.revision, 3);
  assert.equal(activated.data.active, true);
  assert.equal(activated.data.releaseStatus, "active");
  assert.equal(calls.filter(call => call.method === "POST").length, 1);
  assert.equal(calls.find(call => call.method === "POST").body.activate, true);

  calls.length = 0;
  const created = await createOpenApiForm(config, "test-token", {
    name: "New Form",
    formType: "receipt",
  });
  assert.equal(created.formUuid, "FORM_NEW");
  const createCall = calls.at(-1);
  assert.equal(createCall.method, "POST");
  assert.equal(createCall.headers["if-match"], "0");
  assert.equal(createCall.body.expectedRevision, 0);

  const cliSource = fs.readFileSync(path.join(repoRoot, "lib", "cli.js"), "utf8");
  const start = cliSource.indexOf("async function publishFormSettingsResources(");
  const end = cliSource.indexOf("\nasync function publishMenuResources", start);
  assert.ok(start >= 0 && end > start, "publishFormSettingsResources must exist");
  const publishSource = cliSource.slice(start, end);
  assert.match(publishSource, /\/forms\/\$\{encodeURIComponent\(formUuid\)\}\/bundle/);
  assert.equal(
    (publishSource.match(/requestFrozenFormMutation\(/g) || []).length,
    1,
    "resource Form settings publish must call the frozen mutation helper exactly once",
  );
  for (const obsoletePath of ["/settings", "/field-indexes", "/data-management", "/public-access"]) {
    assert.equal(publishSource.includes(obsoletePath), false, `bundle publisher must not call ${obsoletePath}`);
  }
  assert.match(publishSource, /activateFormBundles === true/);
  assert.match(publishSource, /\.\.\.\(activate \? \{ activate: true \} : \{\}\)/);
  assert.match(
    cliSource,
    /if \(!flags\.reason\) fail\('Form Release rollback 必须提供 --reason'\)/,
    "rollback must remain reason-gated",
  );
  assert.match(
    publishSource,
    /kind:\s*'FormRelease'/,
    "staged Form bundle must emit a canonical FormRelease stagedResource",
  );
  assert.match(
    publishSource,
    /data\?\.release\?\.contentHash/,
    "staged Form bundle output must expose the immutable contentHash",
  );
  assert.match(
    publishSource,
    /FORM_RELEASE_STAGE_REQUIRED/,
    "non-activated Form bundle responses must fail closed without canonical staged evidence",
  );
  assert.match(
    cliSource,
    /recordStagedAppReleaseResources\(/,
    "staged child releases must be accumulated for Root App finalize",
  );

  console.log("form-release-cas-smoke: PASS");
} finally {
  await new Promise(resolve => server.close(resolve));
}
