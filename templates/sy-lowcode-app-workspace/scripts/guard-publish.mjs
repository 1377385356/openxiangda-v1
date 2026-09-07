#!/usr/bin/env node
// _guard:publish 守卫：拦截直接调用 publish:all / publish:oss / register 等内部 npm script 的尝试。
// 仅当通过 `openxiangda workspace publish --profile <name>` 入口发布时，CLI 会注入
// OPENXIANGDA_PROFILE / OPENXIANGDA_BASE_URL / OPENXIANGDA_ACCESS_TOKEN / OPENXIANGDA_APP_TYPE
// 等环境变量；本守卫据此放行内部脚本，否则 fail-fast 并提示正确入口。

if (!process.env.OPENXIANGDA_PROFILE) {
  const lines = [
    '',
    '❌ 错误：请使用带 change 与精确 scope 的 openxiangda workspace publish',
    '',
    '此 npm script（publish:all / publish:oss / register / publish:changed / openxiangda:publish 等）',
    '是工作区内部实现，直接调用会缺少 token / profile / appType / OSS 密钥的注入，',
    '可能发到错误的环境，或彻底发不出去。',
    '',
    '正确入口：',
    '  openxiangda workspace publish --change <change> --profile <name> --only pages/X,forms/Y --dry-run',
    '  openxiangda workspace publish --change <change> --profile <name> --only pages/X,forms/Y',
    '  先把 approved changes 合并并 push 到默认主分支，再从该 clean HEAD 一次发布',
    '  激活后运行 release integration-status 与 release end，不再补做发布后合并',
    '',
    '更多说明详见工作区根目录的 AGENTS.md。',
    '',
  ];
  for (const line of lines) {
    console.error(line);
  }
  process.exit(1);
}
