import fs from "node:fs";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { readGitSourceBase } = require("../lib/change-baseline");
const { buildCandidateBundle } = require("../lib/application-environments");
const { prepareReleaseSourceRevision } = require("../lib/release-mainline");
const { listRuntimeBuildInputChanges } = require("../lib/runtime-lineage");
const {
  assertRuntimeReleaseReusable,
  calculateRuntimeReleaseContentHash,
} = require("../lib/cli");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openxiangda-runtime-deploy-"));
const tempHome = path.join(tempRoot, "home");
const workspace = path.join(tempRoot, "workspace");
const origin = path.join(tempRoot, "origin.git");
const profileName = "mock";
const appType = "APP_TEST";
let capturedBody = null;
const uploadedFiles = [];
const ossUploadedFiles = [];
const cosUploadedFiles = [];
let activeRuntimeReleaseId = "REL_BASE";
let activeRuntimeSourceRevision = null;
let uploadPlanRequestCount = 0;
let releaseCreateRequestCount = 0;
let runtimeAbortRequestCount = 0;
let publishLeaseAcquireCount = 0;
let publishLeaseReleaseCount = 0;
let managedPublishLeaseReleaseCount = 0;
let runtimeHeadRequestCount = 0;
let snapshotRequestCount = 0;
let exactBuildLookupCount = 0;
let exactBuildLookupSupported = true;
const runtimeReleasesByBuild = new Map();

const runGit = (...args) => {
  const result = spawnSync("git", args, {
    cwd: workspace,
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.stderr || result.stdout || result.error?.message || "git failed");
  }
  return String(result.stdout || "").trim();
};

fs.mkdirSync(path.join(tempHome, ".openxiangda"), { recursive: true });
fs.mkdirSync(path.join(workspace, ".openxiangda"), { recursive: true });
fs.mkdirSync(path.join(workspace, "dist", "assets"), { recursive: true });
fs.writeFileSync(
  path.join(workspace, "package.json"),
  JSON.stringify({ name: "runtime-deploy-smoke", version: "0.1.0" }, null, 2),
);
fs.writeFileSync(path.join(workspace, ".gitignore"), ".openxiangda/\ndist/\nnode_modules/\n");
fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
fs.writeFileSync(path.join(workspace, "src", "app.js"), "export const runtime = 'base';\n");
fs.writeFileSync(
  path.join(workspace, "dist", "index.html"),
  '<!doctype html><html><head><script type="module" src="/service/openxiangda-api/v1/apps/APP_TEST/runtime/releases/by-build/build-smoke/files/assets/app.js"></script></head><body><div id="root"></div></body></html>',
);
runGit("init", "-q");
runGit("config", "user.name", "Runtime Smoke");
runGit("config", "user.email", "runtime-smoke@example.com");
runGit("add", ".gitignore", "package.json", "src/app.js");
runGit("commit", "-qm", "initial runtime source");
runGit("branch", "-M", "main");
runGit("init", "--bare", "-q", origin);
runGit("--git-dir", origin, "symbolic-ref", "HEAD", "refs/heads/main");
runGit("remote", "add", "origin", origin);
runGit("push", "-qu", "origin", "main");
activeRuntimeSourceRevision = readGitSourceBase(workspace, "HEAD");
const linkedWorktree = path.join(tempRoot, "linked-worktree");
runGit("worktree", "add", "-q", "--detach", linkedWorktree, "HEAD");
const linkedRevision = readGitSourceBase(linkedWorktree, "HEAD");
if (linkedRevision.repo !== activeRuntimeSourceRevision.repo) {
  throw new Error("linked Git worktrees must share one runtime repository identity");
}
runGit("worktree", "remove", "--force", linkedWorktree);
fs.mkdirSync(path.join(workspace, "openspec", "runtime-evidence"), {
  recursive: true,
});
fs.writeFileSync(
  path.join(workspace, "openspec", "runtime-evidence", "release.json"),
  `${JSON.stringify({ verificationStage: "prepublish", passed: true })}\n`,
);
if (listRuntimeBuildInputChanges(workspace).length !== 0) {
  throw new Error("SDD openspec evidence must not deadlock the Runtime clean-source guard");
}
fs.rmSync(path.join(workspace, "openspec"), { recursive: true, force: true });
fs.writeFileSync(path.join(workspace, "dist", "assets", "app.js"), "console.log('ok');\n");
fs.writeFileSync(
  path.join(workspace, ".openxiangda", "state.json"),
  JSON.stringify(
    {
      version: 1,
      profiles: {
        [profileName]: {
          baseUrl: "",
          appType,
          resources: {},
        },
      },
    },
    null,
    2,
  ),
);

const readRequestJson = (request, callback) => {
  let raw = "";
  request.on("data", chunk => {
    raw += chunk;
  });
  request.on("end", () => callback(raw ? JSON.parse(raw) : {}));
};

