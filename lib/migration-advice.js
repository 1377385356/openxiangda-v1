// Static guidance: no registry requests, installation or workspace mutations.
function migrationAdvice() {
  return {
    generation: 'v1',
    message: '建议评估升级到 OpenXiangda 2.0；新应用优先使用 V2，现有应用先核实能力覆盖、迁移成本与验收方案。',
    launcherInstallCommand: 'npm install -g openxiangda@latest --registry=https://registry.npmjs.org',
    nodeRequirement: '>=24',
    assessCommand: 'openxiangda migrate assess --to v2',
    guide: 'https://github.com/1377385356/openxiangda/blob/master/docs/getting-started.md#upgrade',
    workspacePolicy: '更新统一入口后旧项目仍使用 V1；不会自动转换应用、数据或流程。',
  };
}

function printMigrationAdvice() {
  const advice = migrationAdvice();
  process.stderr.write(`\n${advice.message}\nNode.js 24+：${advice.launcherInstallCommand}\n使用新版全局入口在旧项目评估：${advice.assessCommand}\n${advice.workspacePolicy}\nCLI / Skill / MCP 安装升级说明：${advice.guide}\n`);
}

module.exports = { migrationAdvice, printMigrationAdvice };
