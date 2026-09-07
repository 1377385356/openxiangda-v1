import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { loadProjectState, saveProjectState } = require(path.join(repoRoot, "lib", "config.js"));

if (process.env.OPENXIANGDA_STATE_TEST_CHILD === "1") {
  const [workspace, profileName, resourceCode] = process.argv.slice(2);
  const state = loadProjectState(workspace);
  process.send?.({ type: "ready" });
  await new Promise((resolve) => process.once("message", resolve));
  state.profiles ||= {};
  state.profiles[profileName] ||= {
    baseUrl: "https://example.test/service",
    appType: `APP_${profileName.toUpperCase()}`,
    resources: {},
  };
  state.profiles[profileName].resources ||= {};
  state.profiles[profileName].resources.functions ||= {};
  state.profiles[profileName].resources.functions[resourceCode] = {
    functionId: `FUNCTION_${resourceCode.toUpperCase()}`,
    updatedAt: new Date().toISOString(),
  };
  state.profiles[profileName].updatedAt = new Date().toISOString();
  saveProjectState(state, workspace);
  process.send?.({ type: "saved" });
  process.exit(0);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openxiangda-state-concurrency-"));
const stateFile = path.join(tempRoot, ".openxiangda", "state.json");

function waitForMessage(child, expectedType) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`child ${child.pid} timed out waiting for ${expectedType}`)),
      15_000,
    );
    const onMessage = (message) => {
      if (message?.type !== expectedType) return;
      clearTimeout(timeout);
      child.off("error", onError);
      resolve(message);
    };
    const onError = (error) => {
      clearTimeout(timeout);
      child.off("message", onMessage);
      reject(error);
    };
    child.on("message", onMessage);
    child.once("error", onError);
  });
}

function waitForExit(child, stderr) {
  return new Promise((resolve, reject) => {
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`child ${child.pid} exited ${code || signal}: ${stderr.value}`));
    });
    child.once("error", reject);
  });
}

async function runConcurrentRound(round, count = 12) {
  const children = [];
  for (let index = 0; index < count; index += 1) {
    const profileName = `profile_${index % 3}`;
    const resourceCode = `round_${round}_function_${index}`;
    const stderr = { value: "" };
    const child = fork(fileURLToPath(import.meta.url), [tempRoot, profileName, resourceCode], {
      env: { ...process.env, OPENXIANGDA_STATE_TEST_CHILD: "1" },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    child.stderr.on("data", (chunk) => {
      stderr.value += chunk.toString();
    });
    children.push({ child, stderr, ready: waitForMessage(child, "ready") });
  }
  await Promise.all(children.map((entry) => entry.ready));

  let parseError = null;
  const reader = setInterval(() => {
    try {
      JSON.parse(fs.readFileSync(stateFile, "utf8"));
    } catch (error) {
      parseError ||= error;
    }
  }, 1);
  for (const { child } of children) child.send({ type: "save" });
  await Promise.all(children.map(({ child, stderr }) => waitForExit(child, stderr)));
  clearInterval(reader);
  assert.equal(parseError, null, `state.json was partially written: ${parseError?.message}`);
}

try {
  saveProjectState({ version: 1, profiles: {} }, tempRoot);
  for (let round = 0; round < 4; round += 1) await runConcurrentRound(round);

  const merged = loadProjectState(tempRoot);
  for (let round = 0; round < 4; round += 1) {
    for (let index = 0; index < 12; index += 1) {
      const profileName = `profile_${index % 3}`;
      const resourceCode = `round_${round}_function_${index}`;
      assert.equal(
        merged.profiles[profileName].resources.functions[resourceCode].functionId,
        `FUNCTION_${resourceCode.toUpperCase()}`,
      );
    }
  }

  const first = loadProjectState(tempRoot);
  const stale = loadProjectState(tempRoot);
  first.profiles.profile_0.resources.functions.same_key = { functionId: "FUNCTION_FIRST" };
  stale.profiles.profile_0.resources.functions.same_key = { functionId: "FUNCTION_STALE" };
  saveProjectState(first, tempRoot);
  assert.throws(
    () => saveProjectState(stale, tempRoot),
    (error) => error?.code === "OPENXIANGDA_STATE_CONFLICT" && error.path.endsWith("functionId"),
  );

  const deleteSnapshot = loadProjectState(tempRoot);
  const addSnapshot = loadProjectState(tempRoot);
  delete deleteSnapshot.profiles.profile_0.resources.functions.same_key;
  addSnapshot.profiles.profile_0.resources.functions.concurrent_add = {
    functionId: "FUNCTION_CONCURRENT_ADD",
  };
  saveProjectState(deleteSnapshot, tempRoot);
  saveProjectState(addSnapshot, tempRoot);
  const afterDeleteAndAdd = loadProjectState(tempRoot);
  assert.equal(afterDeleteAndAdd.profiles.profile_0.resources.functions.same_key, undefined);
  assert.equal(
    afterDeleteAndAdd.profiles.profile_0.resources.functions.concurrent_add.functionId,
    "FUNCTION_CONCURRENT_ADD",
  );

  fs.writeFileSync(stateFile, "{broken json", "utf8");
  assert.throws(
    () => saveProjectState({ version: 1, profiles: { recovery: {} } }, tempRoot),
    (error) => error?.code === "OPENXIANGDA_STATE_INVALID",
  );
  assert.equal(fs.readFileSync(stateFile, "utf8"), "{broken json");

  const leftovers = fs
    .readdirSync(path.dirname(stateFile))
    .filter((name) => name.includes(".tmp") || name.endsWith(".lock"));
  assert.deepEqual(leftovers, []);
  console.log("project state concurrency smoke passed (48 concurrent writes + conflict/deletion checks)");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
