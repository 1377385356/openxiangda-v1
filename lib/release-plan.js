const crypto = require('crypto');

function uniqueSorted(values = []) {
  return Array.from(
    new Set(
      values
        .map(value => String(value || '').trim())
        .filter(Boolean)
    )
  ).sort();
}

function normalizeReleaseTargets(targets = {}, runtimeMode = 'legacy') {
  const resourceSelectors = Object.fromEntries(
    Object.entries(targets.resourceSelectors || targets.resourceTargets || {})
      .map(([type, values]) => [type, uniqueSorted(values || [])])
      .filter(([, values]) => values.length > 0)
  );
  const resourceDeletes = Object.fromEntries(
    Object.entries(targets.resourceDeletes || {})
      .map(([type, values]) => [type, uniqueSorted(values || [])])
      .filter(([, values]) => values.length > 0)
  );
  const hasExactDirectResourceScope =
    Object.entries(resourceSelectors).length > 0 &&
    Object.entries(resourceSelectors).every(
      ([type, selectors]) =>
        directResourceTypeForKey(type) &&
        type !== 'unknown' &&
        (selectors || []).every(selector => selector !== '*')
    );
  const logicalTargets = {
    forms: uniqueSorted(targets.forms || []),
    formDependencies: uniqueSorted(targets.formDependencies || []),
    pages: uniqueSorted(targets.pages || []),
    functions: uniqueSorted(targets.functions || []),
    automations: uniqueSorted(targets.automations || []),
    workflows: uniqueSorted(targets.workflows || []),
    jsCodeNodes: uniqueSorted(targets.jsCodeNodes || []),
    // Older SDD records used resources=true as a category marker even when
    // they also carried an exact selector. Exact supported selectors are the
    // authoritative boundary; only an unscoped/unknown/wildcard declaration
    // remains a generic resource closure.
    resources: Boolean(targets.resources) && !hasExactDirectResourceScope,
    resourceSelectors,
    resourceDeletes,
    runtime: Boolean(targets.runtime),
    other: uniqueSorted(targets.other || []),
  };
  const activationTargets = {
    ...logicalTargets,
    pages:
      runtimeMode === 'react-spa'
        ? []
        : logicalTargets.pages,
    runtime:
      runtimeMode === 'react-spa'
        ? logicalTargets.runtime || logicalTargets.pages.length > 0
        : logicalTargets.runtime,
  };
  return { logicalTargets, activationTargets };
}

function unsupportedAtomicReleaseTargets(targets = {}) {
  const unsupported = [];
  if (targets.resources) unsupported.push('generic-resources');
  for (const [type, selectors] of Object.entries(
    targets.resourceSelectors || {}
  )) {
    if (
      (selectors || []).length > 0 &&
      (!directResourceTypeForKey(type) ||
        type === 'unknown' ||
        selectors.includes('*'))
    ) {
      unsupported.push(`${type}:${selectors.join(',')}`);
    }
  }
  for (const [type, selectors] of Object.entries(
    targets.resourceDeletes || {}
  )) {
    if ((selectors || []).length > 0) {
      unsupported.push(
        `destructive-resource-delete:${type}:${selectors.join(',')}`
      );
    }
  }
  if (
    (targets.jsCodeNodes || []).length > 0 &&
    (targets.functions || []).length === 0 &&
    (targets.automations || []).length === 0
  ) {
    unsupported.push(`js-code-owner:${targets.jsCodeNodes.join(',')}`);
  }
  return unsupported;
}

const DIRECT_RESOURCE_TYPE_BY_KEY = Object.freeze({
  roles: 'role',
  connectors: 'connector',
  notifications: 'notification',
  menus: 'menu',
  dataViews: 'data-view',
  storageConfigs: 'storage',
  authConfigs: 'auth-config',
  routes: 'route',
  publicAccessPolicies: 'public-access',
  pagePermissionGroups: 'page-permission-group',
  formPermissionGroups: 'form-permission-group',
  scopeDimensions: 'scope-dimension',
  scopeGrantSources: 'scope-grant-source',
  dataScopePolicies: 'data-scope-policy',
});

const DIRECT_RESOURCE_RELEASE_ORDER = Object.freeze([
  'roles',
  'connectors',
  'storageConfigs',
  'authConfigs',
  'routes',
  'publicAccessPolicies',
  'menus',
  'dataViews',
  'scopeDimensions',
  'scopeGrantSources',
  'dataScopePolicies',
  'pagePermissionGroups',
  'formPermissionGroups',
  'notifications',
]);

function directResourceTypeForKey(key) {
  return DIRECT_RESOURCE_TYPE_BY_KEY[key] || null;
}

function assertAtomicReleaseTargetsSupported(targets) {
  const unsupported = unsupportedAtomicReleaseTargets(targets);
  if (unsupported.length === 0) return;
  const error = new Error(
    `RELEASE_ATOMIC_TARGET_UNSUPPORTED: 以下资源尚无 immutable staged child，禁止与原子发布混合后降级为直接写入: ${unsupported.join('; ')}`
  );
  error.code = 'RELEASE_ATOMIC_TARGET_UNSUPPORTED';
  error.unsupportedTargets = unsupported;
  throw error;
}

