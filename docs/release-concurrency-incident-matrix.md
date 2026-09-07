# OpenXiangda 并行发布事故矩阵

本文把 2026-07-15 在同一应用并行开发中复现的问题，映射到必须由 CLI 和平台共同保证的发布不变量。它既是设计输入，也是回归测试索引；应用侧临时构建守卫不能替代这些平台保证。

## 已复现事故

| 事故/任务 | 观测结果 | 缺失的不变量 | 平台修复 | 回归证据 |
| --- | --- | --- | --- | --- |
| `019f6495-b2df-73d1-ad1e-673e08aaa69d` | 语义只读的 `resource plan` 运行期间，线上 Function 更新时间批量推进；两个预约 Function 的 `resourceBindings` 变为旧隔离工作区清单，丢失 `hgy_mentor_proxy_relation` | plan 必须绝对只读；源码发布不能重写未选择字段；旧基线不能写入 | HTTP 只读断言；Function/Automation 默认 source-only PATCH；整包替换显式授权；lease + change baseline + Git-base preflight | `test:resource-plan-readonly`、`test:resource-publish-scope`、`test:change-baseline-publish` |
| `019f648c-f869-7af3-a6eb-30f4545101ed` ↔ `019f6495-b2df-73d1-ad1e-673e08aaa69d` | 17:50 身份切换 Runtime `20260715095009-e69ba61b` 被 18:15 登录页旧快照 `20260715101444-625a1924` 激活覆盖；旧快照没有 `switchAppRole` | Runtime 激活必须声明父 release 和源码血缘；旧分支不能以“更晚 buildId”覆盖新能力 | clean committed HEAD；repository/source revision；Git ancestor 检查；后端 parent CAS；staged activate 二次校验；显式回退审计 | `test:runtime-deploy`、Runtime release service/controller tests |
| `019f648c-f869-7af3-a6eb-30f4545101ed` | 一次身份能力变更触发 88 Function + 11 Automation 的逐项构建、上传和更新，耗时长；全局 SDD 又被其他未收尾 change 阻塞 | 影响面应来自精确 change + 依赖闭包；共享构建只能执行一次；发布校验不得要求尚不存在的发布后证据 | 精确 `--change/--only/--code`；AST 依赖图；批量 JS_CODE 构建和内容缓存；quick SDD；implementation/prepublish/postpublish/archive 分阶段校验 | `test:source-dependencies`、`test:js-code-build-cache`、`test:sdd-stages` |
| `019f642b-17d5-7f31-9cb8-f2f2230f68e1` | 登录页小改被完整设计、全局资源计划、其他 change 的后置任务与隔离发布流程放大；资源计划多次长时间无输出 | 小改应有有界治理路径；发布范围和别的 active change 解耦；阶段耗时应可见且可中止 | L1 quick change；显式 change；精确目标；只读计划；分阶段 SDD；后续补阶段指标 | `test:sdd-stages`、`test:resource-plan-readonly` |
| `019f64bd-0942-7332-abee-502cde84bc8d` | 预约改期报“未绑定表单资源”；已完成能力被后续发布的旧 Function manifest 静默移除 | 未选择的 bindings/contracts/metadata 必须保持；同一 app 只能有一个 promotion writer | source-only PATCH；应用 publish lease；baseline 字段 head；统一配置写 guard | Function source PATCH tests、publish lease tests、config-write guard tests |
| `019f762f-6870-71f3-b4e8-74e65ce6f87c` | Function 发布后首次访问才发现查询字段 `hgy_test_project.testRunId` 不在线上 Form schema，后端暴露数据库列错误 | Function 的静态表单字段依赖必须在 plan/publish 写前核对；动态字段不得直接落到 SQL 错误 | TypeScript 传递依赖字段分析；冻结 Form snapshot 合同；publish fail-closed；平台 SQL 前 `FORM_FIELD_NOT_FOUND` 400 兜底 | `test:source-dependencies`、`test:form-field-contract`、`form.service.workflow-system-fields` |
| `019f6439-82b0-77e3-9a09-fd626a201f5e` 及其他并行任务 | 一个任务发布后，另一个任务检测到 active build 已变化，只能人工对比/合并，存在重复修复与误回滚风险 | 整次发布必须有不可变 manifest 和单一 parent CAS，不能由一串可变写拼出“当前版本” | App Release Manifest `prepare → verify → activate`，历史回退生成新 release；低层资源 CAS 继续补齐 | App Release tests（实现中） |
| `019f92c6-08d7-7491-95e9-819360f7bd0b` 与随后多个发布任务 | 正常运行的 Automation 某天突然报资源未绑定；本地外层 manifest 仍声明日志 Form，但线上有效 runtime definition/旧 release manifest 未携带同一绑定，后续 source-only 发布继续保留了错误线上清单 | 本地期望清单与 runtime 声明必须一致；source-only 必须证明线上有效绑定包含全部期望项；整包替换后必须精确；根 App 激活后必须读回实际绑定 | 双清单静态门禁；`source_only` contains-expected；`manifest_replacement` exact；Backend/App 激活后 Function/Automation 绑定读回；私有 binding contract 与 release/deployment 绑定 | `test:resource-binding-contract`、`test:backend-release-cli`、`test:app-release-cli` |
| `019f926a-0e01-7030-b25e-b467a6b74c40`、`019f8f3e-35c2-7601-b26c-bcbfc6d9883f`、`019f8ce5-c5b6-7f02-9488-d3d121b8e5d4`、`019f91e5-f544-7cc2-b8e0-91ac61f1c807`、`019f921b-61d3-75f3-9c31-1fa28480ffb6` | 多任务已合入不相干提交后，旧 candidate 因当前 HEAD 不完全相等而无法晋级；多个 deployment 又可能先并行执行，直到 App Head CAS 才发生晚期冲突 | candidate 身份应绑定实际构建输入而非整个仓库必须永远停在同一 HEAD；同一目标 deployment 必须在昂贵写入前串行化 | candidate commit 祖先校验 + sealed input hash；当前 checkout 必须是 clean、已推送权威主线；目标环境单 in-flight deployment；CLI lease/slot 等待；资源 Head CAS 保持不变 | `test:release-mainline`、`test:application-environments`、`openxiangda-environment.service.test.ts` |

