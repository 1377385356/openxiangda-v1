const DESIGN_GATE_HARD_RULE =
  '架构类需求默认只规划、不实现；用户明确确认设计后，才允许改文件、写平台资源或发布。';

const DESIGN_GATE_TOPICS = [
  {
    code: 'new-app',
    title: '新应用 / 大版本应用',
    triggers: ['新应用', '从零搭建', '门户', '后台系统', '管理系统', '业务系统'],
    mustAsk: [
      '目标用户是谁，内部用户和外部用户是否都存在',
      '核心对象和主流程是什么，哪些对象需要表单、data-view 或 App Function',
      '是否需要登录注册、公开访问、组织内权限分层',
      '首屏是工作台、列表、表单、公开页还是仪表盘',
      '是否需要集成外部系统、通知、流程自动化',
    ],
    recommendedDefaults: [
      'React SPA runtime，路由用 src/resources/routes 声明',
      '多资源正式开发走 src/resources/** + resource plan/publish',
      '先输出应用地图、资源清单、权限矩阵、验收用例，再实现',
    ],
    antiPatterns: [
      '先创建页面再回头补权限和数据模型',
      '把公开访问写成旧版 ?publicAccess=guest 链接',
      '用页面本地状态模拟应落库的数据',
    ],
    acceptance: [
      '用户确认资源边界和权限策略',
      'resource validate/plan 无错误',
      '关键公开、登录、权限拒绝路径都有验收步骤',
    ],
  },
  {
    code: 'complex-page',
    title: '复杂页面 / 工作台 / Dashboard',
    triggers: ['复杂页面', '看板', '工作台', '详情页', '列表页', '移动端', '大屏'],
    mustAsk: [
      '页面的主任务、最高频操作、首屏信息密度',
      '数据来自表单直读、data-view 聚合、App Function 还是连接器',
      '是否需要编辑、批量操作、导入导出、移动端适配',
      '各角色能看哪些模块和字段',
      '加载、空状态、失败重试和越权状态如何呈现',
    ],
    recommendedDefaults: [
      '读取类复杂列表优先用 data-view，跨表逻辑优先 App Function',
      '管理后台采用紧凑、可扫描布局，避免营销式 hero',
      '页面路由和菜单分离声明，页面权限单独验收',
    ],
    antiPatterns: [
      '直接在前端拼接跨表权限逻辑',
      '宽泛授予表单全部数据再靠 UI 隐藏',
      '移动端只靠桌面页面缩放',
    ],
    acceptance: [
      '不同角色打开页面看到的模块符合权限矩阵',
      '无数据、错误、越权、加载状态可用',
      '公开页面不依赖 PageProvider 私有页面上下文',
    ],
  },
  {
    code: 'auth',
    title: '登录 / 注册 / 账号绑定',
    triggers: ['登录', '注册', '手机号', '验证码', '外部账号', '账号绑定', 'SSO'],
    mustAsk: [
      '用户来源是平台组织用户、应用自注册用户、外部账号还是混合',
      '登录方式：密码、手机号验证码、第三方 SSO、免登 ticket',
      '注册策略：开放注册、邀请码、管理员审核、禁止注册',
      '账号和组织用户如何匹配：手机号、邮箱、工号、外部 ID',
      '失败、冻结、解绑、找回密码的处理边界',
    ],
    recommendedDefaults: [
      '用 src/resources/auth/*.json 声明 auth-config',
      '默认 registration.mode=reject，除非用户确认开放注册',
      '验证码发送优先由显式 grant 的 App Function/连接器承接',
    ],
    antiPatterns: [
      '前端自行保存明文密码或验证码',
      '未确认注册策略就开放外部用户写入',
      '把登录页和公开访问页混为同一权限模型',
    ],
    acceptance: [
      'auth-config methods 与实际登录页参数一致',
      '未登录访问内部路由会跳登录或拒绝',
      '注册/绑定失败有明确错误码和文案',
    ],
  },
  {
    code: 'public-access',
    title: '公开访问 / 外部人员无需登录',
    triggers: ['公开访问', '无需登录', '外部人员', '游客', '报名', '公开查询', '分享链接'],
    mustAsk: [
      '公开的是哪些 route，是否仅 /view/:appType/public/*',
      '外部角色有哪些，是否只读、可提交表单、可调用函数或连接器',
      '是否需要 ticket：一次性、有效期、绑定手机号/邮箱、签名来源',
      '允许访问哪些 form、data-view、function、connector grant',
      '是否需要限流、过期时间、审计字段和回收策略',
    ],
    recommendedDefaults: [
      '新 React SPA 仅使用 /view/:appType/public/* + routes + public-access policy + PublicAccessGate',
      '普通公开页用 scoped public session；敏感页用 ticket 模式',
      '未显式 grant 的 form/dataView/function/connector 一律拒绝',
    ],
    antiPatterns: [
      '新应用继续使用 ?publicAccess=guest',
      '给游客账号平台级宽权限',
      '公开页读取内部 data-view 但没有 public-access grant',
    ],
    acceptance: [
      '无登录直接打开公开 route 成功获得 scoped public session',
      '允许的 form/data-view/function/connector 可访问',
      '未 grant 的内部路由和资源返回拒绝，ticket 缺失/过期也拒绝',
    ],
  },
  {
    code: 'permissions',
    title: '账号 / 角色 / 页面权限 / 表单数据范围',
    triggers: ['权限', '角色', 'RBAC', '账号权限', '平台账号', '组织账号', '角色治理', '数据范围', '业务范围', 'scope_policy', '只看自己', '部门数据', '页面权限', '字段权限', '查询参数权限'],
    mustAsk: [
      '权限模式选择：managed-platform-account、existing-platform-user-assignment、static-role-permission、query-param-context 中哪一种，为什么',
      '账号来源是什么：应用创建平台账号/部门、选择已有平台用户、固定角色成员，还是仅使用低风险查询参数上下文',
      '是否创建或维护平台账号/部门；如果是，哪些 App Function/organization SDK 负责创建、更新、重置密码和同步审计',
      '角色成员如何维护：角色分配表、平台角色手工维护、静态 roles manifest、还是公开访问 externalRoleCodes',
      '业务范围是否来自应用表单：用户/角色到客户、项目、区域、门店、学院、班级等授权关系是否需要 scopeDimensions、scopeGrantSources、dataScopePolicies',
      '业务范围数量是否超过少量固定枚举；如果会增长到几十/上百个对象，是否采用 scope_policy 而不是为每个对象建角色/权限组',
      '哪些角色可以设置应用角色、分配角色成员、给角色分配接口权限；这些角色是否需要 `app:role:manage`',
      '哪些角色可以维护页面权限组、表单权限组、组织账号；是否需要 `app:page-permission-group:manage`、`app:form-permission-group:manage`、`app:organization:manage`',
      '业务范围字段是什么，哪些可见字段需要派生隐藏 scalar key 供表单权限条件匹配',
      '每个角色的 action matrix 是什么：view/create/edit/delete/export/import/change_records/workflow 是否分别授权',
      '导出/导入是否独立授权；导出范围是否与 view 范围不同，导入是否还需要逐行 create 范围校验',
      'create 是否需要 scope_policy 校验提交数据，防止新增到未授权业务范围',
      '页面/菜单/路由、表单 actions/fieldAccessPolicy/dataPermission/scope_policy 的权限矩阵如何落到 resources',
      '查询参数是否参与授权；如果参与，只能做上下文、筛选或 ticket 输入，敏感数据必须由 public-access grant、角色、表单权限组或 App Function 校验',
      '验收时需要模拟哪些角色、账号状态、业务范围、查询参数篡改和拒绝场景',
    ],
    recommendedDefaults: [
      '正式后台优先选择 managed-platform-account；如果平台账号已存在，选择 existing-platform-user-assignment；固定内部门户选择 static-role-permission',
      'query-param-context 仅用于低风险页面上下文、筛选条件或公开 ticket 输入，不作为敏感数据授权依据',
      '角色写 src/resources/roles，页面组写 permissions/page-groups，表单组写 permissions/form-groups，显式声明 actions/dataPermission/fieldAccessPolicy；平台内部仍兼容存储为 operations',
      '复杂业务范围优先写 permissions/scope-dimensions、permissions/scope-grant-sources、permissions/data-scope-policies，并在表单权限组或 data-view 权限组使用 dataPermission.type=scope_policy；授权来源默认 syncMode=on_write，由平台在来源表单写入后自动物化',
      'scope_policy 只表达数据范围，actions 表达操作能力；按钮隐藏只是 UX，后端 action check 才是权威',
      'scope_policy 默认语义是个人授权 + 当前应用角色授权；多维 rules 显式 AND；空授权集合拒绝；管理员绕过但可审计',
      '能管理角色或给别人分配角色的应用角色必须在 roles manifest 声明 apiPermissionCodes；至少包含 app:role:manage，按需加入 app:page-permission-group:manage、app:form-permission-group:manage、app:organization:manage',
      '由校区管理员等委托管理员创建的新角色，如果还具备继续管理账号/角色/权限的能力，也必须同步声明并发布对应 apiPermissionCodes',
      '账号治理闭环使用 organization_unit、system_account、role_assignment 等业务表，加 roles、page groups、form groups、sync App Functions 和 PermissionBoundary',
      '平台账号创建、更新、重置密码只走 sdk.organization/ctx.organization；操作者必须具备 app:organization:manage',
      '公开访问不要复用内部管理员权限组；公开数据仍需 public-access grants 与外部角色权限组双重覆盖',
    ],
    antiPatterns: [
      '不能只做前端权限隐藏，必须有后端角色、表单权限组、public-access grant 或 App Function 校验',
      '查询参数不能作为敏感授权依据，只能作为上下文、筛选或 ticket 输入',
      '只配菜单可见，不配后端数据权限',
      '只隐藏按钮但没有表单权限组 actions 或 App Function 服务端校验',
      '为了省事授予全部数据再在前端过滤',
      '为每个客户/项目/区域/学院/班级/门店创建一个角色或一个权限组',
      '把应用表单里的业务范围强行同步成平台部门、平台角色或大量权限组',
      '用数据冗余字段 + 成百上千个权限组表达动态业务授权',
      '在页面里硬编码角色、账号、部门或权限范围',
      '只给用户挂业务角色但没有给该角色绑定角色设置接口权限，导致后续新增账号/角色时运行时报无权限',
      '让普通管理员创建带管理能力的新角色，但没有同时发布新角色的 apiPermissionCodes',
      '前端模拟权限通过、mock role、假账号、假 ID 或空数组兜底',
      '直接绕过 SDK 调平台账号/组织写接口，或用旧 /user、/department 接口写账号',
      '公开角色和内部角色混用',
    ],
    acceptance: [
      'permission audit 输出无高危缺口',
      '业务范围超过少量枚举时，resource validate/permission audit 不再出现权限组爆炸 warning，scope explain 能说明用户、当前角色、命中授权、缓存状态和最终策略',
      '设计文档写明权限模式、账号来源、角色成员来源和权限矩阵',
      '角色资源中声明了管理型角色的 apiPermissionCodes，并说明由谁首次授予',
      '内部角色允许项可用，未授权项拒绝',
      '用非授权角色验证角色创建/成员分配/权限组维护会被拒绝，用授权角色验证可成功',
      '敏感 App Function 包含服务端 role/scope checks，且不信任页面传入的 roleCodes',
      '平台账号治理路径验证当前操作者拥有 app:organization:manage',
      '查询参数篡改不会扩大敏感数据访问范围',
      '公开访问受 public-access grant 和权限组双重约束',
    ],
  },
  {
    code: 'workflow-automation',
    title: '流程 / 自动化 / App Function',
    triggers: ['流程', '审批', '自动化', '定时', 'App Function', 'JS_CODE', '函数'],
    mustAsk: [
      '触发来源：表单提交、状态变化、定时、手动按钮、公开访问',
      '节点输入输出、失败重试、幂等键和日志保留',
      '函数需要访问哪些 forms/dataViews/connectors',
      '是否需要人工审批、通知、回写表单或调用外部系统',
      '测试用例包含成功、失败、重复触发、越权调用哪些场景',
    ],
    recommendedDefaults: [
      '函数源码放 src/functions/<code>/index.ts 或对应模板约定目录',
      'definitionJson 中通过 resources 声明依赖，发布时自动绑定',
      '公开调用函数必须通过 public-access grants.functions 显式开放',
    ],
    antiPatterns: [
      '函数里硬编码 formUuid 或外部密钥',
      '忽略重复触发导致重复写入或重复通知',
      '公开页面直接调用未 grant 的内部函数',
    ],
    acceptance: [
      '函数 invoke 测试 envelope 成功，失败码会被识别',
      '自动化 executions/logs 可追踪',
      '重复触发不会产生重复副作用',
    ],
  },
  {
    code: 'connector-notification',
    title: '连接器 / 通知 / 外部集成',
    triggers: ['连接器', '第三方接口', '通知', '消息', 'Webhook', '短信', '钉钉'],
    mustAsk: [
      '外部接口域名、鉴权方式、超时、重试、脱敏要求',
      '哪些 connector API 允许内部调用，哪些允许公开访问调用',
      '通知类型、模板变量、渠道、接收人解析方式',
      '失败降级：重试、人工补偿、只记日志还是阻断主流程',
      '是否需要 preview/send/batch-send 的验收样例',
    ],
    recommendedDefaults: [
      '连接器写 src/resources/connectors，通知写 src/resources/notifications',
      '复杂写入通过 App Function 包装，连接器只做外部通信',
      '公开访问连接器必须显式 grants.connectors，并限制 API 粒度',
    ],
    antiPatterns: [
      '把密钥写入前端或公开 manifest',
      '只看 HTTP 200，不检查 JSON envelope 错误码',
      '通知模板变量和实际 send body 不一致',
    ],
    acceptance: [
      'connector invoke/download-test 请求 body 与 SDK DTO 一致',
      'notification preview/send 能用真实模板变量',
      'PUBLIC_GRANT_DENIED 等业务错误码被当作失败',
    ],
  },
  {
    code: 'resource-maintenance',
    title: '资源维护 / 小步修复',
    triggers: ['改一个资源', '补路由', '调整权限', '修复菜单', '删除配置', '同步 manifest'],
    mustAsk: [
      '这是临时 live mutation，还是要同步到仓库 manifest',
      '是否允许删除、覆盖、发送通知等高风险操作',
      '影响哪些 profile/appType，是否覆盖 workspace binding',
      '是否需要先 pull/plan/audit 再写入',
    ],
    recommendedDefaults: [
      '多资源正式变更仍走 resource plan/publish',
      '直接 CLI 写平台资源时加 --write-manifest 防漂移',
      '删除、发送、覆盖前需要 --force',
    ],
    antiPatterns: [
      '手写未知 HTTP 绕过 CLI',
      '平台改了但 src/resources 没同步',
      '不传 profile/app-type 就在错误应用上写资源',
    ],
    acceptance: [
      'dry-run 能展示 method/path/body',
      '成功写入后 state 和 manifest 同步',
      'commands --json 可发现相应资源命令',
    ],
  },
];

