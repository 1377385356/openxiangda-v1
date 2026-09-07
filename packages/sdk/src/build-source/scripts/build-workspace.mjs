import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rootDir } from "./utils/load-config.mjs";
import { normalizeOnly } from "./utils/incremental.mjs";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const tsxCli = require.resolve("tsx/cli");
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const forwardedArgs = [];
const onlyValues = [];

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
build - 构建表单页和代码页

用法:
  lowcode-workspace build [options]

选项:
  --force             忽略增量缓存，强制重建
  --only <list>       只构建指定模块，如 forms/customer,pages/dashboard
  --dry-run           只打印增量计划，不构建
  --clean-cache       删除 .openxiangda/build-cache.json
  --no-runtime-cache  强制重建共享 runtime
  --help, -h          显示帮助信息
`);
  process.exit(0);
}

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (["--no-runtime-cache", "--force", "--dry-run", "--clean-cache"].includes(arg)) {
    forwardedArgs.push(arg);
  }
  if (arg === "--only" && args[index + 1]) {
    forwardedArgs.push(arg, args[index + 1]);
    onlyValues.push(args[index + 1]);
    index += 1;
  }
  if (arg.startsWith("--only=")) {
    forwardedArgs.push(arg);
    onlyValues.push(arg.slice("--only=".length));
  }
}

const onlyTargets = normalizeOnly(onlyValues);
const invalidOnlyTargets = onlyTargets.filter(
  (item) => !item.startsWith("forms/") && !item.startsWith("pages/"),
);
if (invalidOnlyTargets.length > 0) {
  console.error(
    `[build] --only 目标必须以 forms/ 或 pages/ 开头: ${invalidOnlyTargets.join(", ")}`,
  );
  process.exit(1);
}

const hasOnlyTargets = onlyTargets.length > 0;
const shouldBuildForms =
  !hasOnlyTargets || onlyTargets.some((item) => item.startsWith("forms/"));
const shouldBuildPages =
  !hasOnlyTargets || onlyTargets.some((item) => item.startsWith("pages/"));

const runScript = (scriptName, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, path.join(scriptDir, scriptName), ...args], {
      cwd: rootDir,
      env: process.env,
      shell: false,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${scriptName} ${args.join(" ")} exited with code ${code}`));
    });
  });

if (shouldBuildForms) {
  await runScript("build-forms.mjs", forwardedArgs);
}
if (shouldBuildPages) {
  await runScript("build-pages.mjs", forwardedArgs);
}