## 必须保持的发布不变量

1. `plan`、`status`、`inspect` 只能发出 GET/HEAD；任何写请求在客户端立即失败。
2. 所有配置写必须同时携带同一 change session 的 lease 与 baseline；只带其中一个不能降级放行。
3. 默认发布只修改显式选择的字段。源码变化不能覆盖 bindings、权限、触发器、启停状态或其他元数据。
4. 发布前一次性校验完整目标集；发现任一陈旧目标时，写入数必须为零。
5. Runtime 和 App Release 必须以当前 active release 为 parent；上传成功不等于允许激活。
6. 回退是显式、带原因、可审计的新 release，不能伪装成普通的“更晚构建”。
7. 冲突返回稳定的 409 错误码；CLI 不得自动 GET 新 revision 后把旧 payload 重试。
8. 多个工作区可以并行开发、构建和验证，但同一 app 同一时刻只能有一个 promotion session。
9. 一次发布的计划目标、实际写入和最终 manifest 必须完全一致；额外写入或遗漏都不能 activate。
10. 所有发布阶段记录耗时、缓存命中、冲突和实际资源数，避免“长时间无输出”被误认为卡死。
11. candidate 晋级可跨越不相干的后续主线提交，但 candidate commit 必须仍是主线祖先，且 sealed 发布输入文件哈希必须全部一致。
12. SDD 的变更事实、运行依赖和部署目标必须分离；依赖分析可以阻断遗漏，但不能自动扩大生产写集合。

## 交付边界

这些保护只有在新 CLI/技能安装完成且平台后端迁移、服务部署完成后，才会对线上发布生效。仅修改应用工作区或仅增加构建守卫，不能彻底阻止未知旧工作区覆盖。