const DESIGN_GATE_TOPIC_ALIASES = {
  app: 'new-app',
  application: 'new-app',
  dashboard: 'complex-page',
  page: 'complex-page',
  pages: 'complex-page',
  login: 'auth',
  register: 'auth',
  registration: 'auth',
  sso: 'auth',
  public: 'public-access',
  guest: 'public-access',
  visitor: 'public-access',
  visitors: 'public-access',
  permission: 'permissions',
  role: 'permissions',
  roles: 'permissions',
  rbac: 'permissions',
  'role-governance': 'permissions',
  'account-permission': 'permissions',
  'organization-account': 'permissions',
  'org-account': 'permissions',
  'account-role': 'permissions',
  'query-param-permission': 'permissions',
  workflow: 'workflow-automation',
  automation: 'workflow-automation',
  function: 'workflow-automation',
  functions: 'workflow-automation',
  'app-function': 'workflow-automation',
  js_code: 'workflow-automation',
  jscode: 'workflow-automation',
  connector: 'connector-notification',
  connectors: 'connector-notification',
  notification: 'connector-notification',
  notifications: 'connector-notification',
  integration: 'connector-notification',
  integrations: 'connector-notification',
  webhook: 'connector-notification',
  resource: 'resource-maintenance',
  resources: 'resource-maintenance',
  maintenance: 'resource-maintenance',
};