const server = http.createServer((request, response) => {
  response.setHeader("content-type", "application/json");
  const url = new URL(request.url, "http://127.0.0.1");
  if (
    request.method === "POST" &&
    url.pathname === `/service/openxiangda-api/v1/apps/${appType}/change-baselines`
  ) {
    readRequestJson(request, body => {
      response.end(
        JSON.stringify({
          code: 200,
          data: {
            baselineId: "BASELINE_RUNTIME",
            appType,
            changeId: body.changeId,
            clientSessionId: body.clientSessionId,
            sourceBase: body.sourceBase,
            headDigest: "a".repeat(64),
            resourceHeads: {
              Function: {},
              Automation: {},
              Runtime: {
                active: {
                  kind: "Runtime",
                  code: "active",
                  fields: {},
                },
              },
            },
            createdAt: new Date().toISOString(),
          },
        }),
      );
    });
    return;
  }
  if (
    request.method === "POST" &&
    url.pathname === `/service/openxiangda-api/v1/apps/${appType}/publish-lease/acquire`
  ) {
    publishLeaseAcquireCount += 1;
    readRequestJson(request, body => {
      response.end(
        JSON.stringify({
          code: 200,
          data: {
            leaseId: "LEASE_RUNTIME",
            appType,
            changeId: body.changeId,
            clientSessionId: body.clientSessionId,
            baseRevision: body.baseRevision,
            expiresAt: "2099-07-15T08:00:00.000Z",
            holder: "self",
          },
        }),
      );
    });
    return;
  }
  if (
    request.method === "POST" &&
    url.pathname ===
      `/service/openxiangda-api/v1/apps/${appType}/publish-lease/LEASE_RUNTIME/renew`
  ) {
    readRequestJson(request, body => {
      assert.equal(body.ttlSeconds, 120);
      response.end(
        JSON.stringify({
          code: 200,
          data: {
            leaseId: "LEASE_RUNTIME",
            appType,
            changeId: "runtime-deploy",
            expiresAt: new Date(Date.now() + body.ttlSeconds * 1000).toISOString(),
            holder: "self",
          },
        }),
      );
    });
    return;
  }
  if (
    request.method === "POST" &&
    url.pathname ===
      `/service/openxiangda-api/v1/apps/${appType}/publish-lease/LEASE_RUNTIME/release`
  ) {
    readRequestJson(request, body => {
      if (body.completion === "direct-publish-completed") {
        publishLeaseReleaseCount += 1;
      } else {
        assert.equal(body.completion, "mainline-integrated");
        managedPublishLeaseReleaseCount += 1;
      }
      response.end(
        JSON.stringify({
          code: 200,
          data: {
            active: false,
            leaseId: "LEASE_RUNTIME",
            appType,
          },
        }),
      );
    });
    return;
  }
  if (
    request.method === "POST" &&
    url.pathname ===
      `/service/openxiangda-api/v1/apps/${appType}/change-baselines/BASELINE_RUNTIME/preflight`
  ) {
    readRequestJson(request, body => {
      response.end(
        JSON.stringify({
          code: 200,
          data: {
            ok: true,
            baselineId: "BASELINE_RUNTIME",
            checkedTargets: body.targets || [],
          },
        }),
      );
    });
    return;
  }
  if (
    request.method === "GET" &&
    url.pathname ===
      `/service/openxiangda-api/v1/apps/${appType}/runtime/releases/head`
  ) {
    runtimeHeadRequestCount += 1;
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          activeRuntimeReleaseId,
          activeRuntimeBuildId: activeRuntimeReleaseId ? "build-active" : null,
          activeRuntimeSourceRevision,
          updatedAt: "2026-07-15T08:00:00.000Z",
        },
      }),
    );
    return;
  }
  if (
    request.method === "GET" &&
    url.pathname.startsWith(
      `/service/openxiangda-api/v1/apps/${appType}/runtime/releases/by-build/`,
    ) &&
    !url.pathname.includes("/files/")
  ) {
    exactBuildLookupCount += 1;
    if (!exactBuildLookupSupported) {
      response.statusCode = 404;
      response.end(JSON.stringify({ code: 404, message: "not found" }));
      return;
    }
    const buildId = decodeURIComponent(url.pathname.split("/").at(-1));
    response.end(
      JSON.stringify({
        code: 200,
        data: runtimeReleasesByBuild.get(buildId) || null,
      }),
    );
    return;
  }
  if (
    request.method === "GET" &&
    url.pathname ===
      `/service/openxiangda-api/v1/apps/${appType}/runtime/releases`
  ) {
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          items: [
            {
              id: "REL_LIST",
              buildId: "build-list",
              status: "active",
              contentHash: "e".repeat(64),
              manifestJson: {
                files: Array.from({ length: 20 }, (_, index) => ({
                  path: `assets/chunk-${index}.js`,
                  sha256: "f".repeat(64),
                })),
              },
              createdAt: "2026-07-15T08:00:00.000Z",
            },
            ...runtimeReleasesByBuild.values(),
          ],
          total: 1 + runtimeReleasesByBuild.size,
        },
      }),
    );
    return;
  }
  if (
    request.method === "GET" &&
    url.pathname === `/service/openxiangda-api/v1/apps/${appType}/snapshot`
  ) {
    snapshotRequestCount += 1;
    response.end(
      JSON.stringify({
        code: 200,
        data: {
          app: {
            appType,
            activeRuntimeReleaseId,
            activeRuntimeSourceRevision,
            updatedAt: "2026-07-15T08:00:00.000Z",
          },
        },
      }),
    );
    return;
  }
  if (
    request.method === "POST" &&
    url.pathname === `/service/openxiangda-api/v1/apps/${appType}/runtime/releases/oss-upload-plan`
  ) {
    uploadPlanRequestCount += 1;
    let raw = "";
    request.on("data", chunk => {
      raw += chunk;
    });
    request.on("end", () => {
      const body = JSON.parse(raw);
      if (body.planOnly && body.buildId === "build-smoke") {
        response.statusCode = 404;
        response.end(JSON.stringify({ code: 404, message: "OSS preflight unavailable" }));
        return;
      }
      const storageProvider = String(body.buildId || "").includes("cos") ? "cos" : "oss";
      const uploadPathPrefix = storageProvider === "cos" ? "/cos-upload/" : "/oss-upload/";
      const metadataHeader =
        storageProvider === "cos"
          ? "x-cos-meta-openxiangda-sha256"
          : "x-oss-meta-openxiangda-sha256";
      const storagePrefix = `openxiangda/runtime/TENANT/${appType}/${body.buildId}`;
      const assetBaseUrl = `https://cdn.example.com/${storagePrefix}/`;
      response.end(
        JSON.stringify({
          code: 200,
          data: {
            provider: storageProvider,
            storageProvider,
            uploadProvider: "builtin-oss",
            bucketName: "platform-bucket",
            region: storageProvider === "cos" ? "ap-nanjing" : "oss-cn-test",
            storagePrefix,
            assetBaseUrl,
            indexUrl: `${assetBaseUrl}index.html`,
            files: (body.files || []).map(file => ({
              ...file,
              provider: storageProvider,
              storageProvider,
              uploadProvider: "builtin-oss",
              uploadMethod: "put",
              uploadUrl: `http://127.0.0.1:${server.address().port}${uploadPathPrefix}${encodeURIComponent(file.path)}`,
              headers: {
                "content-type": file.contentType,
                [metadataHeader]: file.sha256,
              },
              objectName: `${storagePrefix}/${file.path}`,
              bucketName: "platform-bucket",
              publicUrl: `${assetBaseUrl}${file.path}`,
            })),
          },
        }),
      );
    });
    return;
  }
  if (
    request.method === "PUT" &&
    (url.pathname.startsWith("/oss-upload/") || url.pathname.startsWith("/cos-upload/"))
  ) {
    const isCosUpload = url.pathname.startsWith("/cos-upload/");
    const uploadPathPrefix = isCosUpload ? "/cos-upload/" : "/oss-upload/";
    const targetUploads = isCosUpload ? cosUploadedFiles : ossUploadedFiles;
    const metadataHeader = isCosUpload
      ? "x-cos-meta-openxiangda-sha256"
      : "x-oss-meta-openxiangda-sha256";
    const chunks = [];
    request.on("data", chunk => {
      chunks.push(chunk);
    });
    request.on("end", () => {
      targetUploads.push({
        path: decodeURIComponent(url.pathname.slice(uploadPathPrefix.length)),
        contentTypeHeader: request.headers["content-type"],
        shaHeader: request.headers[metadataHeader],
        body: Buffer.concat(chunks),
      });
      response.statusCode = 200;
      response.end("");
    });
    return;
  }
  if (
    request.method === "POST" &&
    url.pathname === `/service/openxiangda-api/v1/apps/${appType}/runtime/releases/files`
  ) {
    const chunks = [];
    request.on("data", chunk => {
      chunks.push(chunk);
    });
    request.on("end", () => {
      const body = Buffer.concat(chunks);
      const item = {
        path: url.searchParams.get("path"),
        size: Number(url.searchParams.get("size")),
        sha256: url.searchParams.get("sha256"),
        contentType: url.searchParams.get("contentType"),
        traceId: request.headers["x-openxiangda-trace-id"],
        contentTypeHeader: request.headers["content-type"],
        body,
      };
      uploadedFiles.push(item);
      response.end(
        JSON.stringify({
          code: 200,
          data: {
            path: item.path,
            size: item.size,
            sha256: item.sha256,
            contentType: item.contentType,
            objectName: `openxiangda/runtime/TENANT/${appType}/build-smoke/${item.path}`,
          },
        }),
      );
    });
    return;
  }
  if (
    request.method === "POST" &&
    url.pathname.startsWith(
      `/service/openxiangda-api/v1/apps/${appType}/runtime/releases/`,
    ) &&
    url.pathname.endsWith("/abort")
  ) {
    runtimeAbortRequestCount += 1;
    const releaseId = decodeURIComponent(url.pathname.split("/").at(-2));
    readRequestJson(request, body => {
      const entry = Array.from(runtimeReleasesByBuild.entries()).find(
        ([, release]) => release.id === releaseId,
      );
      assert.ok(entry, `abort target ${releaseId} must exist`);
      const [buildId, release] = entry;
      assert.equal(body.publishLeaseId, "LEASE_RUNTIME");
      assert.equal(body.expectedBuildId, buildId);
      assert.equal(body.expectedContentHash, release.contentHash);
      assert.deepEqual(body.expectedSourceRevision, release.sourceRevision);
      assert.equal(body.expectedParentReleaseId, release.parentReleaseId);
      assert.notDeepEqual(
        body.replacementSourceRevision,
        release.sourceRevision,
      );
      runtimeReleasesByBuild.delete(buildId);
      response.end(
        JSON.stringify({
          code: 200,
          data: {
            ...release,
            status: "aborted",
            abortReason: body.reason,
            abortReplacementSourceRevision: body.replacementSourceRevision,
          },
        }),
      );
    });
    return;
  }
  if (
    request.method === "POST" &&
    request.url === `/service/openxiangda-api/v1/apps/${appType}/runtime/releases`
  ) {
    releaseCreateRequestCount += 1;
    let raw = "";
    request.on("data", chunk => {
      raw += chunk;
    });
    request.on("end", () => {
      capturedBody = JSON.parse(raw);
      const reusable = runtimeReleasesByBuild.get(capturedBody.buildId);
      if (reusable) {
        response.end(JSON.stringify({ code: 200, data: reusable }));
        return;
      }
      const isDirectStorageRelease = (capturedBody.files || []).some(
        file => file.storageProvider === "oss" || file.storageProvider === "cos",
      );
      const assetBaseUrl = isDirectStorageRelease
        ? `https://cdn.example.com/openxiangda/runtime/TENANT/${appType}/${capturedBody.buildId}/`
        : `/service/openxiangda-api/v1/apps/${appType}/runtime/releases/by-build/${capturedBody.buildId}/files/`;
      response.end(
        JSON.stringify({
          code: 200,
          data: {
            id: "REL_1",
            buildId: capturedBody.buildId,
            contentHash: "d".repeat(64),
            assetBaseUrl,
            indexUrl: `${assetBaseUrl}index.html`,
          },
        }),
      );
    });
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ code: 404, message: "not found" }));
});

