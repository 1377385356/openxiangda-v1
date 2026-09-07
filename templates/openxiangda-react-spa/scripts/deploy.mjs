#!/usr/bin/env node

const lines = [
  '',
  '错误：模板已停用无范围的 pnpm deploy 聚合发布入口。',
  '',
  '请使用一个显式 change 和精确资源 selector：',
  '  openxiangda resource plan <type> --only <codes> --profile <name>',
  '  环境托管应用：openxiangda release ship --change <change> --profile <name>',
  '  日常确认预发后再加 --confirm-production；明确授权紧急发布时可在首条命令加该参数，一次顺序完成预发和生产。可选 --acceptance-note 留痕。',
  '  未登记环境的旧工作区：openxiangda release publish --change <change> --profile <name>',
  '',
  '该命令只接受已经 merge/fast-forward 并 push 的权威主分支，自动暂存并原子激活。',
  '',
];

for (const line of lines) console.error(line);
process.exit(1);