function resolveTopicSelection(topicCode) {
  if (!topicCode || topicCode === 'all') {
    return { requested: ['all'], wanted: null, unknown: [] };
  }
  const knownCodes = new Set(DESIGN_GATE_TOPICS.map(topic => topic.code));
  const requested = String(topicCode)
    .split(/[,/|+\s]+/)
    .map(item => item.trim())
    .filter(Boolean);
  const wanted = new Set();
  const unknown = [];
  for (const item of requested) {
    const normalized = item.toLowerCase();
    const code = DESIGN_GATE_TOPIC_ALIASES[normalized] || normalized;
    if (knownCodes.has(code)) {
      wanted.add(code);
    } else {
      unknown.push(item);
    }
  }
  return { requested, wanted, unknown };
}

function selectTopics(topicCode) {
  const selection = resolveTopicSelection(topicCode);
  if (!selection.wanted) return DESIGN_GATE_TOPICS;
  return DESIGN_GATE_TOPICS.filter(topic => selection.wanted.has(topic.code));
}

function getDesignGates(topicCode) {
  const selection = resolveTopicSelection(topicCode);
  return {
    hardRule: DESIGN_GATE_HARD_RULE,
    requestedTopics: selection.requested,
    unknownTopics: selection.unknown,
    topics: selectTopics(topicCode),
  };
}