const listen = () =>
  new Promise(resolve => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });

const runOpenXiangda = args =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(repoRoot, "bin", "openxiangda.js"), ...args],
      {
        cwd: workspace,
        env: {
          ...process.env,
          HOME: tempHome,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => {
      stdout += chunk;
    });
    child.stderr.on("data", chunk => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", code => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || `exit ${code}`));
        return;
      }
      resolve(stdout);
    });
  });

const runOpenXiangdaFailure = async args => {
  try {
    await runOpenXiangda(args);
  } catch (error) {
    return String(error?.message || error);
  }
  throw new Error(`expected openxiangda to fail: ${args.join(" ")}`);
};

try {
  const port = await listen();
  fs.writeFileSync(
    path.join(workspace, ".openxiangda", "profiles.json"),
    JSON.stringify(
      {
        version: 1,
        currentProfile: profileName,
        profiles: {
          [profileName]: {
            name: profileName,
            baseUrl: `http://127.0.0.1:${port}/service`,
            token: { accessToken: "test-token" },
          },
        },
      },
      null,
      2,
    ),
  );
  const compactReleaseList = JSON.parse(
    await runOpenXiangda([
      "runtime",
      "releases",
      "--profile",
      profileName,
      "--json",
    ]),
  );
  if (compactReleaseList.items?.[0]?.manifestJson) {
    throw new Error("runtime releases should omit the full manifest by default");
  }
  const fullReleaseList = JSON.parse(
    await runOpenXiangda([
      "runtime",
      "releases",
      "--profile",
      profileName,
      "--full",
      "--json",
    ]),
  );
  if (fullReleaseList.items?.[0]?.manifestJson?.files?.length !== 20) {
    throw new Error("runtime releases --full should preserve the complete manifest");
  }
  const preflightAcquireCount = publishLeaseAcquireCount;
  const notReady = await runOpenXiangdaFailure([
    "runtime",
    "deploy",
    "--profile",
    profileName,
    "--build-id",
    "build-not-ready",
    "--json",
  ]);
  assert.match(notReady, /RUNTIME_BUILD_NOT_READY/);
  assert.equal(
    publishLeaseAcquireCount,
    preflightAcquireCount,
    "runtime build readiness must fail before acquiring a publish lease",
  );

  fs.writeFileSync(
    path.join(workspace, "package.json"),
    JSON.stringify(
      {
        name: "runtime-deploy-smoke",
        version: "0.1.0",
        scripts: { build: `${process.execPath} -e \"process.exit(0)\"` },
      },
      null,
      2,
    ),
  );
  runGit("add", "package.json");
  runGit("commit", "-qm", "add runtime build script");
  runGit("push", "-q", "origin", "main");
  const sealedCandidateSourceRevision = prepareReleaseSourceRevision({
    cwd: workspace,
  });
  const sealedCandidateId = "10000000-0000-4000-8000-000000000257";
  const sealedCandidateBundle = buildCandidateBundle({
    cwd: workspace,
    logicalAppCode: "runtime-deploy-smoke",
    changeId: "sealed-candidate-runtime-source",
    sourceRevision: sealedCandidateSourceRevision,
    runtimeMode: "react-spa",
    targets: { runtime: true },
    files: ["package.json"],
    environmentBindings: {},
    runtimeArtifacts: [],
    prepublishVerificationHash: "a".repeat(64),
    candidatePreflightHash: "b".repeat(64),
    openxiangdaVersion: "1.0.257",
  });
  fs.mkdirSync(path.join(workspace, ".openxiangda", "candidates"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(
      workspace,
      ".openxiangda",
      "candidates",
      `${sealedCandidateId}.json`,
    ),
    `${JSON.stringify(
      {
        id: sealedCandidateId,
        logicalAppCode: "runtime-deploy-smoke",
        changeId: "sealed-candidate-runtime-source",
        sourceRevision: sealedCandidateSourceRevision,
        ...sealedCandidateBundle,
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(workspace, "README.md"),
    "unrelated mainline change after candidate sealing\n",
  );
  runGit("add", "README.md");
  runGit("commit", "-qm", "add unrelated mainline change");
  runGit("push", "-q", "origin", "main");
  const currentRuntimeSourceRevision = readGitSourceBase(workspace, "HEAD");
  const sharedModules = path.join(tempRoot, "shared-node-modules");
  fs.mkdirSync(sharedModules, { recursive: true });
  fs.symlinkSync(sharedModules, path.join(workspace, "node_modules"), "dir");

  const stdout = await runOpenXiangda([
    "runtime",
    "deploy",
    "--profile",
    profileName,
    "--build-id",
    "build-smoke",
    "--json",
  ]);
  const output = JSON.parse(stdout);
  if (output.buildId !== "build-smoke") {
    throw new Error(`expected build-smoke, got ${output.buildId}`);
  }
  const timingPhases = output.timings?.phases || [];
  const requiredTimingPhases = [
    "lease",
    "head",
    "preflight",
    "upload-plan",
    "build",
    "upload",
    "activate",
  ];
  if (
    output.timings?.operation !== "runtime deploy" ||
    requiredTimingPhases.some(phase =>
      !timingPhases.some(
        item =>
          item.name === phase &&
          (phase === "upload-plan"
            ? ["success", "failed"].includes(item.status)
            : item.status === "success")
      )
    ) ||
    timingPhases.some(item => !Number.isFinite(item.durationMs))
  ) {
    throw new Error(`unexpected runtime deploy timings: ${JSON.stringify(output.timings)}`);
  }
  if (capturedBody?.buildId !== "build-smoke") {
    throw new Error("runtime deploy did not send buildId");
  }
  if (uploadedFiles.length !== 2) {
    throw new Error(`expected 2 staged uploads, got ${uploadedFiles.length}`);
  }
  const uploadPaths = uploadedFiles.map(file => file.path).sort();
  if (uploadPaths.join(",") !== "assets/app.js,index.html") {
    throw new Error(`unexpected upload paths: ${uploadPaths.join(",")}`);
  }
  for (const file of uploadedFiles) {
    if (!String(file.contentTypeHeader || "").includes("multipart/form-data")) {
      throw new Error(`upload for ${file.path} was not multipart/form-data`);
    }
    if (!file.traceId) {
      throw new Error(`upload for ${file.path} did not include trace id`);
    }
    if (!file.body.includes(Buffer.from('name="file"'))) {
      throw new Error(`upload for ${file.path} did not include file field`);
    }
  }
  const filePaths = (capturedBody.files || []).map(file => file.path).sort();
  if (filePaths.join(",") !== "assets/app.js,index.html") {
    throw new Error(`unexpected files: ${filePaths.join(",")}`);
  }
  if ((capturedBody.files || []).some(file => "contentBase64" in file)) {
    throw new Error("final release payload should not include contentBase64");
  }
  if (capturedBody.activate !== true) {
    throw new Error("runtime deploy should activate by default");
  }
  if (
    publishLeaseAcquireCount !== 1 ||
    capturedBody.publishLeaseId !== "LEASE_RUNTIME"
  ) {
    throw new Error("runtime deploy must acquire and send the app publish lease");
  }
  if (
    output.publishLeaseLifecycle?.released !== true ||
    publishLeaseReleaseCount !== 1
  ) {
    throw new Error("activated runtime deploy must release its command-scoped lease");
  }
  if (
    capturedBody.expectedActiveReleaseId !== "REL_BASE" ||
    capturedBody.expectedRuntimeUpdatedAt !== "2026-07-15T08:00:00.000Z"
  ) {
    throw new Error("runtime deploy should send the captured activation baseline");
  }
  if (
    capturedBody.sourceRevision?.baseCommit !== currentRuntimeSourceRevision.baseCommit ||
    capturedBody.sourceRevision?.treeHash !== currentRuntimeSourceRevision.treeHash ||
    capturedBody.sourceRevision?.repo !== currentRuntimeSourceRevision.repo
  ) {
    throw new Error("runtime deploy should send the clean committed HEAD sourceRevision");
  }
  if (
    capturedBody.parentReleaseId !== "REL_BASE" ||
    capturedBody.parentSourceRevision?.baseCommit !== activeRuntimeSourceRevision.baseCommit
  ) {
    throw new Error("runtime deploy should freeze the current active runtime lineage parent");
  }
  if (output.lineageStatus !== "descendant") {
    throw new Error(`expected descendant lineage status, got ${output.lineageStatus}`);
  }
  const state = JSON.parse(
    fs.readFileSync(path.join(workspace, ".openxiangda", "state.json"), "utf8"),
  );
  if (state.profiles?.[profileName]?.runtime?.activeBuildId !== "build-smoke") {
    throw new Error("runtime deploy did not write activeBuildId to state");
  }
  await runOpenXiangda([
    "release",
    "begin",
    "--change",
    "sealed-candidate-runtime-source",
    "--candidate-id",
    sealedCandidateId,
    "--sealed-candidate-source",
    "--profile",
    profileName,
    "--json",
  ]);
  const sealedCandidateRuntimeOutput = JSON.parse(
    await runOpenXiangda([
      "runtime",
      "deploy",
      "--profile",
      profileName,
      "--build-id",
      "build-sealed-candidate-source",
      "--upload-mode",
      "legacy-json",
      "--no-build",
      "--no-activate",
      "--json",
    ]),
  );
  assert.equal(
    capturedBody.sourceRevision?.baseCommit,
    sealedCandidateSourceRevision.baseCommit,
    "a managed Runtime child must use the sealed candidate source revision",
  );
  assert.notEqual(
    capturedBody.sourceRevision?.baseCommit,
    currentRuntimeSourceRevision.baseCommit,
    "a later clean mainline HEAD must not replace sealed Runtime provenance",
  );
  assert.equal(
    sealedCandidateRuntimeOutput.sourceRevision?.treeHash,
    sealedCandidateSourceRevision.treeHash,
  );
  await runOpenXiangda([
    "release",
    "end",
    "--change",
    "sealed-candidate-runtime-source",
    "--profile",
    profileName,
    "--json",
  ]);
  assert.equal(
    managedPublishLeaseReleaseCount,
    1,
    "the sealed candidate release session must close its managed lease",
  );
  const ossDirectStdout = await runOpenXiangda([
    "runtime",
    "deploy",
    "--profile",
    profileName,
    "--build-id",
    "build-oss-smoke",
    "--upload-mode",
    "oss-direct",
    "--no-build",
    "--no-activate",
    "--json",
  ]);
  const ossDirectOutput = JSON.parse(ossDirectStdout);
  if (ossDirectOutput.storageProvider !== "oss") {
    throw new Error(`expected OSS direct storageProvider oss, got ${ossDirectOutput.storageProvider}`);
  }
  if (ossDirectOutput.assetBaseUrl !== "https://cdn.example.com/openxiangda/runtime/TENANT/APP_TEST/build-oss-smoke/") {
    throw new Error(`unexpected OSS direct assetBaseUrl: ${ossDirectOutput.assetBaseUrl}`);
  }
  if (ossUploadedFiles.length !== 2) {
    throw new Error(`expected 2 OSS uploads, got ${ossUploadedFiles.length}`);
  }
  const ossPaths = ossUploadedFiles.map(file => file.path).sort();
  if (ossPaths.join(",") !== "assets/app.js,index.html") {
    throw new Error(`unexpected OSS upload paths: ${ossPaths.join(",")}`);
  }
  if ((capturedBody.files || []).some(file => file.storageProvider !== "oss")) {
    throw new Error("OSS direct final release payload should mark files as storageProvider=oss");
  }
  if (capturedBody.activate !== false) {
    throw new Error("runtime deploy --no-activate should not activate");
  }
  if (capturedBody.publishLeaseId !== "LEASE_RUNTIME") {
    throw new Error("runtime deploy --no-activate must reuse the app publish lease");
  }
  if (
    ossDirectOutput.publishLeaseLifecycle?.retained !== true ||
    ossDirectOutput.publishLeaseLifecycle?.reason !== "staged-runtime" ||
    publishLeaseReleaseCount !== 1
  ) {
    throw new Error("staged runtime deploy must retain its lease for Root App finalize");
  }
  if (
    ossDirectOutput.stagedResource?.kind !== "RuntimeRelease" ||
    ossDirectOutput.stagedResource?.identity?.releaseId !== "REL_1" ||
    ossDirectOutput.stagedResource?.hash !== "d".repeat(64) ||
    ossDirectOutput.stagedResource?.metadata?.assetBaseUrl !==
      "https://cdn.example.com/openxiangda/runtime/TENANT/APP_TEST/build-oss-smoke/"
  ) {
    throw new Error(
      "runtime deploy --no-activate must return a canonical stagedResource with its asset URL",
    );
  }
  const stateAfterStage = JSON.parse(
    fs.readFileSync(path.join(workspace, ".openxiangda", "state.json"), "utf8"),
  );
  if (stateAfterStage.profiles?.[profileName]?.runtime?.activeBuildId !== "build-smoke") {
    throw new Error("runtime deploy --no-activate must not replace local active Runtime state");
  }
  if (
    stateAfterStage.profiles?.[profileName]?.promotion?.publishLease?.leaseId !==
    "LEASE_RUNTIME"
  ) {
    throw new Error("staged runtime deploy must preserve the local publish lease");
  }
  uploadedFiles.length = 0;
  ossUploadedFiles.length = 0;
  const autoOssStdout = await runOpenXiangda([
    "runtime",
    "deploy",
    "--profile",
    profileName,
    "--build-id",
    "build-auto-oss-smoke",
    "--no-build",
    "--no-activate",
    "--json",
  ]);
  const autoOssOutput = JSON.parse(autoOssStdout);
  if (autoOssOutput.uploadMode !== "oss-direct") {
    throw new Error(`expected auto uploadMode oss-direct, got ${autoOssOutput.uploadMode}`);
  }
  if (autoOssOutput.storageProvider !== "oss") {
    throw new Error(`expected auto OSS storageProvider oss, got ${autoOssOutput.storageProvider}`);
  }
  if (autoOssOutput.assetBaseUrl !== "https://cdn.example.com/openxiangda/runtime/TENANT/APP_TEST/build-auto-oss-smoke/") {
    throw new Error(`unexpected auto OSS assetBaseUrl: ${autoOssOutput.assetBaseUrl}`);
  }
  if (uploadedFiles.length !== 0) {
    throw new Error(`auto OSS deploy should not use staged uploads, got ${uploadedFiles.length}`);
  }
  if (ossUploadedFiles.length !== 2) {
    throw new Error(`expected 2 auto OSS uploads, got ${ossUploadedFiles.length}`);
  }
  if ((capturedBody.files || []).some(file => file.storageProvider !== "oss")) {
    throw new Error("auto OSS final release payload should mark files as storageProvider=oss");
  }
  uploadedFiles.length = 0;
  ossUploadedFiles.length = 0;
  cosUploadedFiles.length = 0;
  const cosDirectStdout = await runOpenXiangda([
    "runtime",
    "deploy",
    "--profile",
    profileName,
    "--build-id",
    "build-cos-smoke",
    "--upload-mode",
    "oss-direct",
    "--no-build",
    "--no-activate",
    "--json",
  ]);
  const cosDirectOutput = JSON.parse(cosDirectStdout);
  if (cosDirectOutput.storageProvider !== "cos") {
    throw new Error(`expected COS storageProvider, got ${cosDirectOutput.storageProvider}`);
  }
  if (cosDirectOutput.assetBaseUrl !== "https://cdn.example.com/openxiangda/runtime/TENANT/APP_TEST/build-cos-smoke/") {
    throw new Error(`unexpected COS direct assetBaseUrl: ${cosDirectOutput.assetBaseUrl}`);
  }
  if (cosUploadedFiles.length !== 2) {
    throw new Error(`expected 2 COS uploads, got ${cosUploadedFiles.length}`);
  }
  const cosPaths = cosUploadedFiles.map(file => file.path).sort();
  if (cosPaths.join(",") !== "assets/app.js,index.html") {
    throw new Error(`unexpected COS upload paths: ${cosPaths.join(",")}`);
  }
  if ((capturedBody.files || []).some(file => file.storageProvider !== "cos")) {
    throw new Error("COS direct final release payload should mark files as storageProvider=cos");
  }

  const reusableFiles = [
    runtimeFileDescriptor(
      path.join(workspace, "dist", "assets", "app.js"),
      "assets/app.js",
      "application/javascript; charset=utf-8",
    ),
    runtimeFileDescriptor(
      path.join(workspace, "dist", "index.html"),
      "index.html",
      "text/html; charset=utf-8",
    ),
  ];
  const reusableRelease = {
    id: "REL_REUSABLE_UPLOADED",
    appType,
    buildId: "build-reuse-uploaded",
    status: "uploaded",
    contentHash: calculateRuntimeReleaseContentHash(reusableFiles),
    sourceRevision: currentRuntimeSourceRevision,
    parentReleaseId: "REL_BASE",
    assetBaseUrl: `/service/openxiangda-api/v1/apps/${appType}/runtime/releases/by-build/build-reuse-uploaded/files/`,
  };
  assert.equal(
    assertRuntimeReleaseReusable(reusableRelease, {
      appType,
      buildId: reusableRelease.buildId,
      files: reusableFiles,
      sourceRevision: currentRuntimeSourceRevision,
      parentReleaseId: "REL_BASE",
    }),
    reusableRelease,
  );
  assert.throws(
    () =>
      assertRuntimeReleaseReusable(
        { ...reusableRelease, contentHash: "0".repeat(64) },
        {
          appType,
          buildId: reusableRelease.buildId,
          files: reusableFiles,
          sourceRevision: currentRuntimeSourceRevision,
          parentReleaseId: "REL_BASE",
        },
      ),
    error => error.code === "RUNTIME_RELEASE_REUSE_CONTENT_MISMATCH",
  );
  runtimeReleasesByBuild.set(reusableRelease.buildId, reusableRelease);
  const stagedUploadsBeforeReuse = uploadedFiles.length;
  const releaseCreatesBeforeReuse = releaseCreateRequestCount;
  const reuseOutput = JSON.parse(
    await runOpenXiangda([
      "runtime",
      "deploy",
      "--profile",
      profileName,
      "--build-id",
      reusableRelease.buildId,
      "--upload-mode",
      "staged",
      "--no-build",
      "--no-activate",
      "--json",
    ]),
  );
  assert.equal(reuseOutput.uploadMode, "reuse-existing");
  assert.equal(reuseOutput.release?.id, reusableRelease.id);
  assert.equal(
    uploadedFiles.length,
    stagedUploadsBeforeReuse,
    "an exact uploaded Runtime release must be reused without overwriting storage",
  );
  assert.equal(
    releaseCreateRequestCount,
    releaseCreatesBeforeReuse + 1,
    "reuse must still call finalization so the server revalidates content and source identity",
  );
  assert.ok(exactBuildLookupCount > 0);
  exactBuildLookupSupported = false;
  const stagedUploadsBeforeLegacyLookup = uploadedFiles.length;
  const legacyLookupOutput = JSON.parse(
    await runOpenXiangda([
      "runtime",
      "deploy",
      "--profile",
      profileName,
      "--build-id",
      reusableRelease.buildId,
      "--upload-mode",
      "staged",
      "--no-build",
      "--no-activate",
      "--json",
    ]),
  );
  exactBuildLookupSupported = true;
  assert.equal(legacyLookupOutput.uploadMode, "reuse-existing");
  assert.equal(legacyLookupOutput.release?.id, reusableRelease.id);
  assert.equal(
    uploadedFiles.length,
    stagedUploadsBeforeLegacyLookup,
    "CLI must fall back to the legacy release list without overwriting storage",
  );

  const staleLineageRelease = {
    ...reusableRelease,
    id: "REL_STALE_SOURCE",
    buildId: "build-recover-stale-source",
    sourceRevision: {
      ...currentRuntimeSourceRevision,
      baseCommit: "7".repeat(40),
      treeHash: "8".repeat(40),
    },
  };
  runtimeReleasesByBuild.set(
    staleLineageRelease.buildId,
    staleLineageRelease,
  );
  const stagedUploadsBeforeSourceRecovery = uploadedFiles.length;
  const releasesBeforeSourceRecovery = releaseCreateRequestCount;
  const abortsBeforeSourceRecovery = runtimeAbortRequestCount;
  const sourceRecoveryOutput = JSON.parse(
    await runOpenXiangda([
      "runtime",
      "deploy",
      "--profile",
      profileName,
      "--build-id",
      staleLineageRelease.buildId,
      "--upload-mode",
      "staged",
      "--no-build",
      "--no-activate",
      "--recover-stale-source-mismatch",
      "--json",
    ]),
  );
  assert.equal(sourceRecoveryOutput.uploadMode, "reuse-aborted-storage");
  assert.equal(runtimeAbortRequestCount, abortsBeforeSourceRecovery + 1);
  assert.equal(releaseCreateRequestCount, releasesBeforeSourceRecovery + 1);
  assert.equal(
    uploadedFiles.length,
    stagedUploadsBeforeSourceRecovery,
    "source-lineage recovery must reuse exact staged bytes without overwriting storage",
  );
  assert.equal(capturedBody.buildId, staleLineageRelease.buildId);
  assert.deepEqual(capturedBody.sourceRevision, currentRuntimeSourceRevision);

  const dirtyBefore = {
    uploadPlanRequestCount,
    releaseCreateRequestCount,
    uploaded: uploadedFiles.length,
    oss: ossUploadedFiles.length,
    cos: cosUploadedFiles.length,
  };
  fs.writeFileSync(path.join(workspace, "src", "app.js"), "export const runtime = 'dirty';\n");
  const dirtyError = await runOpenXiangdaFailure([
    "runtime",
    "deploy",
    "--profile",
    profileName,
    "--build-id",
    "build-dirty-smoke",
    "--no-build",
    "--json",
  ]);
  if (!dirtyError.includes("RUNTIME_SOURCE_DIRTY")) {
    throw new Error(`dirty runtime should fail before upload: ${dirtyError}`);
  }
  if (
    uploadPlanRequestCount !== dirtyBefore.uploadPlanRequestCount ||
    releaseCreateRequestCount !== dirtyBefore.releaseCreateRequestCount ||
    uploadedFiles.length !== dirtyBefore.uploaded ||
    ossUploadedFiles.length !== dirtyBefore.oss ||
    cosUploadedFiles.length !== dirtyBefore.cos
  ) {
    throw new Error("dirty runtime guard must run before upload plan/upload/release POST");
  }
  fs.writeFileSync(path.join(workspace, "src", "app.js"), "export const runtime = 'base';\n");

  const baseBranch = runGit("branch", "--show-current");
  runGit("checkout", "-qb", "active-runtime-lineage");
  fs.writeFileSync(path.join(workspace, "src", "app.js"), "export const runtime = 'active';\n");
  runGit("add", "src/app.js");
  runGit("commit", "-qm", "newer active runtime");
  activeRuntimeSourceRevision = readGitSourceBase(workspace, "HEAD");
  activeRuntimeReleaseId = "REL_ACTIVE";
  runGit("checkout", "-q", baseBranch);

  const staleSourceRevision = readGitSourceBase(workspace, "HEAD");
  const staleBefore = {
    uploadPlanRequestCount,
    releaseCreateRequestCount,
    uploaded: uploadedFiles.length,
    oss: ossUploadedFiles.length,
    cos: cosUploadedFiles.length,
  };
  const staleError = await runOpenXiangdaFailure([
    "runtime",
    "deploy",
    "--profile",
    profileName,
    "--build-id",
    "build-stale-smoke",
    "--no-build",
    "--json",
  ]);
  if (!staleError.includes("RUNTIME_SOURCE_BASE_DIVERGED")) {
    throw new Error(`stale runtime should fail with source lineage conflict: ${staleError}`);
  }
  if (
    uploadPlanRequestCount !== staleBefore.uploadPlanRequestCount ||
    releaseCreateRequestCount !== staleBefore.releaseCreateRequestCount ||
    uploadedFiles.length !== staleBefore.uploaded ||
    ossUploadedFiles.length !== staleBefore.oss ||
    cosUploadedFiles.length !== staleBefore.cos
  ) {
    throw new Error("stale runtime guard must run before upload plan/upload/release POST");
  }
  const stalePreviewError = await runOpenXiangdaFailure([
    "runtime",
    "deploy",
    "--profile",
    profileName,
    "--build-id",
    "build-stale-preview-smoke",
    "--no-build",
    "--no-activate",
    "--json",
  ]);
  if (!stalePreviewError.includes("RUNTIME_SOURCE_BASE_DIVERGED")) {
    throw new Error(
      `stale --no-activate runtime should also fail lineage: ${stalePreviewError}`,
    );
  }
  if (
    uploadPlanRequestCount !== staleBefore.uploadPlanRequestCount ||
    releaseCreateRequestCount !== staleBefore.releaseCreateRequestCount ||
    uploadedFiles.length !== staleBefore.uploaded ||
    ossUploadedFiles.length !== staleBefore.oss ||
    cosUploadedFiles.length !== staleBefore.cos
  ) {
    throw new Error("stale preview guard must run before upload plan/upload/release POST");
  }

  const rollbackReason = "audited emergency runtime rollback";
  const rollbackStdout = await runOpenXiangda([
    "runtime",
    "deploy",
    "--profile",
    profileName,
    "--build-id",
    "build-rollback-smoke",
    "--no-build",
    "--upload-mode",
    "legacy-json",
    "--allow-runtime-rollback",
    "--reason",
    rollbackReason,
    "--json",
  ]);
  const rollbackOutput = JSON.parse(rollbackStdout);
  if (
    rollbackOutput.lineageStatus !== "rollback-bypass" ||
    capturedBody.lineageBypassReason !== rollbackReason
  ) {
    throw new Error("explicit rollback should carry an audited lineage bypass reason");
  }
  if (
    capturedBody.sourceRevision?.baseCommit !== staleSourceRevision.baseCommit ||
    capturedBody.parentReleaseId !== "REL_ACTIVE" ||
    capturedBody.parentSourceRevision?.baseCommit !== activeRuntimeSourceRevision.baseCommit
  ) {
    throw new Error("rollback release should freeze both stale source and current active parent");
  }
  assert.ok(runtimeHeadRequestCount > 0, "runtime deploy should use the exact head endpoint");
  assert.equal(
    snapshotRequestCount,
    0,
    "runtime deploy must not load the whole app snapshot when exact head is available",
  );
  console.log("runtime deploy smoke passed");
} finally {
  server.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function runtimeFileDescriptor(filePath, relativePath, contentType) {
  const buffer = fs.readFileSync(filePath);
  return {
    path: relativePath,
    size: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    contentType,
  };
}
