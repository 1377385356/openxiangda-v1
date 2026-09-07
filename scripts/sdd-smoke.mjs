import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(repoRoot, "bin", "openxiangda.js");
const require = createRequire(import.meta.url);
const sddLib = require(path.join(repoRoot, "lib", "sdd.js"));
const releaseMainline = require(path.join(repoRoot, "lib", "release-mainline.js"));

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: options.cwd || repoRoot,
    env: {
      ...process.env,
      HOME: options.home || process.env.HOME,
      CODEX_HOME: options.codexHome || process.env.CODEX_HOME,
    },
    encoding: "utf8",
  });
  if (options.expectFailure) {
    if (result.status === 0) {
      throw new Error(`${args.join(" ")} should have failed`);
    }
    return result;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${args.join(" ")} failed`);
  }
  return result;
}

function runJson(args, options = {}) {
  const result = run([...args, "--json"], options);
  return JSON.parse(result.stdout);
}

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  }
}

function initGit(cwd, options = {}) {
  git(["init", "-b", "main"], cwd);
  git(["config", "user.email", "openxiangda@example.test"], cwd);
  git(["config", "user.name", "OpenXiangda Smoke"], cwd);
  git(["add", "."], cwd);
  git(["commit", "-m", "baseline"], cwd);
  if (options.remote) {
    const remote = path.join(tempRoot, `${path.basename(cwd)}-origin.git`);
    git(["init", "--bare", "--initial-branch=main", remote], tempRoot);
    git(["remote", "add", "origin", remote], cwd);
    git(["push", "-u", "origin", "main"], cwd);
  }
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function enableV1StrictSdd(workspace) {
  const configFile = path.join(workspace, "app-workspace.config.ts");
  fs.writeFileSync(
    configFile,
    fs
      .readFileSync(configFile, "utf8")
      .replace("deliveryVersion: 2", "deliveryVersion: 1")
      .replace("enabled: false", "enabled: true")
      .replace("strictHighRisk: false", "strictHighRisk: true"),
  );
}

function completeSddChecklist(changeDir) {
  if (!fs.existsSync(path.join(changeDir, "tasks.md"))) {
    sddLib.renderSddDocumentation({
      cwd: path.dirname(path.dirname(path.dirname(changeDir))),
      changeId: path.basename(changeDir),
    });
  }
  for (const name of ["tasks.md", "evidence.md"]) {
    const file = path.join(changeDir, name);
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/- \[ \]/g, "- [x]"));
  }
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openxiangda-sdd-smoke-"));
try {
  const workspace = path.join(tempRoot, "workspace");
  const init = runJson(["workspace", "init", workspace, "--runtime", "react-spa"]);
  assert(init.sdd?.initialized, "workspace init should initialize SDD");
  assert(init.sdd?.schemaVersion === "openxiangda-sdd-v2", "workspace init should initialize SDD v2");
  assert(fs.existsSync(path.join(workspace, "openspec", "config.yaml")), "missing openspec/config.yaml");
  assert(fs.existsSync(path.join(workspace, "openspec", "specs", "app", "spec.md")), "missing application spec");

  const status = runJson(["sdd", "status"], { cwd: workspace });
  assert(status.governance.initialized, "sdd status should detect initialized workspace");
  assert(status.schemaVersion === "openxiangda-sdd-v2", "sdd status should expose schemaVersion");
  assert(Array.isArray(status.specSummaries), "sdd status should expose specSummaries");

  const scopeWorkspace = path.join(tempRoot, "scope-workspace");
  fs.mkdirSync(scopeWorkspace, { recursive: true });
  sddLib.initSddWorkspace({ cwd: scopeWorkspace });
  const separated = sddLib.proposeSddChange({
    cwd: scopeWorkspace,
    changeId: "separate-release-scopes",
    title: "Separate authored, dependency, and deploy scope",
    affected: {
      functions: ["changed_function"],
      files: ["src/functions/changed_function/index.ts"],
    },
    scopes: {
      changedResources: {
        functions: ["changed_function"],
        files: ["src/functions/changed_function/index.ts"],
      },
      runtimeDependencies: {
        functions: ["shared_consumer"],
        forms: ["read_only_dependency"],
      },
      deployTargets: {
        functions: ["changed_function"],
      },
    },
  });
  const separatedScope = sddLib.getSddChangeScope({
    cwd: scopeWorkspace,
    changeId: separated.change.id,
  });
  assert(
    JSON.stringify(separatedScope.targets.functions) ===
      JSON.stringify(["changed_function"]),
    "runtime dependencies must not silently broaden deploy targets",
  );
  assert(
    JSON.stringify(separatedScope.targets.forms) === JSON.stringify([]),
    "a dependency-only form must not become a Form release target",
  );
  assert(
    JSON.stringify(
      separatedScope.scopeModel.runtimeDependencies.forms,
    ) === JSON.stringify(["read_only_dependency"]),
    "runtimeDependencies should remain independently inspectable",
  );
  assert(
    JSON.stringify(separated.release.targets.functions) ===
      JSON.stringify(["changed_function"]),
    "release.json must be generated from deployTargets only",
  );

  initGit(workspace, { remote: true });
  write(path.join(workspace, "src", "pages", "customer", "index.tsx"), "export const page = 'customer';\n");

  // Delivery V2 deliberately does not use SDD as a release gate. Keep this
  // scenario on the V1 compatibility path so it continues to cover the
  // historical strict SDD behavior instead of contradicting the V2 contract.
  enableV1StrictSdd(workspace);

  const failedCheck = run(["workspace", "check", "--changed", "--json"], {
    cwd: workspace,
    expectFailure: true,
  });
  const failedPlan = JSON.parse(failedCheck.stdout);
  assert(
    failedPlan.errors.some(error => error.name === "sdd-approved-change-required"),
    "strict workspace should fail without approved SDD change",
  );

  const proposed = runJson(
    [
      "sdd",
      "propose",
      "add-customer-page",
      "--title",
      "Add customer page",
      "--pages",
      "customer",
      "--runtime",
    ],
    { cwd: workspace },
  );
  assert(proposed.change.id === "add-customer-page", "unexpected change id");
  assert(proposed.schemaVersion === "openxiangda-sdd-v2", "propose should create SDD v2 change");
  assert(
    proposed.change.scopes?.schemaVersion ===
      "openxiangda-sdd-scopes-v1",
    "new changes should record the three-scope model",
  );
  assert(
    proposed.change.scopes.changedResources.pages.includes("customer") &&
      proposed.change.scopes.changedResources.runtime === true,
    "legacy affected flags should map to changedResources",
  );
  assert(
    proposed.change.scopes.deployTargets.pages.includes("customer") &&
      proposed.change.scopes.deployTargets.runtime === true,
    "legacy affected flags should remain backwards-compatible deploy targets",
  );
  assert(
    proposed.change.scopes.runtimeDependencies.functions.length === 0,
    "runtimeDependencies should be explicit instead of inferred from deploy scope",
  );
  assert(
    JSON.stringify(proposed.release.scopeModel) ===
      JSON.stringify(proposed.change.scopes),
    "release.json should preserve the authored scope model",
  );
  assert(
    /^[a-f0-9]{40,64}$/.test(proposed.change.sourceBase?.baseCommit || "") &&
      /^[a-f0-9]{40,64}$/.test(proposed.change.sourceBase?.treeHash || ""),
    "propose should freeze the Git source base for stale-worktree protection",
  );
  assert(fs.existsSync(path.join(workspace, "openspec", "changes", "add-customer-page", "coverage.json")), "missing coverage.json");
  assert(fs.existsSync(path.join(workspace, "openspec", "changes", "add-customer-page", "release.json")), "missing release.json");
  assert(
    !fs.existsSync(path.join(workspace, "openspec", "changes", "add-customer-page", "proposal.md")),
    "streamlined SDD should not generate prose by default",
  );
  const rendered = runJson(["sdd", "render", "add-customer-page"], { cwd: workspace });
  assert(rendered.rendered.length === 5, "sdd render should materialize the optional prose set");

  const approved = runJson(["sdd", "approve", "add-customer-page", "--summary", "confirmed"], {
    cwd: workspace,
  });
  assert(approved.change.status === "approved", "approve should update status");

  const unfinishedCheckJson = runJson(
    ["workspace", "check", "--changed"],
    { cwd: workspace },
  );
  assert(
    !unfinishedCheckJson.errors.some(error => error.name === "sdd-unfinished-tasks"),
    "implementation workspace check should not block coding on unfinished SDD prose",
  );

  const streamlinedVerify = runJson(
    ["sdd", "verify", "add-customer-page", "--changed", "--profile", "dev"],
    { cwd: workspace },
  );
  assert(
    streamlinedVerify.passed &&
      streamlinedVerify.warnings.some(
        warning => warning.name === "sdd-unfinished-tasks",
      ),
    "streamlined verify should warn, not fail, on unfinished documentation",
  );

  const tasksFile = path.join(workspace, "openspec", "changes", "add-customer-page", "tasks.md");
  fs.writeFileSync(
    tasksFile,
    fs.readFileSync(tasksFile, "utf8").replace(/- \[ \]/g, "- [x]"),
  );
  const evidenceFile = path.join(workspace, "openspec", "changes", "add-customer-page", "evidence.md");
  fs.writeFileSync(
    evidenceFile,
    fs.readFileSync(evidenceFile, "utf8").replace(/- \[ \]/g, "- [x]"),
  );
  const verify = runJson(["sdd", "verify", "add-customer-page", "--changed", "--profile", "dev"], { cwd: workspace });
  assert(verify.passed, "verify should pass after tasks are complete");
  assert(verify.coverage?.requirements?.length > 0, "verify should expose coverage");
  assert(verify.release?.commands?.length > 0, "verify should update release commands");
  assert(
    verify.release.commands.some(
      command =>
        command.includes("runtime deploy") && command.includes("--no-activate"),
    ),
    "React SPA release plan must stage Runtime without direct activation",
  );
  assert(
    verify.release.commands.some(command => command.includes("release app-finalize")),
    "staged Runtime must be finalized by one Root App Release",
  );
  assert(
    !verify.release.commands.some(
      command =>
        command.includes("workspace publish") && command.includes("--form"),
    ),
    "SDD release commands must never generate direct Form schema publish",
  );
  const unsafeRuntimeReport = sddLib.buildSddGovernanceReport({
    cwd: workspace,
    configText: fs.readFileSync(
      path.join(workspace, "app-workspace.config.ts"),
      "utf8",
    ),
    targets: verify.targets,
    files: verify.release.changedFiles || [],
    commands: [
      "openxiangda runtime deploy --profile dev --change add-customer-page",
    ],
    actualCommands: true,
    changeId: "add-customer-page",
    verifyStage: "prepublish",
  });
  assert(
    unsafeRuntimeReport.errors.some(
      error => error.name === "sdd-release-runtime-direct-activation-forbidden",
    ),
    "the actual Runtime command must include --no-activate",
  );
  if ((verify.targets.forms || []).length > 0) {
    const unsafeFormReport = sddLib.buildSddGovernanceReport({
      cwd: workspace,
      configText: fs.readFileSync(
        path.join(workspace, "app-workspace.config.ts"),
        "utf8",
      ),
      targets: verify.targets,
      files: verify.release.changedFiles || [],
      commands: [
        `openxiangda resource publish form-setting --only ${verify.targets.forms.join(",")} --activate --profile dev --change add-customer-page`,
      ],
      actualCommands: true,
      changeId: "add-customer-page",
      verifyStage: "prepublish",
    });
    assert(
      unsafeFormReport.errors.some(
        error => error.name === "sdd-release-direct-form-activation-forbidden",
      ),
      "the actual Form bundle command must not use --activate",
    );
  }
  const passedCheck = runJson(["workspace", "check", "--changed"], { cwd: workspace });
  assert(passedCheck.errors.length === 0, "completed approved change should pass workspace check");
  assert(passedCheck.sdd?.activeChange?.id === "add-customer-page", "workspace check should expose activeChange");

  git(["add", "."], workspace);
  git(["commit", "-m", "release source"], workspace);
  git(["push", "origin", "main"], workspace);
  const releaseSourceRevision = releaseMainline.prepareReleaseSourceRevision({
    cwd: workspace,
  });
  sddLib.recordSddReleaseSourceRevision({
    cwd: workspace,
    changeId: "add-customer-page",
    releaseSourceRevision,
  });
  const recordedRelease = JSON.parse(
    fs.readFileSync(
      path.join(workspace, "openspec", "changes", "add-customer-page", "release.json"),
      "utf8",
    ),
  );
  const sourceRevisionAttestation = JSON.parse(
    fs.readFileSync(
      path.join(
        workspace,
        ".openxiangda",
        "releases",
        "add-customer-page",
        "source-revision.json",
      ),
      "utf8",
    ),
  );
  assert(
    sourceRevisionAttestation.releaseSourceRevision.baseCommit ===
      releaseSourceRevision.baseCommit,
    "the untracked release attestation should freeze the actual publish HEAD",
  );
  assert(
    sourceRevisionAttestation.mainlinePolicy === "publish-from-main-v1",
    "the release attestation should record publish-from-main policy",
  );
  assert(
    !recordedRelease.releaseSourceRevision,
    "release execution must not rewrite reviewed release.json",
  );
  let sourceRevisionCasError = null;
  try {
    sddLib.recordSddReleaseSourceRevision({
      cwd: workspace,
      changeId: "add-customer-page",
      releaseSourceRevision: {
        ...releaseSourceRevision,
        baseCommit: "f".repeat(40),
      },
    });
  } catch (error) {
    sourceRevisionCasError = error;
  }
  assert(
    sourceRevisionCasError?.code === "RELEASE_PUBLISH_REVISION_CHANGED",
    "a resumed release must not replace its frozen source revision attestation",
  );

  const archive = runJson(
    ["sdd", "archive", "add-customer-page", "--changed", "--profile", "dev"],
    { cwd: workspace },
  );
  assert(archive.archiveDir.includes("openspec/changes/archive/"), "archive should move change");
  const appSpec = fs.readFileSync(path.join(workspace, "openspec", "specs", "app", "spec.md"), "utf8");
  assert(appSpec.includes("### Requirement: Add customer page"), "archive should merge delta requirement into app spec");
  assert(!appSpec.includes("Archived Change:"), "archive should not append raw change blocks");

  const badCoverageWorkspace = path.join(tempRoot, "bad-coverage");
  sddLib.initSddWorkspace({ cwd: badCoverageWorkspace });
  sddLib.proposeSddChange({
    cwd: badCoverageWorkspace,
    changeId: "bad-coverage",
    affected: { forms: ["customer"], pages: ["dashboard"], runtime: true },
  });
  sddLib.approveSddChange({ cwd: badCoverageWorkspace, changeId: "bad-coverage" });
  const badCoverageDir = path.join(badCoverageWorkspace, "openspec", "changes", "bad-coverage");
  completeSddChecklist(badCoverageDir);
  const badCoverageFile = path.join(badCoverageDir, "coverage.json");
  const badCoverageJson = JSON.parse(fs.readFileSync(badCoverageFile, "utf8"));
  badCoverageJson.resources = { forms: [], pages: [], runtime: false, resources: false, files: [] };
  badCoverageJson.requirements[0].covers = { forms: [], pages: [], runtime: false, resources: false, files: [] };
  fs.writeFileSync(badCoverageFile, `${JSON.stringify(badCoverageJson, null, 2)}\n`);
  const badCoverage = sddLib.verifySddChange({
    cwd: badCoverageWorkspace,
    changeId: "bad-coverage",
    targets: { forms: ["customer"], pages: ["dashboard"], resources: false, runtime: true, other: [] },
    files: ["src/forms/customer/schema.ts", "src/pages/dashboard/index.tsx"],
  });
  assert(!badCoverage.passed, "coverage.json must not be auto-covered by change.json affected");
  assert(
    badCoverage.errors.some(error => error.name === "sdd-change-targets-uncovered"),
    "bad coverage should fail target coverage",
  );

  const bundleWorkspace = path.join(tempRoot, "mainline-bundle");
  fs.mkdirSync(bundleWorkspace, { recursive: true });
  sddLib.initSddWorkspace({ cwd: bundleWorkspace });
  write(
    path.join(bundleWorkspace, "app-workspace.config.ts"),
    'export default { runtimeMode: "react-spa" };\n',
  );
  initGit(bundleWorkspace, { remote: true });
  for (const [id, affected] of [
    ["fix-function", { functions: ["reservation_review_action"], backend: true, files: ["src/functions/reservation_review_action/index.ts"] }],
    ["fix-runtime", { pages: ["admin.orders"], runtime: true, files: ["src/pages/orders/index.tsx"] }],
  ]) {
    sddLib.proposeSddChange({ cwd: bundleWorkspace, changeId: id, affected });
    sddLib.approveSddChange({ cwd: bundleWorkspace, changeId: id });
  }
  const bundle = sddLib.createMainlineSddBundle({
    cwd: bundleWorkspace,
    changeId: "release-train",
    changes: "fix-function,fix-runtime",
    configText: 'export default { runtimeMode: "react-spa" };\n',
    profile: "dev",
  });
  assert(bundle.change.status === "approved", "mainline bundle should be pre-approved from approved inputs");
  assert(
    bundle.release.targets.functions.join(",") === "reservation_review_action" &&
      bundle.release.targets.runtime === true,
    "mainline bundle should union exact structured targets",
  );
  assert(
    bundle.bundledChanges.join(",") === "fix-function,fix-runtime",
    "mainline bundle should retain source change ids",
  );
  assert(
    bundle.change.baseRevision === bundle.change.sourceBase?.baseCommit &&
      bundle.release.baseRevision === bundle.change.baseRevision &&
      bundle.release.sourceBase?.treeHash === bundle.change.sourceBase?.treeHash,
    "mainline bundle should preserve the source changes' Git base instead of using its post-integration HEAD",
  );
  assert(
    bundle.release.integratedChanges.length === 2 &&
      bundle.release.integratedChanges.every(
        item =>
          item.sourceBase?.baseCommit === bundle.change.baseRevision &&
          item.baseRevision === item.sourceBase.baseCommit,
      ),
    "mainline bundle should retain each integrated change and its source baseline",
  );
  assert(
    bundle.release.targets.pages.length === 0,
    "React source pages must not become independent PageRelease targets",
  );
  assert(
    JSON.stringify(bundle.release.commands) ===
      JSON.stringify([
      "openxiangda resource publish function --only reservation_review_action --stage-only --profile dev --change release-train",
      "openxiangda runtime deploy --no-activate --profile dev --change release-train",
      "openxiangda release app-finalize --staged-resources-json .openxiangda/releases/release-train/staged-resources.json --wait --profile dev --change release-train",
      ]),
    "mainline bundle should contain one deterministic, exact staged command set",
  );
  for (const [id, affected] of [
    [
      "fix-business-task-form",
      {
        forms: ["business_task"],
        files: ["src/forms/business_task/schema.ts"],
      },
    ],
    [
      "fix-business-task-permission",
      {
        resourceSelectors: {
          formPermissionGroups: ["business_task_admin"],
        },
        files: [
          "src/resources/permissions/form-groups/business_task_admin.json",
        ],
      },
    ],
  ]) {
    sddLib.proposeSddChange({ cwd: bundleWorkspace, changeId: id, affected });
    sddLib.approveSddChange({ cwd: bundleWorkspace, changeId: id });
  }
  const mixedFormBundle = sddLib.createMainlineSddBundle({
    cwd: bundleWorkspace,
    changeId: "form-permission-release-train",
    changes: "fix-business-task-form,fix-business-task-permission",
    configText: 'export default { runtimeMode: "react-spa" };\n',
    profile: "dev",
  });
  assert(
    JSON.stringify(mixedFormBundle.release.commands) ===
      JSON.stringify([
        "openxiangda form ensure --only business_task --profile dev --change form-permission-release-train",
        "openxiangda resource publish form-setting,form-permission-group --only form-setting:business_task,form-permission-group:business_task_admin --profile dev --change form-permission-release-train",
        "openxiangda release app-finalize --staged-resources-json .openxiangda/releases/form-permission-release-train/staged-resources.json --wait --profile dev --change form-permission-release-train",
      ]),
    "mixed Form and permission changes must generate one qualified FormRelease command",
  );
  const mixedFormVerify = sddLib.verifySddChange({
    cwd: bundleWorkspace,
    changeId: "form-permission-release-train",
    stage: "prepublish",
    targets: mixedFormBundle.release.targets,
    files: mixedFormBundle.release.changedFiles,
  });
  assert(
    mixedFormVerify.passed,
    `the same-version prepublish verifier must accept its generated mixed Form bundle: ${JSON.stringify(mixedFormVerify.errors)}`,
  );
  const mixedFormCliVerify = runJson(
    [
      "sdd",
      "verify",
      "--change",
      "form-permission-release-train",
      "--stage",
      "prepublish",
      "--profile",
      "dev",
    ],
    { cwd: bundleWorkspace },
  );
  assert(
    mixedFormCliVerify.passed,
    `the generated bundle must pass the exact public CLI prepublish command: ${JSON.stringify(mixedFormCliVerify.errors)}`,
  );
  const inexactMixedFormVerify = sddLib.verifySddChange({
    cwd: bundleWorkspace,
    changeId: "form-permission-release-train",
    stage: "prepublish",
    targets: mixedFormBundle.release.targets,
    files: mixedFormBundle.release.changedFiles,
    releasePlan: {
      targets: mixedFormBundle.release.targets,
      changedFiles: mixedFormBundle.release.changedFiles,
      commands: [
        "openxiangda resource publish form-setting,form-permission-group --only form-setting:business_task --profile dev --change form-permission-release-train",
        "openxiangda release app-finalize --staged-resources-json .openxiangda/releases/form-permission-release-train/staged-resources.json --wait --profile dev --change form-permission-release-train",
      ],
    },
  });
  assert(
    inexactMixedFormVerify.errors.some(
      error => error.name === "sdd-release-form-scope-inexact",
    ) &&
      inexactMixedFormVerify.errors.some(
        error => error.name === "sdd-release-form-stage-missing",
      ),
    "mixed Form validation must still reject a missing permission-group selector",
  );
  const extraMixedFormVerify = sddLib.verifySddChange({
    cwd: bundleWorkspace,
    changeId: "form-permission-release-train",
    stage: "prepublish",
    targets: mixedFormBundle.release.targets,
    files: mixedFormBundle.release.changedFiles,
    releasePlan: {
      targets: mixedFormBundle.release.targets,
      changedFiles: mixedFormBundle.release.changedFiles,
      commands: [
        "openxiangda resource publish form-setting,form-permission-group --only form-setting:business_task,form-permission-group:business_task_admin,form-permission-group:unreviewed_admin --profile dev --change form-permission-release-train",
        "openxiangda release app-finalize --staged-resources-json .openxiangda/releases/form-permission-release-train/staged-resources.json --wait --profile dev --change form-permission-release-train",
      ],
    },
  });
  assert(
    extraMixedFormVerify.errors.some(
      error => error.name === "sdd-release-form-scope-inexact",
    ),
    "mixed Form validation must reject an unreviewed permission-group selector",
  );
  const templateBundle = sddLib.createMainlineSddBundle({
    cwd: bundleWorkspace,
    changeId: "release-train-template",
    changes: "fix-function,fix-runtime",
    configText: 'export default { runtimeMode: "react-spa" };\n',
  });
  assert(
    templateBundle.release.commands.every(command => command.includes("--profile <profile>")),
    "a profile-agnostic bundle should retain an auditable profile placeholder",
  );
  const templateActualVerify = sddLib.verifySddChange({
    cwd: bundleWorkspace,
    changeId: "release-train-template",
    stage: "prepublish",
    releasePlan: {
      targets: templateBundle.release.targets,
      activationTargets: templateBundle.release.targets,
      changedFiles: templateBundle.release.changedFiles,
      commands: [
        "openxiangda release app-finalize --staged-resources-json .openxiangda/releases/release-train-template/staged-resources.json --wait --profile dev --change release-train-template",
      ],
      actualCommands: true,
    },
  });
  assert(
    templateActualVerify.passed,
    `actual execution should bind a real profile without rewriting the reviewed template: ${JSON.stringify(templateActualVerify.errors)}`,
  );

  const missingReleaseWorkspace = path.join(tempRoot, "missing-release");
  sddLib.initSddWorkspace({ cwd: missingReleaseWorkspace });
  sddLib.proposeSddChange({
    cwd: missingReleaseWorkspace,
    changeId: "missing-release",
    affected: { forms: ["customer"], runtime: true },
  });
  sddLib.approveSddChange({ cwd: missingReleaseWorkspace, changeId: "missing-release" });
  const missingReleaseDir = path.join(missingReleaseWorkspace, "openspec", "changes", "missing-release");
  completeSddChecklist(missingReleaseDir);
  fs.rmSync(path.join(missingReleaseDir, "release.json"));
  const missingRelease = sddLib.verifySddChange({
    cwd: missingReleaseWorkspace,
    changeId: "missing-release",
    targets: { forms: ["customer"], pages: [], resources: false, runtime: true, other: [] },
    files: ["src/forms/customer/schema.ts"],
  });
  assert(!missingRelease.passed, "missing release.json should fail SDD v2 verify");
  assert(
    missingRelease.errors.some(error => error.name === "sdd-release-invalid"),
    "missing release.json should produce sdd-release-invalid",
  );

  const functionWorkspace = path.join(tempRoot, "function-scope");
  runJson(["workspace", "init", functionWorkspace, "--runtime", "react-spa"]);
  enableV1StrictSdd(functionWorkspace);
  initGit(functionWorkspace);
  runJson(
    [
      "sdd",
      "propose",
      "fix-purchase-idempotency-replay",
      "--title",
      "Fix purchase idempotency replay",
      "--functions",
      "receive_purchase_contract",
    ],
    { cwd: functionWorkspace },
  );
  runJson(["sdd", "approve", "fix-purchase-idempotency-replay", "--summary", "confirmed"], {
    cwd: functionWorkspace,
  });
  const functionChangeDir = path.join(
    functionWorkspace,
    "openspec",
    "changes",
    "fix-purchase-idempotency-replay",
  );
  completeSddChecklist(functionChangeDir);
  write(
    path.join(functionWorkspace, "src", "functions", "receive_purchase_contract", "index.ts"),
    "export default async function receivePurchaseContract() { return { ok: true }; }\n",
  );
  write(
    path.join(functionWorkspace, "src", "resources", "functions", "instrument-example-admin-functions.json"),
    `${JSON.stringify(
      {
        code: "receive_purchase_contract",
        name: "Receive Purchase Contract",
        definitionJson: {
          sourceFile: { localPath: "src/functions/receive_purchase_contract/index.ts" },
        },
      },
      null,
      2,
    )}\n`,
  );
  write(path.join(functionWorkspace, "docs", "rebuild.md"), "# rebuild notes\n");
  write(path.join(functionWorkspace, "初始需求", "purchase.md"), "# purchase notes\n");
  write(path.join(functionWorkspace, "接口", "purchase.md"), "# api notes\n");
  runJson(
    [
      "sdd",
      "propose",
      "parallel-dashboard-change",
      "--title",
      "Parallel dashboard change",
      "--pages",
      "dashboard",
      "--runtime",
    ],
    { cwd: functionWorkspace },
  );
  runJson(["sdd", "approve", "parallel-dashboard-change", "--summary", "confirmed"], {
    cwd: functionWorkspace,
  });
  write(
    path.join(functionWorkspace, "src", "pages", "dashboard", "index.tsx"),
    "export default function Dashboard() { return null; }\n",
  );
  const functionContext = runJson(
    ["sdd", "context", "--change", "fix-purchase-idempotency-replay"],
    { cwd: functionWorkspace },
  );
  assert(
    functionContext.activeChange?.id === "fix-purchase-idempotency-replay",
    "sdd context --change must select the named change",
  );
  assert(
    functionContext.releasePlan.targets.functions?.join(",") === "receive_purchase_contract",
    "sdd context --change should use the named change resource scope",
  );
  assert(
    functionContext.releasePlan.targets.runtime === false &&
      !functionContext.releasePlan.changedFiles?.some(file => file.includes("pages/dashboard")),
    "sdd context --change must not absorb another session's runtime files",
  );
  assert(
    functionContext.releasePlan.changedFiles?.some(file =>
      file.endsWith("src/resources/functions/instrument-example-admin-functions.json"),
    ),
    "change scope should retain an aggregate manifest that contains the selected function code",
  );
  const reviewedCommands = [
    "openxiangda resource publish function --only receive_purchase_contract --stage-only --profile dev --change fix-purchase-idempotency-replay",
    "openxiangda release app-finalize --staged-resources-json .openxiangda/releases/fix-purchase-idempotency-replay/staged-resources.json --wait --profile dev --change fix-purchase-idempotency-replay",
  ];
  const reviewedPlannedCommands = reviewedCommands.map(command =>
    `${command} --json`,
  );
  const reviewedReleaseFile = path.join(functionChangeDir, "release.json");
  const reviewedChangeFile = path.join(functionChangeDir, "change.json");
  const reviewedRelease = JSON.parse(fs.readFileSync(reviewedReleaseFile, "utf8"));
  reviewedRelease.commands = reviewedCommands;
  fs.writeFileSync(
    reviewedReleaseFile,
    `${JSON.stringify(reviewedRelease, null, 2)}\n`,
  );
  const reviewedChange = JSON.parse(fs.readFileSync(reviewedChangeFile, "utf8"));
  reviewedChange.release = {
    ...(reviewedChange.release || {}),
    plannedCommands: reviewedPlannedCommands,
  };
  fs.writeFileSync(
    reviewedChangeFile,
    `${JSON.stringify(reviewedChange, null, 2)}\n`,
  );
  const functionVerify = runJson(["sdd", "verify", "fix-purchase-idempotency-replay", "--changed", "--profile", "dev"], {
    cwd: functionWorkspace,
  });
  assert(functionVerify.passed, "function-only SDD verify should pass with unrelated untracked docs");
  assert(
    functionVerify.targets.functions?.includes("receive_purchase_contract"),
    "function source should be represented as a function target",
  );
  assert(functionVerify.targets.runtime === false, "function-only change must not require runtime deploy");
  assert(functionVerify.targets.resources === false, "function manifest must not widen to generic resources");
  assert(
    JSON.stringify(functionVerify.release.commands) ===
      JSON.stringify(reviewedCommands),
    "verify should keep the canonical generated command set",
  );
  assert(
    JSON.stringify(
      JSON.parse(fs.readFileSync(reviewedChangeFile, "utf8")).release
        .plannedCommands,
    ) === JSON.stringify(reviewedPlannedCommands),
    "verify must preserve explicitly reviewed change.json plannedCommands byte-for-byte",
  );
  assert(
    JSON.stringify(
      JSON.parse(fs.readFileSync(reviewedReleaseFile, "utf8")).commands,
    ) === JSON.stringify(reviewedCommands),
    "verify must not rewrite reviewed release.json commands",
  );
  assert(
    functionVerify.release.commands.some(command => command.includes("openxiangda resource publish")),
    "function-only release should include resource publish",
  );
  assert(
    functionVerify.release.commands.some(
      command =>
        command.includes("resource publish function") &&
        command.includes("--only receive_purchase_contract") &&
        command.includes("--change fix-purchase-idempotency-replay"),
    ),
    "function-only release should use a precise code selector tied to the change",
  );
  assert(
    !functionVerify.release.commands.some(command => command.includes("runtime deploy")),
    "function-only release should not include runtime deploy",
  );
  const pureVerifyChangeDir = path.join(
    functionWorkspace,
    "openspec",
    "changes",
    "fix-purchase-idempotency-replay",
  );
  const functionChangeBeforeVerify = fs.readFileSync(
    path.join(pureVerifyChangeDir, "change.json"),
    "utf8",
  );
  const functionReleaseBeforeVerify = fs.readFileSync(
    path.join(pureVerifyChangeDir, "release.json"),
    "utf8",
  );
  const privateStateExistedBeforeVerify = fs.existsSync(
    path.join(functionWorkspace, ".openxiangda"),
  );
  const pureVerify = runJson(
    [
      "sdd",
      "verify",
      "fix-purchase-idempotency-replay",
      "--changed",
      "--profile",
      "dev",
    ],
    { cwd: functionWorkspace },
  );
  assert(pureVerify.passed, "passing CLI verify should remain successful");
  assert(!pureVerify.metadataWritten, "CLI verify must be a pure read-only operation");
  assert(
    fs.readFileSync(path.join(pureVerifyChangeDir, "change.json"), "utf8") ===
      functionChangeBeforeVerify,
    "CLI verify must not rewrite change.json",
  );
  assert(
    fs.readFileSync(path.join(pureVerifyChangeDir, "release.json"), "utf8") ===
      functionReleaseBeforeVerify,
    "CLI verify must not rewrite release.json",
  );
  assert(
    fs.existsSync(path.join(functionWorkspace, ".openxiangda")) ===
      privateStateExistedBeforeVerify,
    "CLI verify must not claim a worktree owner or create private state",
  );
  const scopedWorkspaceCheck = runJson(
    ["workspace", "check", "--change", "fix-purchase-idempotency-replay"],
    { cwd: functionWorkspace },
  );
  assert(
    scopedWorkspaceCheck.errors.length === 0 &&
      scopedWorkspaceCheck.changeId === "fix-purchase-idempotency-replay" &&
      scopedWorkspaceCheck.targets.functions?.join(",") === "receive_purchase_contract",
    "workspace check --change should use the same named change scope",
  );

  const unsafeBackendReport = sddLib.buildSddGovernanceReport({
    cwd: functionWorkspace,
    configText: fs.readFileSync(
      path.join(functionWorkspace, "app-workspace.config.ts"),
      "utf8",
    ),
    targets: functionVerify.targets,
    files: functionVerify.release.changedFiles || [],
    commands: [
      "openxiangda resource publish function --only receive_purchase_contract_extra --profile dev --change fix-purchase-idempotency-replay",
    ],
    actualCommands: true,
    changeId: "fix-purchase-idempotency-replay",
    verifyStage: "prepublish",
  });
  assert(
    unsafeBackendReport.errors.some(error =>
      [
        "sdd-release-backend-direct-activation-forbidden",
        "sdd-release-backend-scope-inexact",
      ].includes(error.name),
    ),
    "the actual Backend command must not bypass stage-only or exact selector gates",
  );

  const unmatchedReport = sddLib.buildSddGovernanceReport({
    cwd: functionWorkspace,
    configText: fs.readFileSync(path.join(functionWorkspace, "app-workspace.config.ts"), "utf8"),
    targets: {
      forms: [],
      pages: [],
      functions: [],
      automations: ["missing_automation"],
      workflows: [],
      jsCodeNodes: [],
      resources: false,
      runtime: false,
    },
    files: ["src/automations/missing_automation/index.ts"],
  });
  assert(
    unmatchedReport.activeChange === null &&
      unmatchedReport.errors.some(error => error.name === "sdd-coverage-required"),
    "SDD change selection must not fall back to the first unrelated approved change",
  );

  const noWriteWorkspace = path.join(tempRoot, "verify-no-write");
  write(
    path.join(noWriteWorkspace, "app-workspace.config.ts"),
    "export default { runtimeMode: 'react-spa', compatibility: { apiContracts: 'strict' } };\n",
  );
  sddLib.initSddWorkspace({ cwd: noWriteWorkspace });
  sddLib.proposeSddChange({
    cwd: noWriteWorkspace,
    changeId: "no-write-on-failure",
    affected: { functions: ["receive_purchase_contract"] },
  });
  sddLib.approveSddChange({ cwd: noWriteWorkspace, changeId: "no-write-on-failure" });
  const noWriteChangeDir = path.join(noWriteWorkspace, "openspec", "changes", "no-write-on-failure");
  const noWriteReleaseFile = path.join(noWriteChangeDir, "release.json");
  const noWriteChangeFile = path.join(noWriteChangeDir, "change.json");
  const manualRelease = JSON.parse(fs.readFileSync(noWriteReleaseFile, "utf8"));
  manualRelease.targets = {
    forms: [],
    pages: [],
    functions: ["receive_purchase_contract"],
    automations: [],
    workflows: [],
    jsCodeNodes: [],
    resources: false,
    runtime: false,
    other: [],
  };
  manualRelease.commands = ["openxiangda resource publish --profile prod"];
  fs.writeFileSync(noWriteReleaseFile, `${JSON.stringify(manualRelease, null, 2)}\n`);
  const manualChange = JSON.parse(fs.readFileSync(noWriteChangeFile, "utf8"));
  manualChange.release = {
    plannedCommands: ["openxiangda resource publish --profile prod"],
    lastVerifiedAt: "manual",
  };
  fs.writeFileSync(noWriteChangeFile, `${JSON.stringify(manualChange, null, 2)}\n`);
  const releaseBeforeFailure = fs.readFileSync(noWriteReleaseFile, "utf8");
  const changeBeforeFailure = fs.readFileSync(noWriteChangeFile, "utf8");
  initGit(noWriteWorkspace);
  write(path.join(noWriteWorkspace, "src", "pages", "unrelated", "index.tsx"), "export default null;\n");
  const failedNoWrite = run(["sdd", "verify", "no-write-on-failure", "--changed", "--json"], {
    cwd: noWriteWorkspace,
    expectFailure: true,
  });
  const failedNoWriteJson = JSON.parse(failedNoWrite.stdout);
  assert(!failedNoWriteJson.metadataWritten, "failed verify should report that metadata was not written");
  assert(
    fs.readFileSync(noWriteReleaseFile, "utf8") === releaseBeforeFailure,
    "failed verify must not overwrite release.json",
  );
  assert(
    fs.readFileSync(noWriteChangeFile, "utf8") === changeBeforeFailure,
    "failed verify must not overwrite change.json release metadata",
  );
  const failedNoScope = run(["sdd", "verify", "no-write-on-failure", "--json"], {
    cwd: noWriteWorkspace,
    expectFailure: true,
  });
  const failedNoScopeJson = JSON.parse(failedNoScope.stdout);
  assert(!failedNoScopeJson.metadataWritten, "verify without --changed should not write metadata on failure");
  assert(
    fs.readFileSync(noWriteReleaseFile, "utf8") === releaseBeforeFailure,
    "verify without --changed must not overwrite release.json",
  );

  const atomicSyncWorkspace = path.join(tempRoot, "atomic-sync");
  sddLib.initSddWorkspace({ cwd: atomicSyncWorkspace });
  sddLib.proposeSddChange({ cwd: atomicSyncWorkspace, changeId: "multi-delta", affected: { runtime: true } });
  const deltaRoot = path.join(atomicSyncWorkspace, "openspec", "changes", "multi-delta", "specs");
  write(
    path.join(deltaRoot, "alpha", "spec.md"),
    [
      "# alpha Delta Spec",
      "",
      "## ADDED Requirements",
      "",
      "### Requirement: Alpha Added",
      "The app SHALL add alpha.",
      "",
      "#### Scenario: Alpha",
      "- **Given** a user",
      "- **When** alpha happens",
      "- **Then** alpha is visible",
      "",
    ].join("\n"),
  );
  write(
    path.join(deltaRoot, "beta", "spec.md"),
    [
      "# beta Delta Spec",
      "",
      "## MODIFIED Requirements",
      "",
      "### Requirement: Missing Beta",
      "The app SHALL modify beta.",
      "",
      "#### Scenario: Beta",
      "- **Given** a user",
      "- **When** beta happens",
      "- **Then** beta is visible",
      "",
    ].join("\n"),
  );
  const syncResult = (() => {
    try {
      sddLib.syncSddChange({ cwd: atomicSyncWorkspace, changeId: "multi-delta" });
      return { threw: false };
    } catch (error) {
      return { threw: true, error };
    }
  })();
  assert(syncResult.threw, "sync should fail when one delta cannot merge");
  assert(
    !fs.existsSync(path.join(atomicSyncWorkspace, "openspec", "specs", "alpha", "spec.md")),
    "failed sync must not partially write earlier specs",
  );

  const oldWorkspace = path.join(tempRoot, "old-workspace");
  fs.mkdirSync(path.join(oldWorkspace, "src", "pages", "demo"), { recursive: true });
  write(
    path.join(oldWorkspace, "app-workspace.config.ts"),
    "export default { runtimeMode: 'react-spa', compatibility: { apiContracts: 'strict' } };\n",
  );
  write(path.join(oldWorkspace, "src", "pages", "demo", "index.tsx"), "export default null;\n");
  initGit(oldWorkspace);
  fs.appendFileSync(path.join(oldWorkspace, "src", "pages", "demo", "index.tsx"), "// change\n");
  const oldCheck = runJson(["workspace", "check", "--changed"], { cwd: oldWorkspace });
  assert(oldCheck.errors.length === 0, "old workspace without SDD should warn, not fail");
  assert(oldCheck.checks.some(check => check.name === "sdd" && check.status === "warn"), "old workspace should warn about SDD");

  console.log("sdd smoke passed");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
