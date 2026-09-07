const fs = require('fs');
const path = require('path');

const SOURCE_DIRS = [
  path.join('src', 'app'),
  path.join('src', 'pages'),
  path.join('src', 'forms'),
  path.join('src', 'runtime'),
];
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const SKIP_DIRS = new Set([
  'node_modules',
  '.pnpm',
  'dist',
  '.vite',
  '.vite-temp',
  '.cache',
  'coverage',
]);

function buildDesignReview(options = {}) {
  const cwd = options.cwd || process.cwd();
  const manifest = options.manifest || null;
  const validation = options.validation || null;
  const result = {
    cwd,
    checkedAt: new Date().toISOString(),
    passed: true,
    summary: {
      errors: 0,
      warnings: 0,
      suggestions: 0,
    },
    errors: [],
    warnings: [],
    suggestions: [],
  };

  addResourceValidationFindings(result, validation);
  reviewPublicAccess(result, manifest);
  reviewSourceFiles(result, cwd);
  reviewAcceptanceArtifacts(result, cwd);

  result.summary.errors = result.errors.length;
  result.summary.warnings = result.warnings.length;
  result.summary.suggestions = result.suggestions.length;
  result.passed = result.errors.length === 0;
  return result;
}

function renderDesignReview(result) {
  const lines = [
    'OpenXiangda design review',
    `cwd: ${result.cwd}`,
    `status: ${result.passed ? 'passed' : 'needs attention'}`,
    `summary: ${result.summary.errors} errors, ${result.summary.warnings} warnings, ${result.summary.suggestions} suggestions`,
  ];
  appendFindings(lines, 'Errors', result.errors);
  appendFindings(lines, 'Warnings', result.warnings);
  appendFindings(lines, 'Suggestions', result.suggestions);
  return `${lines.join('\n')}\n`;
}

function appendFindings(lines, title, findings) {
  if (!findings.length) return;
  lines.push('', `${title}:`);
  for (const finding of findings) {
    lines.push(`- [${finding.code}] ${finding.message}`);
    if (finding.file) lines.push(`  file: ${finding.file}`);
  }
}

function addResourceValidationFindings(result, validation) {
  for (const message of validation?.errors || []) {
    result.errors.push({
      code: 'resource-validation-error',
      message,
    });
  }
  for (const message of validation?.warnings || []) {
    result.warnings.push({
      code: 'resource-validation-warning',
      message,
    });
  }
}

function reviewPublicAccess(result, manifest) {
  if (!manifest) return;
  const policies = manifest.publicAccessPolicies || [];
  const policyCodes = new Set(policies.map(policy => String(policy.code || '').trim()).filter(Boolean));
  const policyRouteCodes = new Set(policies.map(policy => String(policy.routeCode || '').trim()).filter(Boolean));

  for (const route of manifest.routes || []) {
    if (route.__invalid) continue;
    const publicAccess = String(route.publicAccess || 'none');
    if (publicAccess !== 'guest' && publicAccess !== 'ticket') continue;
    const routeLabel = route.code || route.pathPattern || route.path || route.__source || 'public route';
    const policyCode = String(route.publicPolicyCode || route.policyCode || '').trim();
    if (policyCode && !policyCodes.has(policyCode)) {
      result.errors.push({
        code: 'public-route-missing-policy',
        message: `公开路由 ${routeLabel} 引用了不存在的 public-access policy: ${policyCode}`,
        file: route.__source,
      });
      continue;
    }
    if (!policyCode && route.code && !policyRouteCodes.has(String(route.code))) {
      result.warnings.push({
        code: 'public-route-unbound-policy',
        message: `公开路由 ${routeLabel} 未声明 publicPolicyCode，也没有 policy.routeCode 绑定它`,
        file: route.__source,
      });
    }
  }

  for (const policy of policies) {
    if (policy.__invalid) continue;
    const grants = policy.grants && typeof policy.grants === 'object' ? policy.grants : null;
    const grantCount = grants
      ? ['forms', 'dataViews', 'functions', 'connectors'].reduce(
          (count, key) => count + (Array.isArray(grants[key]) ? grants[key].length : 0),
          0
        )
      : 0;
    if (grantCount === 0) {
      result.warnings.push({
        code: 'public-policy-empty-grants',
        message: `公开策略 ${policy.code || policy.__source} 没有显式 grants；公开页调用 form/dataView/function/connector 会被后端拒绝`,
        file: policy.__source,
      });
    }
  }
}

function reviewSourceFiles(result, cwd) {
  for (const filePath of listSourceFiles(cwd)) {
    const relativeFile = path.relative(cwd, filePath);
    let source = '';
    try {
      source = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const lineCount = source.split(/\r?\n/).length;
    if (relativeFile.startsWith(path.join('src', 'pages')) && lineCount > 600) {
      result.warnings.push({
        code: 'large-page-module',
        message: `页面文件超过 600 行，建议拆分为 domain/service/hooks/components 后再交给 AI 迭代`,
        file: relativeFile,
      });
    }
    if (/\?publicAccess=guest|publicAccess=guest|isRenderNav|workbench/i.test(source)) {
      result.errors.push({
        code: 'legacy-public-runtime-pattern',
        message: '发现旧公开访问或旧 workbench/runtime 参数；React SPA 新公开页应使用 routes + public-access + PublicAccessGate',
        file: relativeFile,
      });
    }
    if (/<(?:input|select|textarea)\b/i.test(source)) {
      result.warnings.push({
        code: 'native-form-control',
        message: 'AI 编写的页面/表单代码不应直接使用原生表单控件，优先使用 OpenXiangda/antd/antd-mobile 封装',
        file: relativeFile,
      });
    }
    if (/(pageSize|limit)\s*[:=]\s*(1000|2000|5000|9999)\b|fetchAll|getAllData|allData/i.test(source)) {
      result.warnings.push({
        code: 'unbounded-query-risk',
        message: '发现疑似大页或全量拉取；列表、选择器和报表应使用服务端分页、搜索字段或 data-view',
        file: relativeFile,
      });
    }
    if (/(localStorage|sessionStorage).{0,80}(role|permission)|(role|permission).{0,80}(localStorage|sessionStorage)/i.test(source)) {
      result.warnings.push({
        code: 'frontend-permission-risk',
        message: '发现疑似前端存储权限判断；权限和数据范围必须以后端权限组、public grants 或接口返回为准',
        file: relativeFile,
      });
    }
  }
}

function listSourceFiles(cwd) {
  const files = [];
  for (const relativeDir of SOURCE_DIRS) {
    const dir = path.join(cwd, relativeDir);
    if (fs.existsSync(dir)) collectSourceFiles(dir, files);
  }
  return files;
}

function collectSourceFiles(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(filePath, files);
      continue;
    }
    if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(filePath);
    }
  }
}

function reviewAcceptanceArtifacts(result, cwd) {
  const acceptanceDir = path.join(cwd, 'docs', 'acceptance');
  const acceptanceFile = path.join(cwd, 'docs', 'acceptance.md');
  if (fs.existsSync(acceptanceDir) || fs.existsSync(acceptanceFile)) return;
  result.suggestions.push({
    code: 'missing-acceptance-artifacts',
    message: '建议补充 docs/acceptance/ 或 docs/acceptance.md，沉淀验收路径、账号、数据、发布 releaseId 和回滚方式',
  });
}

module.exports = {
  buildDesignReview,
  renderDesignReview,
};