function getDesignTopicCatalog() {
  return {
    hardRule: DESIGN_GATE_HARD_RULE,
    topics: DESIGN_GATE_TOPICS.map(topic => ({
      code: topic.code,
      title: topic.title,
      triggers: topic.triggers,
    })),
    aliases: DESIGN_GATE_TOPIC_ALIASES,
  };
}

function renderDesignHelp() {
  const catalog = getDesignTopicCatalog();
  const lines = [
    '用法: openxiangda design gates|template|review [--topic code[,code...]] [--json]',
    '',
    catalog.hardRule,
    '',
    'Topics:',
  ];
  for (const topic of catalog.topics) {
    lines.push(`- ${topic.code}: ${topic.title} (${topic.triggers.join('、')})`);
  }
  lines.push('', 'Aliases:');
  for (const [alias, code] of Object.entries(catalog.aliases).sort()) {
    lines.push(`- ${alias} -> ${code}`);
  }
  return lines.join('\n');
}

function renderDesignGatesText(topicCode) {
  const gates = getDesignGates(topicCode);
  const lines = [gates.hardRule, ''];
  for (const topic of gates.topics) {
    lines.push(`# ${topic.code}: ${topic.title}`);
    lines.push(`触发词: ${topic.triggers.join('、')}`);
    lines.push(`必须提问: ${topic.mustAsk.join('；')}`);
    lines.push(`推荐默认: ${topic.recommendedDefaults.join('；')}`);
    lines.push(`反模式: ${topic.antiPatterns.join('；')}`);
    lines.push(`验收: ${topic.acceptance.join('；')}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

function renderDesignTemplate(topicCode) {
  const gates = getDesignGates(topicCode);
  const lines = [
    '# OpenXiangda 架构设计确认稿',
    '',
    `> ${gates.hardRule}`,
    '> 本稿确认前，只允许读取、快照、dry-run、提问和输出设计。',
    '',
    '## 1. 需求边界',
    '- 目标用户：',
    '- 内部/外部访问：',
    '- 核心对象与流程：',
    '- 明确不做：',
    '',
    '## 2. 推荐方案',
    '- Runtime：React SPA',
    '- 资源发布：src/resources/** + openxiangda resource plan/publish',
    '- 公开访问：仅使用 /view/:appType/public/* + routes + public-access policy + PublicAccessGate',
    '',
    '## 3. 待确认问题',
  ];
  for (const topic of gates.topics) {
    lines.push(`### ${topic.title}`);
    for (const question of topic.mustAsk) {
      lines.push(`- [ ] ${question}`);
    }
  }
  lines.push(
    '',
    '## 4. 资源设计',
    '- routes：',
    '- public-access：',
    '- auth-config：',
    '- roles/page-groups/form-groups：',
    '- forms/data-views/functions/connectors/notifications：',
    '',
    '## 5. 验收清单',
  );
  for (const topic of gates.topics) {
    for (const item of topic.acceptance) {
      lines.push(`- [ ] ${item}`);
    }
  }
  lines.push('', '## 6. 用户确认', '- [ ] 用户确认后再进入实现。');
  return lines.join('\n');
}

const RESOURCE_EXPLAINS = {
  route: {
    dir: 'src/resources/routes/*.json',
    minimalManifest: {
      code: 'public.register',
      title: '公开报名',
      kind: 'page',
      pathPattern: '/view/:appType/public/register',
      publicAccess: 'guest',
      publicPolicyCode: 'public_register',
    },
    commands: [
      'openxiangda route upsert --json-file src/resources/routes/public_register.json --dry-run',
      'openxiangda resource plan',
      'openxiangda resource publish',
    ],
  },
  'public-access': {
    dir: 'src/resources/public-access/*.json',
    minimalManifest: {
      code: 'public_register',
      mode: 'guest',
      routeCode: 'public.register',
      externalRoleCodes: ['external_visitor'],
      grants: {
        forms: [
          {
            code: 'FORM_OR_FORM_CODE',
            actions: ['upload', 'preview'],
            fields: ['attachmentFieldId'],
          },
        ],
        dataViews: ['public_lookup'],
        functions: [],
        connectors: [],
        storage: [
          {
            bucketName: 'images',
            actions: ['upload', 'preview'],
            allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
            allowedExtensions: ['jpg', 'jpeg', 'png', 'webp'],
            maxSizeBytes: 15728640,
            visibility: 'private',
            pathPrefix: 'public/register/images/',
          },
          {
            bucketName: 'attachments',
            actions: ['upload', 'preview', 'download'],
            allowedMimeTypes: [
              'application/pdf',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              'text/plain',
              'text/csv',
              'application/json',
            ],
            allowedExtensions: ['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'csv', 'json'],
            maxSizeBytes: 31457280,
            visibility: 'private',
            pathPrefix: 'public/register/attachments/',
          },
        ],
      },
    },
    commands: [
      'openxiangda public-access upsert --json-file src/resources/public-access/public_register.json',
      'openxiangda public-access session-test public_register --path /view/APP_XXX/public/register',
      'openxiangda public-access grant-check public_register --form-code customer',
      '公开页 ImageField/AttachmentField 上传走 public session guest 凭据；grants.forms 用 {code, actions:[upload,preview], fields} 绑定表单/字段，storage 或 form.upload 再限制 bucket/MIME/ext/size/visibility/pathPrefix。',
      'React 页面侧使用 PublicAccessGate；如果使用 Page SDK hooks，放在 OpenXiangdaProvider + OpenXiangdaPageProvider 内',
    ],
  },
  'auth-config': {
    dir: 'src/resources/auth/*.json',
    minimalManifest: {
      code: 'default',
      status: 'active',
      configJson: {
        methods: [{ type: 'password', enabled: true }],
        registration: { mode: 'reject' },
        binding: { mode: 'auto' },
      },
    },
    commands: [
      'openxiangda auth-config methods',
      'openxiangda auth-config upsert --json-file src/resources/auth/default.json',
    ],
  },
  function: {
    dir: 'src/resources/functions/*.json',
    minimalManifest: {
      code: 'summarize_customer',
      definitionJson: {
        kind: 'app_function',
        version: 'function_v1',
        runtimeMode: 'trusted_node',
        sourceType: 'inline',
        runtimeInvoke: {
          audience: { type: 'authenticated' },
        },
        code: 'module.exports = async () => ({ ok: true })',
      },
      status: 'active',
    },
    commands: [
      'openxiangda function upsert --json-file src/resources/functions/summarize_customer.json',
      'openxiangda function invoke summarize_customer --body-json \'{"input":{}}\'',
    ],
  },
  webhook: {
    dir: 'src/resources/webhooks/*.json',
    minimalManifest: {
      code: 'yuquan_access',
      name: '玉泉门禁开门事件',
      targetFunctionCode: 'qfyy_access_event',
      idempotencyQueryParam: 'nonce',
      maxBodyBytes: 262144,
      status: 'active',
    },
    commands: [
      'openxiangda resource validate webhook --profile <name>',
      'openxiangda resource plan webhook --only yuquan_access --profile <name> --json',
      'openxiangda resource publish webhook --only yuquan_access --change <id> --profile <name>',
      'openxiangda webhook deliveries yuquan_access --profile <name> --json',
    ],
  },
  connector: {
    dir: 'src/resources/connectors/*.json',
    minimalManifest: {
      code: 'third_party',
      name: '第三方服务',
      protocol: 'https',
      domain: 'api.example.com',
      authType: 'none',
      apis: [{ code: 'ping', path: '/ping', method: 'GET' }],
    },
    commands: [
      'openxiangda connector upsert --json-file src/resources/connectors/third_party.json',
      'openxiangda connector invoke third_party.ping --query-json query.json',
    ],
  },
  notification: {
    dir: 'src/resources/notifications/*.json',
    minimalManifest: {
      templates: [{ code: 'reservation_reminder', name: '预约提醒', content: '{{title}}' }],
      typeConfigs: [{ notificationType: 'reservation_reminder', templateCode: 'reservation_reminder', enabled: true }],
    },
    commands: [
      'openxiangda notification template-upsert --json-file src/resources/notifications/reservation_reminder.json',
      'openxiangda notification preview reservation_reminder --body-json \'{"payload":{"title":"测试"}}\'',
    ],
  },
  workflow: {
    dir: 'src/resources/workflows/*.json + src/workflows/<code>/workflow.ts',
    minimalManifest: {
      code: 'expense_approval',
      name: '费用审批',
      formCode: 'expense_request',
      workflowFile: '../../workflows/expense_approval/workflow.ts',
      definitionFile: '../../generated/workflows/expense_approval/definition.v3.json',
      previewFile: '../../generated/workflows/expense_approval/preview.json',
      publish: true,
      enable: true,
    },
    commands: [
      'openxiangda workspace publish --profile <name> --form expense_request',
      'openxiangda workflow compile src/workflows/expense_approval/workflow.ts --check',
      'openxiangda workflow compile src/workflows/expense_approval/workflow.ts --out-definition src/generated/workflows/expense_approval/definition.v3.json --out-preview src/generated/workflows/expense_approval/preview.json',
      'openxiangda resource validate workflow',
      'openxiangda resource plan workflow',
      'openxiangda resource publish',
    ],
  },
  'data-view': {
    dir: 'src/resources/data-views/*.json',
    minimalManifest: {
      code: 'customer_lookup',
      base: { formCode: 'customer', alias: 'customer' },
      select: [{ field: 'customer.form_instance_id', as: 'id' }],
      refresh: { mode: 'manual' },
    },
    commands: [
      'openxiangda data-view upsert --json-file src/resources/data-views/customer_lookup.json',
      'openxiangda data-view query customer_lookup --query-json query.json',
    ],
  },
  permission: {
    dir: 'src/resources/roles 与 src/resources/permissions/**',
    minimalManifest: {
      role: { code: 'manager', name: '管理员' },
      pageGroup: { code: 'manager_pages', name: '管理员页面', roles: ['manager'], routeCodes: ['admin.home'] },
      formGroup: { code: 'customer_view', formCode: 'customer', name: '客户查看', type: 'view', roles: ['manager'] },
    },
    commands: [
      'openxiangda permission audit --json',
      'openxiangda permission role-update manager --json-file role.json --write-manifest',
    ],
  },
};

function getResourceExplain(type) {
  const rawKey = String(type || 'route')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();
  const aliases = {
    routes: 'route',
    notifications: 'notification',
    workflows: 'workflow',
    dataview: 'data-view',
    dataviews: 'data-view',
    'data-views': 'data-view',
    publicaccess: 'public-access',
    publicaccesspolicy: 'public-access',
    publicaccesspolicies: 'public-access',
    auth: 'auth-config',
    authconfigs: 'auth-config',
    functions: 'function',
    webhooks: 'webhook',
    connectors: 'connector',
  };
  const key = aliases[rawKey] || rawKey;
  return RESOURCE_EXPLAINS[key];
}

function renderResourceExplain(type) {
  const item = getResourceExplain(type);
  if (!item) {
    return `未知资源类型: ${type}`;
  }
  return [
    `# ${type}`,
    `目录: ${item.dir}`,
    '最小 manifest:',
    JSON.stringify(item.minimalManifest, null, 2),
    '常用命令:',
    ...item.commands.map(command => `- ${command}`),
  ].join('\n');
}

module.exports = {
  DESIGN_GATE_HARD_RULE,
  DESIGN_GATE_TOPICS,
  DESIGN_GATE_TOPIC_ALIASES,
  getDesignGates,
  getDesignTopicCatalog,
  getResourceExplain,
  renderDesignHelp,
  renderDesignGatesText,
  renderDesignTemplate,
  renderResourceExplain,
};