function buildTargetedResourceReleaseCommands(
  targets,
  profileArg,
  changeId
) {
  return buildTargetedResourceReleaseSteps(
    targets,
    profileArg,
    changeId
  ).map(step => step.command);
}

function commandFromArgs(args) {
  return ['openxiangda', ...args]
    .map(value => {
      const text = String(value);
      return /^[A-Za-z0-9_./,:@<>=+-]+$/.test(text)
        ? text
        : `'${text.replace(/'/g, `'\\''`)}'`;
    })
    .join(' ');
}

function createStep(id, args, options = {}) {
  return {
    id,
    args,
    command: commandFromArgs(args),
    writes: options.writes !== false,
    stagedKind: options.stagedKind || null,
    resumeMode: options.resumeMode || 'skip',
  };
}

function appendProfileAndChange(args, profileArg, changeId) {
  args.push('--profile', profileArg);
  if (changeId) args.push('--change', changeId);
  return args;
}

function buildTargetedResourceReleaseSteps(
  targets,
  profileArg,
  changeId
) {
  const steps = [];
  const functions = targets.functions || [];
  const automations = targets.automations || [];
  if (functions.length > 0 || automations.length > 0) {
    const resourceTypes = [
      ...(functions.length > 0 ? ['function'] : []),
      ...(automations.length > 0 ? ['automation'] : []),
    ];
    const qualify = resourceTypes.length > 1;
    const selectors = [
      ...functions.map(code => (qualify ? `function:${code}` : code)),
      ...automations.map(code => (qualify ? `automation:${code}` : code)),
    ];
    const stagedFormContracts = uniqueSorted(targets.forms || []);
    const args = [
      'resource',
      'publish',
      resourceTypes.join(','),
      '--only',
      selectors.join(','),
      '--stage-only',
      ...(stagedFormContracts.length > 0
        ? ['--staged-form-contracts', stagedFormContracts.join(',')]
        : []),
    ];
    steps.push(
      createStep(
        'backend-stage',
        appendProfileAndChange(
          args,
          profileArg,
          changeId
        ),
        { stagedKind: 'BackendRelease' }
      )
    );
  }
  const workflows = targets.workflows || [];
  if (workflows.length > 0) {
    steps.push(
      createStep(
        'workflow-stage',
        appendProfileAndChange(
          [
            'resource',
            'publish',
            'workflow',
            '--only',
            workflows.join(','),
            '--stage-only',
          ],
          profileArg,
          changeId
        ),
        { stagedKind: 'WorkflowRelease' }
      )
    );
  }
  return steps;
}

function buildDirectConfigurationReleaseSteps(
  targets,
  profileArg,
  changeId,
  options = {}
) {
  const excludedTypes = new Set(options.excludeTypes || []);
  return Object.entries(targets.resourceSelectors || {})
    .filter(
      ([type, selectors]) =>
        !excludedTypes.has(type) &&
        directResourceTypeForKey(type) &&
        uniqueSorted(selectors || []).length > 0
    )
    .sort(
      ([left], [right]) =>
        DIRECT_RESOURCE_RELEASE_ORDER.indexOf(left) -
        DIRECT_RESOURCE_RELEASE_ORDER.indexOf(right)
    )
    .map(([type, selectors]) =>
      createStep(
        `config-${directResourceTypeForKey(type)}`,
        appendProfileAndChange(
          [
            'resource',
            'publish',
            directResourceTypeForKey(type),
            '--only',
            uniqueSorted(selectors).join(','),
          ],
          profileArg,
          changeId
        )
      )
    );
}

function buildWorkspaceReleaseCommands(
  targetsInput,
  runtimeMode,
  profile,
  changeId
) {
  return buildWorkspaceReleaseSteps(
    targetsInput,
    runtimeMode,
    profile,
    changeId
  ).map(step => step.command);
}

function buildWorkspaceReleaseSteps(
  targetsInput,
  runtimeMode,
  profile,
  changeId
) {
  const profileArg = profile || '<profile>';
  const { activationTargets: targets } = normalizeReleaseTargets(
    targetsInput,
    runtimeMode
  );
  assertAtomicReleaseTargetsSupported(targets);
  const steps = [];
  const hasResourceTargets =
    Boolean(targets.resources) ||
    targets.functions.length > 0 ||
    targets.automations.length > 0 ||
    targets.workflows.length > 0 ||
    targets.jsCodeNodes.length > 0 ||
    Object.values(targets.resourceSelectors || {}).some(
      selectors => (selectors || []).length > 0
    );
  const formPermissionGroups = uniqueSorted(
    targets.resourceSelectors?.formPermissionGroups || []
  );
  const stagesFormRelease =
    runtimeMode === 'react-spa' &&
    (targets.forms.length > 0 || formPermissionGroups.length > 0);
  const deferredDataViewCodes = stagesFormRelease
    ? uniqueSorted(targets.resourceSelectors?.dataViews || [])
    : [];
  const directConfigurationSteps =
    buildDirectConfigurationReleaseSteps(
      targets,
      profileArg,
      changeId,
      {
        // A FormRelease is a single immutable snapshot. Publishing form
        // settings and permission groups as sibling steps from the same live
        // parent lets the second descriptor replace the first and discard its
        // schema. Stage both resource types in one bundle instead.
        excludeTypes: stagesFormRelease ? ['formPermissionGroups'] : [],
      }
    );
  if (runtimeMode === 'react-spa') {
    const ensuredForms = uniqueSorted([
      ...targets.forms,
      ...targets.formDependencies,
    ]);
    if (ensuredForms.length > 0) {
      steps.push(
        createStep(
          'form-ensure',
          appendProfileAndChange(
            ['form', 'ensure', '--only', ensuredForms.join(',')],
            profileArg,
            changeId
          ),
          { resumeMode: 'replay-local' }
        )
      );
    }
    if (stagesFormRelease) {
      const resourceTypes = [
        ...(targets.forms.length > 0 ? ['form-setting'] : []),
        ...(formPermissionGroups.length > 0
          ? ['form-permission-group']
          : []),
      ];
      const qualify = resourceTypes.length > 1;
      const selectors = [
        ...targets.forms.map(code =>
          qualify ? `form-setting:${code}` : code
        ),
        ...formPermissionGroups.map(code =>
          qualify ? `form-permission-group:${code}` : code
        ),
      ];
      steps.push(
        createStep(
          'form-stage',
          appendProfileAndChange(
            [
              'resource',
              'publish',
              resourceTypes.join(','),
              '--only',
              selectors.join(','),
            ],
            profileArg,
            changeId
          ),
          { stagedKind: 'FormRelease' }
        )
      );
    }
    steps.push(...directConfigurationSteps);
    if (hasResourceTargets) {
      steps.push(
        ...buildTargetedResourceReleaseSteps(
          targets,
          profileArg,
          changeId
        )
      );
    }
    if (targets.runtime) {
      steps.push(
        createStep(
          'runtime-stage',
          appendProfileAndChange(
            ['runtime', 'deploy', '--no-activate'],
            profileArg,
            changeId
          ),
          { stagedKind: 'RuntimeRelease' }
        )
      );
    }
    if (
      stagesFormRelease ||
      targets.functions.length > 0 ||
      targets.automations.length > 0 ||
      targets.workflows.length > 0 ||
      targets.runtime ||
      directConfigurationSteps.length > 0
    ) {
      const hasStagedChildren =
        stagesFormRelease ||
        targets.functions.length > 0 ||
        targets.automations.length > 0 ||
        targets.workflows.length > 0 ||
        targets.runtime;
      steps.push(
        createStep(
          'app-finalize',
          appendProfileAndChange(
            [
              'release',
              'app-finalize',
              ...(hasStagedChildren
                ? [
                    '--staged-resources-json',
                    `.openxiangda/releases/${changeId || 'change'}/staged-resources.json`,
                  ]
                : []),
              ...(deferredDataViewCodes.length > 0
                ? [
                    '--finalize-data-views',
                    deferredDataViewCodes.join(','),
                  ]
                : []),
              '--wait',
            ],
            profileArg,
            changeId
          )
        )
      );
    }
    return steps;
  }

  const onlyTargets = [
    ...targets.forms.map(code => `forms/${code}`),
    ...targets.pages.map(code => `pages/${code}`),
  ];
  if (onlyTargets.length > 0) {
    steps.push(
      createStep(
        'workspace-publish',
        appendProfileAndChange(
          [
            'workspace',
            'publish',
            '--only',
            onlyTargets.join(','),
            '--skip-resources',
          ],
          profileArg,
          changeId
        )
      )
    );
  }
  if (hasResourceTargets) {
    steps.push(...directConfigurationSteps);
    steps.push(
      ...buildTargetedResourceReleaseSteps(targets, profileArg, changeId)
    );
  }
  if (
    targets.functions.length > 0 ||
    targets.automations.length > 0 ||
    targets.workflows.length > 0
  ) {
    steps.push(
      createStep(
        'app-finalize',
        appendProfileAndChange(
          [
            'release',
            'app-finalize',
            '--staged-resources-json',
            `.openxiangda/releases/${changeId || 'change'}/staged-resources.json`,
            '--wait',
          ],
          profileArg,
          changeId
        )
      )
    );
  }
  return steps;
}

function releasePlanHash(value) {
  return crypto
    .createHash('sha256')
    .update(canonicalJson(value))
    .digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

module.exports = {
  buildTargetedResourceReleaseCommands,
  buildTargetedResourceReleaseSteps,
  buildWorkspaceReleaseCommands,
  buildWorkspaceReleaseSteps,
  commandFromArgs,
  directResourceTypeForKey,
  normalizeReleaseTargets,
  releasePlanHash,
  unsupportedAtomicReleaseTargets,
};
