export type PageQueryValue = string | string[]

export type PageHttpMethod = "get" | "post" | "put" | "delete" | "patch"

export type PageRequestCache =
  | "default"
  | "no-store"
  | "reload"
  | "no-cache"
  | "force-cache"
  | "only-if-cached"

export type PageScope = "platform" | "app"

export type PageUiPermissionType = "route" | "button"

export interface FieldPermissionDto {
  componentName: string
  fieldName: string
  label: string
  value: "FORM_FILED_EDIT" | "FORM_FILED_VIEW" | "FORM_FILED_HIDDEN"
}

export type FieldAccessLevel = "edit" | "readonly" | "hidden"

export interface FieldAccessPolicyItemDto {
  fieldId: string
  access: FieldAccessLevel
}

export interface FieldAccessPolicyDto {
  defaultAccess: FieldAccessLevel
  fields?: FieldAccessPolicyItemDto[]
}

export type ViewFieldPermissionValue =
  "FORM_FILED_EDIT" | "FORM_FILED_VIEW" | "FORM_FILED_HIDDEN"

export interface DataPermissionRuleDto {
  field: string
  componentType?: string
  op: string
  value: unknown
}

export interface DataPermissionConditionDto {
  logic: "AND" | "OR"
  rules?: DataPermissionRuleDto[]
  conditions?: DataPermissionConditionDto[]
}

export interface DataPermissionDto {
  type: "condition" | "sql" | "scope_policy"
  condition?: DataPermissionConditionDto
  logic?: "AND" | "OR"
  rules?: DataPermissionRuleDto[]
  expression?: string
  policyCode?: string
  scopePolicyCode?: string
}

export type SearchLogic = "AND" | "OR"

export type SearchOperator =
  | "EQ"
  | "NEQ"
  | "LIKE"
  | "ILIKE"
  | "MATCH"
  | "CONTAINS"
  | "NOT_CONTAINS"
  | "IN"
  | "IS_NULL"
  | "IS_NOT_NULL"
  | "GT"
  | "GTE"
  | "GE"
  | "LT"
  | "LTE"
  | "LE"
  | "BETWEEN"
  | "EXISTS"
  | "NOT_EXISTS"
  | "PATH_EQ"
  | string

export type SearchComponentName =
  | "TextField"
  | "TextareaField"
  | "EditorField"
  | "SerialNumberField"
  | "NumberField"
  | "DateField"
  | "CascadeDateField"
  | "SelectField"
  | "RadioField"
  | "MultiSelectField"
  | "CheckboxField"
  | "CascadeSelectField"
  | "DepartmentSelectField"
  | "EmployeeSelectField"
  | "UserSelectField"
  | "JSONField"
  | "SubFormField"
  | string

export type SearchSystemField =
  | "createTime"
  | "modifiedTime"
  | "processInstanceId"
  | "processInstanceTitle"
  | "originator"
  | "originatorName"
  | "originatorCorp"
  | "created_at"
  | "updated_at"
  | "form_instance_id"
  | "instance_title"
  | "created_by"
  | "created_by_name"
  | "created_by_department_id"

export type SearchFieldKey = SearchSystemField | string

export type InstanceStatus =
  "pending" | "running" | "completed" | "terminated" | "waiting" | "withdrawn"

export interface PageAppInfo {
  appType: string
  tenantId: string
}

export interface PageRouteInfo {
  pathname: string
  fullPath: string
  params: Record<string, string | undefined>
  query: Record<string, PageQueryValue>
  hash: string
}

export interface PageDepartmentInfo {
  id?: string
  name?: string
  externalId?: string | null
}

export interface PageDepartmentRecord extends PageDepartmentInfo {
  id: string
  parentId?: string | null
  key?: string
  title?: string
  hasChildren?: boolean
  isLeaf?: boolean
  children?: PageDepartmentRecord[]
  supervisorUserIds?: string[]
  supervisors?: Array<{ id: string; name: string }>
  createdAt?: string | Date
  updatedAt?: string | Date
  [key: string]: unknown
}

export interface GetParentDepartmentsOptions {
  includeSelf?: boolean
}

export interface CurrentUserDepartmentParents {
  department: PageDepartmentInfo
  parents: PageDepartmentRecord[]
}

export type PageUserType = "normal" | "guest"

export interface PageUserInfo {
  id: string
  username: string
  name?: string
  jobNumber?: string
  phone?: string | null
  email?: string | null
  avatar?: string | null
  departments?: PageDepartmentInfo[]
  affiliatedDepartmentId?: string | null
  affiliatedDepartment?: PageDepartmentInfo | null
  tenantId: string
  isGuest?: boolean
  userType?: PageUserType
  [key: string]: unknown
}

export interface AppFunctionOperatorInfo {
  userId?: string
  username?: string
  name?: string
  jobNumber?: string
  phone?: string | null
  email?: string | null
  tenantId?: string
  roleCodes?: string[]
  /** Platform identity codes maintained by organization sync. */
  platformRoleCodes?: string[]
  currentRoleCode?: string | null
  currentRoleName?: string | null
  hasFullAccess?: boolean
  isPlatformAdmin?: boolean
  isAppAdmin?: boolean
  isGuest?: boolean
  [key: string]: unknown
}

export interface PagePermissionInfo {
  canView: boolean
  hasFullAccess: boolean
  /** Platform identity codes are additive to app role codes. */
  platformRoleCodes?: string[]
  [key: string]: unknown
}

export interface AppFunctionPermissionContext {
  roleCodes?: string[]
  platformRoleCodes?: string[]
  currentRoleCode?: string | null
  currentRoleName?: string | null
  hasFullAccess?: boolean
  isPlatformAdmin?: boolean
  isAppAdmin?: boolean
  [key: string]: unknown
}

export interface AppFunctionRuntimeContext {
  permissions?: AppFunctionPermissionContext
  [key: string]: unknown
}

/** Metadata-only declaration stored in an App Function resource manifest. */
export interface AppFunctionSecretRef {
  name: string
  required: boolean
}

/**
 * Invocation-scoped secret resolver exposed only by trusted_node_v2.
 * Values are never part of a page SDK response, manifest, build artifact, or
 * source snapshot.
 */
export interface AppFunctionSecrets {
  get(name: string): Promise<string>
}

export interface AppFunctionAttachmentReference {
  id?: string
  uid?: string
  name?: string
  originalName?: string
  objectName?: string
  bucketName?: string
  storageCode?: string
  storageScope?: "app" | "platform" | string
  provider?: "platform" | "oss" | "builtin-oss" | "platform-oss" | string
  uploadProvider?: string
  contentType?: string
  mimeType?: string
  size?: number
  [key: string]: unknown
}

export interface AppFunctionFileReadOptions {
  attachment: AppFunctionAttachmentReference | AppFunctionAttachmentReference[]
  attachmentId?: string
  index?: number
  includeDataUri?: boolean
}

export interface AppFunctionFormFileReadOptions {
  formCode?: string
  formUuid?: string
  formInstId?: string
  formInstanceId?: string
  fieldId: string
  attachmentId?: string
  index?: number
  includeDataUri?: boolean
}

export type AppFunctionFileReadInput =
  | AppFunctionAttachmentReference
  | AppFunctionAttachmentReference[]
  | AppFunctionFileReadOptions
  | AppFunctionFormFileReadOptions

export interface AppFunctionBase64File {
  base64: string
  contentType: string
  fileName: string
  size: number
  sha256: string
  dataUri?: string
}

/**
 * Reads an image through the server-side storage boundary. Direct attachment
 * references must come from the current formData context; reusable Functions
 * may instead identify the owning form record and field.
 */
export interface AppFunctionFilesApi {
  readAsBase64(input: AppFunctionFileReadInput): Promise<AppFunctionBase64File>
}

export interface AppFunctionHttpRequest {
  url: string
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD"
  params?: Record<string, unknown>
  data?: unknown
  body?: unknown
  headers?: Record<string, string | number>
  timeout?: number
}

export interface AppFunctionHttpResponse<T = unknown> {
  data: T
  status: number
  statusText?: string
  headers?: Record<string, unknown>
}

/**
 * Server-controlled public HTTPS bridge. It never forwards the platform
 * Runtime bearer token and rejects redirects and private/reserved targets.
 */
export interface AppFunctionHttpApi {
  request<T = unknown>(
    input: AppFunctionHttpRequest,
  ): Promise<AppFunctionHttpResponse<T>>
  get<T = unknown>(
    url: string,
    config?: Omit<AppFunctionHttpRequest, "url" | "method">,
  ): Promise<AppFunctionHttpResponse<T>>
  post<T = unknown>(
    url: string,
    data?: unknown,
    config?: Omit<AppFunctionHttpRequest, "url" | "method" | "data" | "body">,
  ): Promise<AppFunctionHttpResponse<T>>
  put<T = unknown>(
    url: string,
    data?: unknown,
    config?: Omit<AppFunctionHttpRequest, "url" | "method" | "data" | "body">,
  ): Promise<AppFunctionHttpResponse<T>>
  patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: Omit<AppFunctionHttpRequest, "url" | "method" | "data" | "body">,
  ): Promise<AppFunctionHttpResponse<T>>
  delete<T = unknown>(
    url: string,
    config?: Omit<AppFunctionHttpRequest, "url" | "method">,
  ): Promise<AppFunctionHttpResponse<T>>
}

export interface AppFunctionUtils {
  http: AppFunctionHttpApi
  log?(message: unknown): void
  info?(message: unknown): void
  error?(message: unknown): void
  parseJSON?<T = unknown>(value: string): T
  stringify?(value: unknown): string
  now?(): number
  today?(): Date
  uuid?(): string
  [key: string]: unknown
}

/** Stable workspace shape for a Function that opts in to secret resolution. */
export interface AppFunctionManifestV2 {
  code: string
  name?: string
  description?: string
  secretRefs?: AppFunctionSecretRef[]
  definitionJson: {
    kind?: "app_function"
    version: "function_v2"
    runtimeMode: "trusted_node"
    runtimeContractVersion: "trusted_node_v2"
    sourceType?: "file_snapshot"
    sourceFile?: Record<string, unknown>
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface AppFunctionFormQueryParams {
  formCode: string
  conditions?: Record<string, unknown>
  filters?: SearchExpression | Record<string, unknown>
  search?: SearchExpression | Record<string, unknown>
  currentPage?: number
  pageSize?: number
  order?: SearchSortItem | SearchSortItem[]
  [key: string]: unknown
}

export interface AppFunctionFormGetByIdParams {
  formCode: string
  formInstId?: string
  formInstanceId?: string
  [key: string]: unknown
}

export interface AppFunctionFormDeleteResult {
  success: boolean
  code: number
  [key: string]: unknown
}

export interface AppFunctionFormWriteParams {
  formCode: string
  formInstId?: string
  formInstanceId?: string
  data?: Record<string, unknown>
  expectedStateVersion?: number
  expectedRevision?: number
  [key: string]: unknown
}

export interface AppFunctionFormApi {
  queryOne<TRecord = Record<string, unknown>>(
    params: AppFunctionFormQueryParams,
  ): Promise<TRecord | null>
  queryMany<TRecord = Record<string, unknown>>(
    params: AppFunctionFormQueryParams,
  ): Promise<PageListResult<TRecord> | TRecord[]>
  getById<TRecord = Record<string, unknown>>(
    params: AppFunctionFormGetByIdParams,
  ): Promise<TRecord | null>
  createOne<TRecord = Record<string, unknown>>(
    params: AppFunctionFormWriteParams,
  ): Promise<TRecord>
  updateOne<TRecord = Record<string, unknown>>(
    params: AppFunctionFormWriteParams,
  ): Promise<TRecord>
  updateById<TRecord = Record<string, unknown>>(
    params: AppFunctionFormWriteParams,
  ): Promise<TRecord>
  deleteById(
    params: AppFunctionFormGetByIdParams,
  ): Promise<AppFunctionFormDeleteResult>
  [key: string]: unknown
}

export interface AppFunctionDataViewApi {
  query<TRecord = Record<string, unknown>>(
    viewCode: string,
    params?: DataViewQueryParams,
  ): Promise<DataViewQueryResult<TRecord>>
  stats<TResult = Record<string, unknown>>(
    viewCode: string,
    params?: DataViewStatsParams,
  ): Promise<TResult>
  [key: string]: unknown
}

export interface AppFunctionConnectorApi {
  invoke<TResult = unknown>(
    callName: string,
    params?: ConnectorInvokeParams,
  ): Promise<ConnectorInvokeResult<TResult>>
  [key: string]: unknown
}

export interface AppFunctionNotificationApi {
  sendByType?(
    params: SendNotificationByTypeParams,
  ): Promise<SendNotificationResult>
  batchSendByType?(
    params: BatchSendNotificationByTypeParams,
  ): Promise<SendNotificationResult[] | unknown>
  previewDingTalk?(
    params: PreviewDingTalkNotificationParams,
  ): Promise<DingTalkNotificationPreviewResult>
  sendDingTalk?(
    params: SendNotificationByTypeParams,
  ): Promise<SendNotificationResult>
  updateDingTalkCard?(
    params: UpdateDingTalkCardParams,
  ): Promise<UpdateDingTalkCardResult>
  capabilities?(): Promise<DingTalkNotificationCapabilities>
  [key: string]: unknown
}

export interface OrganizationCapabilities {
  appType: string
  permissionCode: "app:organization:manage" | string
  readPermissionCode: "app:organization:read" | string
  managePermissionCode: "app:organization:manage" | string
  canRead: boolean
  canManage: boolean
  actor?: Record<string, unknown>
  runtimeServicePrincipalRequiresAuditActor: boolean
  supportedOperations: string[]
  [key: string]: unknown
}

export interface CreateOrganizationDepartmentParams {
  appType?: string
  name: string
  parentId?: string | null
  externalId?: string | null
  corpId?: string | null
  visibilityScope?: string
  visibilityCustomDepartmentIds?: string[]
  memberViewScope?: string | null
  memberViewCustomDepartmentIds?: string[]
  supervisorUserIds?: string[]
  [key: string]: unknown
}

export interface UpdateOrganizationDepartmentParams extends Partial<
  Omit<CreateOrganizationDepartmentParams, "name">
> {
  appType?: string
  name?: string
}

export interface CreateOrganizationAccountParams {
  appType?: string
  id?: string
  username?: string
  password?: string
  name?: string
  phone?: string
  email?: string
  jobNumber?: string
  avatar?: string
  departmentIds?: string[]
  affiliatedDepartmentId?: string | null
  validFrom?: string | Date | null
  validTo?: string | Date | null
  [key: string]: unknown
}

export interface UpdateOrganizationAccountParams {
  appType?: string
  id?: string
  username?: string
  name?: string
  phone?: string
  email?: string
  jobNumber?: string
  avatar?: string
  departmentIds?: string[]
  affiliatedDepartmentId?: string | null
  validFrom?: string | Date | null
  validTo?: string | Date | null
  [key: string]: unknown
}

export interface OrganizationAccountListParams {
  appType?: string
  ids?: string[] | string
  departmentIds?: string[] | string
  keyword?: string
  name?: string
  username?: string
  phone?: string
  email?: string
  jobNumber?: string
  page?: number
  pageSize?: number
}

export interface ResetOrganizationAccountPasswordParams {
  appType?: string
  newPassword: string
}

export interface ChangeOrganizationAccountPasswordParams {
  appType?: string
  oldPassword: string
  newPassword: string
}

export interface OrganizationListResult<TItem = unknown> {
  items: TItem[]
  total: number
  page: number
  pageSize: number
}

export interface SchoolContactPerson {
  userId: string
  dingtalkUserId: string | null
  name: string
  mobile: string | null
}

export interface SchoolContactClass {
  id: string
  dingtalkClassId: string
  name: string
  campusName: string | null
  periodName: string | null
  gradeName: string | null
  /** Current head teachers for this class. Populated by teachers.list. */
  headTeachers?: SchoolContactPerson[]
}

export interface SchoolContactTeacher extends SchoolContactPerson {
  /** Classes currently managed by this teacher as head teacher. */
  managedClasses: SchoolContactClass[]
}

export interface SchoolContactSyncState {
  enabled: boolean
  state: "current" | "not_synced" | "disabled"
  lastSuccessfulSyncAt: string | Date | null
}

export interface SchoolContactRelationRecord {
  relationId: string
  relationCode: string | null
  relationName: string | null
  guardian: SchoolContactPerson
  student: SchoolContactPerson
  class: SchoolContactClass
  syncedAt: string | Date
  syncState: SchoolContactSyncState["state"]
}

export interface SchoolContactRelationListResult extends OrganizationListResult<SchoolContactRelationRecord> {
  sync: SchoolContactSyncState
}

export interface SchoolContactRelationListParams {
  appType?: string
  userId?: string
  guardianUserId?: string
  studentUserId?: string
  dingtalkUserId?: string
  mobile?: string
  name?: string
  classId?: string
  role?: "guardian" | "student"
  relationCode?: string
  page?: number
  pageSize?: number
}

export interface SchoolContactTeacherMembershipRecord {
  membershipId: string
  teacher: SchoolContactTeacher
  class: SchoolContactClass
  isHeadTeacher: boolean
  source: "dingtalk_school_contact" | "manual"
  syncedAt: string | Date
  syncState: SchoolContactSyncState["state"]
}

export interface SchoolContactTeacherListResult extends OrganizationListResult<SchoolContactTeacherMembershipRecord> {
  sync: SchoolContactSyncState
}

export interface SchoolContactTeacherListParams {
  appType?: string
  userId?: string
  dingtalkUserId?: string
  mobile?: string
  name?: string
  classId?: string
  isHeadTeacher?: boolean
  page?: number
  pageSize?: number
}

export interface AppFunctionOrganizationApi {
  capabilities?(): Promise<OrganizationCapabilities>
  departments: {
    list<T = PageDepartmentRecord[]>(): Promise<T>
    get<T = PageDepartmentRecord>(
      departmentId: string,
      params?: { appType?: string },
    ): Promise<T>
    create<T = PageDepartmentRecord>(
      params: CreateOrganizationDepartmentParams,
    ): Promise<T>
    update<T = PageDepartmentRecord>(
      departmentId: string,
      params: UpdateOrganizationDepartmentParams,
    ): Promise<T>
  }
  accounts: {
    list<T = OrganizationListResult<PageUserRecord>>(
      params?: OrganizationAccountListParams,
    ): Promise<T>
    get<T = PageUserRecord>(
      userId: string,
      params?: { appType?: string },
    ): Promise<T>
    create<T = PageUserRecord>(
      params: CreateOrganizationAccountParams,
    ): Promise<T>
    update<T = PageUserRecord>(
      userId: string,
      params: UpdateOrganizationAccountParams,
    ): Promise<T>
    resetPassword<T = PageUserRecord>(
      userId: string,
      params: ResetOrganizationAccountPasswordParams,
    ): Promise<T>
    changeMyPassword<T = PageUserRecord>(
      params: ChangeOrganizationAccountPasswordParams,
    ): Promise<T>
  }
  schoolContact: {
    relations: {
      list<T = SchoolContactRelationListResult>(
        params?: SchoolContactRelationListParams,
      ): Promise<T>
    }
    teachers: {
      list<T = SchoolContactTeacherListResult>(
        params?: SchoolContactTeacherListParams,
      ): Promise<T>
    }
    children: {
      list<T = SchoolContactRelationListResult>(
        guardianUserId: string,
        params?: Pick<SchoolContactRelationListParams, "page" | "pageSize">,
      ): Promise<T>
    }
    guardians: {
      list<T = SchoolContactRelationListResult>(
        studentUserId: string,
        params?: Pick<SchoolContactRelationListParams, "page" | "pageSize">,
      ): Promise<T>
    }
    myFamily: {
      get<T = SchoolContactRelationListResult>(
        params?: Pick<SchoolContactRelationListParams, "page" | "pageSize">,
      ): Promise<T>
    }
  }
  [key: string]: unknown
}

export interface AppFunctionProcessStartResult {
  success: boolean
  formInstanceId?: string
  formInstId?: string
  processInstanceId: string
  [key: string]: unknown
}

export interface AppFunctionProcessTaskResult {
  taskId: string
  resubmittedBy?: string
  newAssignee?: string
  transferredBy?: string
  [key: string]: unknown
}

export interface AppFunctionProcessWithdrawResult {
  instanceId: string
  status: string
  cancelledTaskIds: string[]
  [key: string]: unknown
}

/**
 * Trusted backend workflow bridge for App Functions.
 *
 * The platform binds every call to the current app, the Function's declared
 * form resources, and the real runtime operator. Returned values are already
 * unwrapped from the HTTP response envelope used by PageSdk.
 */
export interface AppFunctionProcessApi {
  startFromExistingInstance<T = AppFunctionProcessStartResult>(
    params: WorkflowStartFromExistingInstanceParams,
  ): Promise<T>
  resolveCapabilities<T = ProcessCapabilities>(
    params: ResolveProcessCapabilitiesParams,
  ): Promise<T>
  resubmitTask<T = AppFunctionProcessTaskResult>(
    params: WorkflowResubmitParams,
  ): Promise<T>
  withdraw<T = AppFunctionProcessWithdrawResult>(
    params: WorkflowWithdrawParams,
  ): Promise<T>
  transferTask<T = AppFunctionProcessTaskResult>(
    params: WorkflowTransferParams,
  ): Promise<T>
  [key: string]: unknown
}

export interface AppFunctionPlatformApiRequest {
  path: string
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  params?: Record<string, unknown>
  data?: unknown
  body?: unknown
  headers?: Record<string, string | number>
  timeout?: number
}

export interface AppFunctionPlatformApiResponse<T = unknown> {
  data: T
  status: number
  statusText?: string
  headers?: Record<string, unknown>
}

/**
 * Same-origin platform bridge. The host injects a runtime service token and
 * the real operator as audit evidence; application code must never supply
 * either credential itself.
 */
export interface AppFunctionPlatformHttpApi {
  request<T = unknown>(
    input: AppFunctionPlatformApiRequest,
  ): Promise<AppFunctionPlatformApiResponse<T>>
  get<T = unknown>(
    path: string,
    config?: Omit<AppFunctionPlatformApiRequest, "path" | "method">,
  ): Promise<AppFunctionPlatformApiResponse<T>>
  post<T = unknown>(
    path: string,
    data?: unknown,
    config?: Omit<
      AppFunctionPlatformApiRequest,
      "path" | "method" | "data" | "body"
    >,
  ): Promise<AppFunctionPlatformApiResponse<T>>
  put<T = unknown>(
    path: string,
    data?: unknown,
    config?: Omit<
      AppFunctionPlatformApiRequest,
      "path" | "method" | "data" | "body"
    >,
  ): Promise<AppFunctionPlatformApiResponse<T>>
  patch<T = unknown>(
    path: string,
    data?: unknown,
    config?: Omit<
      AppFunctionPlatformApiRequest,
      "path" | "method" | "data" | "body"
    >,
  ): Promise<AppFunctionPlatformApiResponse<T>>
  delete<T = unknown>(
    path: string,
    config?: Omit<AppFunctionPlatformApiRequest, "path" | "method">,
  ): Promise<AppFunctionPlatformApiResponse<T>>
}

export interface AppFunctionRoleListParams {
  name?: string
  code?: string
  page?: number
  limit?: number
  pageSize?: number
}

export interface AppFunctionRoleUsersParams {
  page?: number
  limit?: number
  pageSize?: number
  keyword?: string
}

export interface AppFunctionRoleMemberMutationResult {
  userId: string
  username?: string
  name?: string
  reason?: string
}

export interface AppFunctionRoleBatchAddResult {
  role: Pick<PageRoleRecord, "id" | "name" | "code" | "scope" | "appType">
  results: {
    success: AppFunctionRoleMemberMutationResult[]
    failed: AppFunctionRoleMemberMutationResult[]
    total: number
  }
}

/**
 * Current-application role bridge for trusted App Functions.
 *
 * The runtime fixes appType to ctx.app.appType, validates the real operator's
 * app:role:manage permission, and records the platform call in invocation logs.
 */
export interface AppFunctionPlatformRolesApi {
  list(
    params?: AppFunctionRoleListParams,
  ): Promise<PageOffsetListResult<PageRoleRecord>>
  findByCode(
    roleCode: string,
    params?: Omit<AppFunctionRoleListParams, "code">,
  ): Promise<PageRoleRecord | null>
  get(roleId: string): Promise<PageRoleRecord | null>
  listUsers(
    roleId: string,
    params?: AppFunctionRoleUsersParams,
  ): Promise<PageOffsetListResult<PageUserRecord>>
  addUsers(
    roleId: string,
    userIds: string[],
  ): Promise<AppFunctionRoleBatchAddResult>
  removeUser(roleId: string, userId: string): Promise<boolean>
}

export interface AppFunctionPlatformApi {
  api: AppFunctionPlatformHttpApi
  roles: AppFunctionPlatformRolesApi
  [key: string]: unknown
}

export interface AppFunctionContext {
  operator?: AppFunctionOperatorInfo
  currentUser?: PageUserInfo | AppFunctionOperatorInfo
  permissions?: AppFunctionPermissionContext
  runtime?: AppFunctionRuntimeContext
  secrets?: AppFunctionSecrets
  files: AppFunctionFilesApi
  utils?: AppFunctionUtils
  resources?: Record<string, unknown>
  form: AppFunctionFormApi
  dataView: AppFunctionDataViewApi
  connector: AppFunctionConnectorApi
  notification: AppFunctionNotificationApi
  organization: AppFunctionOrganizationApi
  process: AppFunctionProcessApi
  platform: AppFunctionPlatformApi
  methods?: Record<string, (...args: any[]) => unknown>
  [key: string]: unknown
}

/** trusted_node_v2 always supplies the scoped Secret resolver. */
export interface AppFunctionContextV2 extends AppFunctionContext {
  secrets: AppFunctionSecrets
  utils: AppFunctionUtils
}

export type TrustedNodeV2Context = AppFunctionContextV2

export interface SearchSortItem {
  id: string
  isAsc: "y" | "n"
}

export interface SearchRule {
  key: SearchFieldKey
  componentName?: Exclude<SearchComponentName, "SubFormField">
  operator?: Exclude<SearchOperator, "EXISTS" | "NOT_EXISTS">
  value?: unknown
  type?: string
}

export interface SearchGroup {
  logic?: SearchLogic
  rules?: Array<SearchRule | SubFormRule>
  conditions?: SearchGroup[]
}

export interface SubFormRule {
  key: string
  componentName: "SubFormField"
  operator?: "EXISTS" | "NOT_EXISTS" | "IS_NULL" | "IS_NOT_NULL"
  value?: SearchGroup
  type?: string
}

export type SearchExpression =
  | SearchRule
  | SubFormRule
  | Array<SearchRule | SubFormRule>
  | Array<Record<string, unknown>>
  | SearchGroup
  | Record<string, unknown>

export interface PageDataSourceDescriptor {
  key: string
  type: string
  formUuid?: string
  fields?: string[]
  permission?: "read" | "write" | string
  defaultFilter?: SearchExpression | string
  [key: string]: unknown
}

export type CustomPageEntryMode = "app-shell" | "plain-page"

export interface CustomPageEntryConfig {
  mode?: CustomPageEntryMode | string
  hidePlatformNav?: boolean
  defaultRoute?: string
  [key: string]: unknown
}

export interface PageInfo {
  id: string
  code: string
  name: string
  type: string
  rendererType: string
  routeKey: string
  legacyFormUuid?: string
  status: string
  props: Record<string, unknown>
  route: Record<string, unknown> | object
  entry?: CustomPageEntryConfig
  dataSources: PageDataSourceDescriptor[]
  capabilities: Record<string, unknown>
  version?: string
  buildId?: string
  [key: string]: unknown
}

export interface PageMessageApi {
  success(text: string): void
  error(text: string): void
  warning(text: string): void
  info(text: string): void
  loading(text: string): () => void
}

export interface PageModalApi {
  confirm(input: { title: string; content: string }): Promise<boolean>
}

export interface PageNavigationApi {
  /**
   * pageKey accepts legacy formUuid, routeKey, or pageCode.
   * Custom pages should prefer routeKey/pageCode over hard-coded legacy formUuid.
   */
  pushPage(pageKey: string, query?: Record<string, unknown>): void
  replacePage(pageKey: string, query?: Record<string, unknown>): void
  pushRoute(route: string, query?: Record<string, unknown>): void
  replaceRoute(route: string, query?: Record<string, unknown>): void
  updateQuery(query: Record<string, unknown>): void
  setHash(hash: string): void
  back(): void
}

export interface PageBridgeApi {
  invoke<T = unknown>(method: string, payload?: unknown): Promise<T>
  subscribe?(event: string, listener: (payload: unknown) => void): () => void
}

export interface PageSdkMeta {
  packageName?: string
  version?: string | null
  supportedBridgeMethods?: string[]
}

export interface PageApiResponse<TResult = unknown, TRaw = TResult> {
  code: number | string
  success: boolean
  message?: string
  formInstId?: string
  formInstanceId?: string
  processInstanceId?: string
  serialNumber?: string
  serialNumbers?: Record<string, string>
  result: TResult | null
  data?: TRaw
  raw?: unknown
}

export interface ApiEnvelope<T = unknown> {
  code: number | string
  success?: boolean
  message?: string
  data?: T
  result?: T
  error?: string
  errorMessage?: string
}

export interface FormInstanceIdentifierResult {
  formInstId: string
  formInstanceId: string
  processInstanceId?: string
  serialNumber?: string
  serialNumbers?: Record<string, string>
  instanceId?: string
  result?: string
  success?: boolean
  code?: number | string
  [key: string]: unknown
}

export interface FormCreateResult extends FormInstanceIdentifierResult {}

export interface FormUpdateResult {
  formInstId: string
  formInstanceId: string
  result?: string
  success?: boolean
  code?: number | string
  [key: string]: unknown
}

export interface FormDetailResult<TData = Record<string, unknown>> {
  formInstId?: string
  formInstanceId?: string
  data: TData
  [key: string]: unknown
}

export interface FieldOptionValue {
  label: string
  value: string
  [key: string]: unknown
}

export type FormFieldValue =
  | string
  | number
  | boolean
  | null
  | FieldOptionValue
  | FieldOptionValue[]
  | Record<string, unknown>
  | Array<Record<string, unknown>>

export interface PageBinaryResponse {
  blob: Blob
  fileName?: string
  contentType?: string
  headers?: Record<string, string | undefined>
  raw?: unknown
}

export interface PageListResult<TItem = unknown> {
  currentPage: number
  data: TItem[]
  totalCount: number
}

export interface PageOffsetListResult<TItem = unknown> {
  items: TItem[]
  total: number
  page: number
  limit: number
}

export interface PageContext {
  protocolVersion: string
  app: PageAppInfo
  page: PageInfo
  user: PageUserInfo
  route: PageRouteInfo
  env: Record<string, unknown>
  permissions: PagePermissionInfo
  capabilities: string[]
  ui: {
    message: PageMessageApi
    modal: PageModalApi
  }
  navigation: PageNavigationApi
  bridge: PageBridgeApi
  sdk?: PageSdkMeta
}

export interface PageRequestOptions<
  TQuery = Record<string, unknown>,
  TBody = unknown,
> {
  path: string
  method: PageHttpMethod
  query?: TQuery
  body?: TBody
  headers?: Record<string, string>
  cache?: PageRequestCache
  dedupe?: boolean
  trace?: boolean
  traceLabel?: string
}

export interface PageTransportRequestPayload<TBody = unknown> {
  path: string
  method: PageHttpMethod
  query?: string
  body?: TBody
  headers?: Record<string, string>
  cache?: PageRequestCache
}

export interface PageTransportDownloadPayload<TBody = unknown> {
  path: string
  method: PageHttpMethod
  query?: string
  body?: TBody
  headers?: Record<string, string>
}

export interface PageSdkError extends Error {
  method?: string
  path?: string
  response?: PageApiResponse<unknown>
  raw?: unknown
}

export interface FormGetDetailParams {
  formUuid: string
  formInstId?: string
  formInstanceId?: string
  appType?: string
}

export interface FormCreateParams {
  formUuid: string
  appType?: string
  data: Record<string, unknown>
  saveAsDraft?: boolean
  draft?: boolean
  startProcess?: boolean
  autoStartProcess?: boolean
  processStartMode?: "auto" | "manual" | "draft" | "delayed" | "none" | string
  /**
   * Legacy compatibility only. New code should not infer a created row by
   * submitted field values; the save API returns identifiers, not full row data.
   */
  lookupAfterCreate?: boolean | "legacy"
  lookupFields?: string[]
}

export interface FormUpdateParams {
  formUuid: string
  appType?: string
  formInstId?: string
  formInstanceId?: string
  data?: Record<string, unknown>
  updateFormDataJson?: string
}

export interface FormRemoveParams {
  formUuid: string
  appType?: string
  formInstId?: string
  formInstanceId?: string
}

export interface FormChangeRecordParams {
  formUuid: string
  appType?: string
  formInstId?: string
  formInstanceId?: string
  page?: number
  pageSize?: number
}

export interface FormSearchParams {
  formUuid: string
  appType?: string
  search?: SearchExpression
  currentPage?: number
  pageSize?: number
  originatorId?: string
  createFrom?: string
  createTo?: string
  modifiedFrom?: string
  modifiedTo?: string
  dynamicOrder?: string | SearchSortItem
  instanceStatus?: InstanceStatus
}

export interface FormAdvancedSearchParams {
  formUuid: string
  appType?: string
  filters?: SearchExpression
  conditionType?: SearchLogic
  searchKeyWord?: string
  currentPage?: number
  pageSize?: number
  order?: SearchSortItem | SearchSortItem[]
  instanceStatus?: InstanceStatus
}

export interface DataViewQueryParams {
  appType?: string
  fields?: string[]
  filters?: SearchExpression | string
  conditionType?: SearchLogic
  searchKeyWord?: string
  currentPage?: number
  pageSize?: number
  order?: SearchSortItem | SearchSortItem[]
}

export interface DataViewStatsParams extends DataViewQueryParams {
  having?: SearchExpression | string
}

export interface DataViewQueryResult<
  TItem = unknown,
> extends PageListResult<TItem> {
  pageSize: number
  storageMode?: "materialized" | "live"
  lastRefreshedAt?: string | null
}

export interface FunctionInvokeParams<TInput = unknown> {
  appType?: string
  input?: TInput
}

export interface FunctionInvokeResult<TResult = unknown> {
  invocationId: string
  functionCode: string
  result: TResult
  output?: TResult
  variables?: Record<string, unknown>
  logs?: unknown[]
  duration?: number
}

export interface FormExportParams extends FormAdvancedSearchParams {
  exportAll?: "y" | "n"
  embedImages?: "y" | "n"
  exportFields?: string[]
}

export interface FormImportParams {
  formUuid: string
  appType?: string
  fileBase64: string
  fileName?: string
}

export interface ImportExportRecordQuery {
  formUuid: string
  appType?: string
  currentPage?: number
  pageSize?: number
}

export interface ImportExportRecordDownloadParams {
  appType?: string
  recordId: string
}

export interface DataManagementFilterState {
  filters?: SearchExpression
  conditionType?: SearchLogic
  searchKeyWord?: string
}

export interface PageDataManagementConfig {
  sort?: SearchSortItem[]
  showFields?: string[]
  filter?: DataManagementFilterState
  widths?: Record<string, number>
  lockFieldIds?: string[]
  lineHeight?: number
  [key: string]: unknown
}

export interface DataManagementConfigParams {
  formUuid: string
  appType?: string
}

export interface SaveDataManagementConfigParams extends DataManagementConfigParams {
  config: PageDataManagementConfig
  expectedRevision?: number
}

export interface PageUserRecord extends PageUserInfo {
  phone?: string | null
  email?: string | null
  avatar?: string | null
  status?: string
  createdAt?: string
  updatedAt?: string
  validFrom?: string | null
  validTo?: string | null
}

export interface CreateUserParams {
  id?: string
  username?: string
  password?: string
  phone?: string
  email?: string
  name: string
  avatar?: string
  jobNumber?: string
  departmentIds?: string[]
  affiliatedDepartmentId?: string | null
  validFrom?: string | Date | null
  validTo?: string | Date | null
}

export interface UpdateUserParams extends Partial<CreateUserParams> {
  id: string
}

export interface UserListParams {
  ids?: string[] | string
  departmentIds?: string[] | string
  keyword?: string
  name?: string
  username?: string
  phone?: string
  email?: string
  jobNumber?: string
  page?: number
  pageSize?: number
}

export interface ValidateUserParams {
  username: string
  password: string
}

export interface PageRoleRecord {
  id: string
  name: string
  code: string
  scope: PageScope
  appType?: string
  description?: string
  createdAt?: string
  updatedAt?: string
}

export interface CreateRoleParams {
  name: string
  code: string
  scope: PageScope
  appType?: string
  description?: string
}

export type UpdateRoleParams = Partial<CreateRoleParams>

export interface RoleListParams {
  appType?: string
  name?: string
  code?: string
  page?: number
  limit?: number
  scope?: PageScope
}

export interface RoleUsersParams {
  page?: number
  limit?: number
  keyword?: string
}

export interface AssignRolesParams {
  userId: string
  roleIds: string[]
}

export interface ChangeUserRoleParams {
  userId: string
  roleId: string
}

export interface BatchAddUsersToRoleParams {
  roleId: string
  userIds: string[]
}

export interface GetUserRolesParams {
  scope?: PageScope
  appType?: string
}

export interface SwitchPlatformRoleParams {
  roleId: string
}

export interface SwitchAppRoleParams {
  roleId: string
  appType?: string
}

export interface PageApiPermissionRecord {
  id: string
  name: string
  code: string
  scope: PageScope
  method?: "GET" | "POST" | "PUT" | "DELETE" | "ANY"
  path?: string
  appType?: string
  description?: string
  parentId?: string
  children?: PageApiPermissionRecord[]
}

export interface PageUiPermissionRecord {
  id: string
  name: string
  code: string
  type: PageUiPermissionType
  scope: PageScope
  appType?: string
  description?: string
  parentId?: string
  children?: PageUiPermissionRecord[]
}

export interface CreateApiPermissionParams {
  name: string
  code: string
  scope: PageScope
  method?: "GET" | "POST" | "PUT" | "DELETE" | "ANY"
  path: string
  description?: string
  parentId?: string
  appType?: string
}

export type UpdateApiPermissionParams = Partial<CreateApiPermissionParams>

export interface ApiPermissionListParams {
  code?: string
  scope?: PageScope
  appType?: string
  page?: number
  limit?: number
}

export interface AssignPermissionsParams {
  roleId: string
  permissionIds: string[]
}

export interface CreateUiPermissionParams {
  name: string
  code: string
  type: PageUiPermissionType
  scope: PageScope
  appType?: string
  description?: string
  parentId?: string
}

export type UpdateUiPermissionParams = Partial<CreateUiPermissionParams>

export interface UiPermissionListParams extends ApiPermissionListParams {
  type?: PageUiPermissionType
}

export interface FormPermissionGroup {
  id: string
  appType: string
  formUuid: string
  name: string
  type: "submit" | "view"
  roles: string[]
  platformRoleCodes?: string[]
  dataScope?: "all" | "self"
  operations?: string[]
  actions?: string[]
  fieldPermissions?: FieldPermissionDto[]
  fieldAccessPolicy?: FieldAccessPolicyDto | null
  dataPermission?: DataPermissionDto
  createdAt?: string
  updatedAt?: string
}

export type ViewOperationPermission =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "export"
  | "import"
  | "change_records"
  | "workflow"

export interface ViewPermissionSummary {
  fieldPermissions: Record<string, ViewFieldPermissionValue>
  operations: ViewOperationPermission[]
  actions?: ViewOperationPermission[]
  can?: Record<ViewOperationPermission, boolean>
  fieldAccessPolicy?: FieldAccessPolicyDto | null
  hasFullAccess?: boolean
  resourceType?: "form" | string
  matchedGroupCodes?: string[]
}

export interface CreateFormPermissionGroupDto {
  appType: string
  formUuid: string
  name: string
  type: "submit" | "view"
  roles: string[]
  platformRoleCodes?: string[]
  dataScope?: "all" | "self"
  operations?: string[]
  actions?: string[]
  fieldPermissions?: FieldPermissionDto[]
  fieldAccessPolicy?: FieldAccessPolicyDto | null
  dataPermission?: DataPermissionDto
}

export interface UpdateFormPermissionGroupDto {
  appType?: string
  formUuid?: string
  name?: string
  type?: "submit" | "view"
  roles?: string[]
  platformRoleCodes?: string[]
  dataScope?: "all" | "self"
  operations?: string[]
  fieldPermissions?: FieldPermissionDto[]
  fieldAccessPolicy?: FieldAccessPolicyDto | null
  dataPermission?: DataPermissionDto
}

export interface QueryFormPermissionGroupDto {
  appType?: string
  formUuid?: string
  type?: "submit" | "view"
  name?: string
  page?: number
  limit?: number
}

export interface PagePermissionGroup {
  id: string
  appType: string
  name: string
  roles: string[]
  platformRoleCodes?: string[]
  menuFormUuids: string[]
  createdAt?: string
  updatedAt?: string
}

export interface CreatePagePermissionGroupDto {
  appType: string
  name: string
  roles: string[]
  platformRoleCodes?: string[]
  menuFormUuids: string[]
}

export interface UpdatePagePermissionGroupDto {
  appType?: string
  name?: string
  roles?: string[]
  platformRoleCodes?: string[]
  menuFormUuids?: string[]
}

export interface QueryPagePermissionGroupDto {
  appType?: string
  name?: string
  page?: number
  limit?: number
}

export interface UserMenuPermissionsResponse {
  appType: string
  menuFormUuids: string[]
  hasFullAccess: boolean
  platformRoleCodes?: string[]
}

export type NotificationChannel =
  "inapp" | "email" | "dingding" | "wechat" | "thirdparty_todo"

export interface SendNotificationByTypeParams {
  notificationType: string
  recipientId: string
  appType?: string
  formUuid?: string
  payload: Record<string, unknown>
  channels?: NotificationChannel[]
}

export interface BatchSendNotificationByTypeParams {
  notificationType: string
  appType?: string
  formUuid?: string
  recipients: Array<{
    recipientId: string
    payload: Record<string, unknown>
    channels?: NotificationChannel[]
  }>
}

export interface NotificationChannelConfig {
  enabled?: boolean
  title?: string
  content?: string
  config?: Record<string, unknown>
  [key: string]: unknown
}

export interface NotificationChannelsConfig {
  inapp?: NotificationChannelConfig
  email?: NotificationChannelConfig
  dingding?: NotificationChannelConfig
  wechat?: NotificationChannelConfig
  thirdparty_todo?: NotificationChannelConfig
  [key: string]: NotificationChannelConfig | undefined
}

export type NotificationConfigLevel = "platform" | "app" | "form"

export interface NotificationTemplate {
  id?: string
  code: string
  name: string
  content?: string
  description?: string
  level?: NotificationConfigLevel
  appType?: string
  formUuid?: string
  priority?: number
  enabled?: boolean
  variables?: string[]
  channelsConfig?: NotificationChannelsConfig
  [key: string]: unknown
}

export interface NotificationTypeConfig {
  id?: string
  notificationType: string
  level?: NotificationConfigLevel
  appType?: string
  formUuid?: string
  templateId?: string
  template?: NotificationTemplate
  enabled?: boolean
  priority?: number
  description?: string
  [key: string]: unknown
}

export interface PreviewNotificationTemplateParams {
  appType?: string
  templateId?: string
  templateCode?: string
  code?: string
  level?: "app" | "form"
  formUuid?: string
  payload?: Record<string, unknown>
}

export type DingTalkNotificationDeliveryMode =
  "card_preferred" | "card_only" | "work_notice_only"

export type DingTalkNotificationCardMode = "standard" | "custom"

export interface DingTalkNotificationCardField {
  fieldId: string
  label: string
  order?: number
  required?: boolean
  [key: string]: unknown
}

export interface DingTalkNotificationCardConfig {
  mode?: DingTalkNotificationCardMode
  cardTemplateId?: string
  dingTalkTemplateId?: string
  title?: string
  summary?: string
  cardTitle?: string
  cardSummary?: string
  jumpUrl?: string
  maxFields?: number
  fieldConfigs?: DingTalkNotificationCardField[]
  paramMap?: Record<string, unknown>
  [key: string]: unknown
}

export interface DingTalkNotificationChannelConfig {
  deliveryMode?: DingTalkNotificationDeliveryMode
  fallbackToWorkNotice?: boolean
  workNoticeContent?: string
  cardTemplateId?: string
  dingTalkTemplateId?: string
  cardTitle?: string
  cardSummary?: string
  jumpUrl?: string
  maxFields?: number
  fieldConfigs?: DingTalkNotificationCardField[]
  card?: DingTalkNotificationCardConfig
  [key: string]: unknown
}

export interface PreviewDingTalkNotificationParams {
  appType?: string
  notificationType?: string
  templateId?: string
  templateCode?: string
  code?: string
  level?: "app" | "form"
  formUuid?: string
  payload?: Record<string, unknown>
  config?: DingTalkNotificationChannelConfig
  channelsConfig?: NotificationChannelsConfig
  content?: string
}

export interface DingTalkNotificationCardPreview {
  deliveryMode: DingTalkNotificationDeliveryMode
  fallbackToWorkNotice: boolean
  cardMode: DingTalkNotificationCardMode
  resolvedCardTemplateId?: string
  cardParamMap?: Record<string, string>
  outTrackId?: string
  workNoticeContent: string
  missingVariables: string[]
  warnings: string[]
  [key: string]: unknown
}

export interface DingTalkNotificationPreviewResult {
  cardPreview: DingTalkNotificationCardPreview
}

export interface DingTalkNotificationCapabilities {
  enabled: boolean
  hasAppCredentials: boolean
  hasAgentId: boolean
  hasDefaultCardTemplateId: boolean
  defaultCardTemplateId?: string
  deliveryModes: DingTalkNotificationDeliveryMode[]
  cardModes: DingTalkNotificationCardMode[]
  standardVariables: string[]
  [key: string]: unknown
}

export interface NotificationTemplatePreview {
  defaultContent?: string
  channelPreviews?: Record<string, string>
  enabledChannels?: Array<NotificationChannel | string>
  dingding?: DingTalkNotificationPreviewResult
  [key: string]: unknown
}

export interface FindNotificationConfigParams {
  appType?: string
  formUuid?: string
}

export interface NotificationMessageRecord {
  id?: string
  messageId?: string
  channel?: NotificationChannel | string
  status?: "pending" | "sent" | "failed" | string
  recipientId?: string
  deliveryMeta?: Record<string, unknown>
  [key: string]: unknown
}

export interface SendNotificationResult {
  messages: NotificationMessageRecord[]
}

export interface UpdateDingTalkCardParams {
  appType?: string
  messageId: string
  cardParamMap: Record<string, string | number | boolean | null | undefined>
}

export interface UpdateDingTalkCardResult {
  success: boolean
  messageId: string
  outTrackId?: string
  cardParamMap?: Record<string, string>
  error?: string
}

export type NotificationInboxReadStatus = "all" | "read" | "unread"

export interface ListNotificationInboxParams {
  appType?: string
  page?: number
  limit?: number
  readStatus?: NotificationInboxReadStatus
  keyword?: string
  templateCode?: string
}

export interface NotificationInboxMessage {
  id: string
  messageId: string
  templateCode?: string
  templateName?: string
  recipientId: string
  channel: NotificationChannel | string
  status: string
  title: string
  content: string
  actionUrl?: string
  businessType?: string
  businessId?: string
  readAt?: string | Date
  unread: boolean
  sentAt?: string | Date
  createdAt: string | Date
  payload?: Record<string, unknown>
  [key: string]: unknown
}

export interface NotificationInboxListResult {
  items: NotificationInboxMessage[]
  total: number
  unreadCount: number
  page: number
  limit: number
  totalPages: number
}

export interface NotificationUnreadCountResult {
  unreadCount: number
}

export interface MarkAllNotificationReadResult {
  updatedCount: number
  readAt: string | Date
}

export type WorkCenterBoxType = "todo" | "done" | "cc" | "initiated"

export interface ListWorkCenterItemsParams {
  appType?: string
  boxType: WorkCenterBoxType
  page?: number
  limit?: number
  keyword?: string
  status?: string
  result?: string
  sourceType?: string
  formUuid?: string
  startAt?: string | Date
  endAt?: string | Date
}

export interface WorkCenterStatsParams {
  appType?: string
  formUuid?: string
  startAt?: string | Date
  endAt?: string | Date
}

export interface WorkCenterItem {
  id: string
  userId?: string
  boxType: WorkCenterBoxType | string
  itemType?: string
  sourceType?: string
  sourceId?: string
  instanceId?: string
  formInstanceId?: string
  taskId?: string
  title: string
  summary?: string
  starter?: {
    id?: string
    name?: string
    departmentName?: string
  }
  appType?: string
  appName?: string
  formUuid?: string
  formName?: string
  startedAt?: string | Date
  arrivedAt?: string | Date
  completedAt?: string | Date
  status?: string
  result?: string
  nodeName?: string
  nodeId?: string
  actionUrl?: string
  payloadSnapshot?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface WorkCenterListResult<T = WorkCenterItem> {
  items: T[]
  total: number
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface WorkCenterGroupedStat {
  appType?: string
  appName?: string
  formUuid?: string
  formName?: string
  todo: number
  done: number
  cc: number
  initiated: number
  [key: string]: unknown
}

export interface WorkCenterStats {
  todo: number
  done: number
  cc: number
  initiated: number
  groupedStats?: {
    appStats?: WorkCenterGroupedStat[]
    formStats?: WorkCenterGroupedStat[]
  }
}

export type LoginLogStatus = "success" | "failure"

export interface LoginLogRecord {
  id: string
  tenantId: string
  userId?: string | null
  username?: string | null
  name?: string | null
  jobNumber?: string | null
  userType?: string | null
  sourceAppType?: string | null
  source: string
  method: string
  status: LoginLogStatus
  failureCode?: string | null
  failureReason?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  clientFingerprintHash?: string | null
  requestId?: string | null
  metadata?: Record<string, unknown>
  createdAt: string | Date
  [key: string]: unknown
}

export interface LoginLogListParams {
  appType?: string
  page?: number
  limit?: number
  status?: LoginLogStatus
  method?: string
  source?: string
  sourceAppType?: string
  userId?: string
  keyword?: string
  startAt?: string | Date
  endAt?: string | Date
  includeSensitive?: boolean
}

export interface LoginLogStatsParams {
  appType?: string
  startAt?: string | Date
  endAt?: string | Date
}

export interface LoginLogGetParams {
  appType?: string
  includeSensitive?: boolean
}

export interface LoginLogStats {
  total: number
  success: number
  failure: number
  byMethod: Array<{
    method: string
    status: LoginLogStatus
    count: number
  }>
}

export type ProcessApproveAction = "approved" | "rejected" | "returned"

export interface GetProcessInstanceParams {
  appType?: string
  instanceId: string
}

export interface TerminateProcessInstanceParams {
  appType?: string
  processInstanceId: string
  reason?: string
}

export interface ApproveTaskParams {
  instanceId: string
  action: ProcessApproveAction
  comments?: string
  formUuid: string
  appType?: string
  updateFormDataJson?: string
}

export interface TriggerCallbackTaskParams {
  appType?: string
  taskId: string
  payload?: unknown
}

export type WorkflowCapabilityActionKey =
  | "startProcess"
  | "approve"
  | "reject"
  | "transfer"
  | "return"
  | "save"
  | "withdraw"
  | "resubmit"
  | "callback"
  | "retryException"
  | "adminTransfer"

export interface ResolveProcessCapabilitiesParams {
  appType?: string
  formUuid?: string
  formInstId?: string
  formInstanceId?: string
  processInstanceId?: string
  instanceId?: string
  taskId?: string
}

export interface ProcessCapabilityOperation {
  key: WorkflowCapabilityActionKey
  label: string
  visible: boolean
  enabled: boolean
  disabledReason?: string
  taskId?: string
  instanceId?: string
  formInstanceId?: string
  nodeId?: string
  nodeType?: string
  sourceAction?: string
  paramsSchema?: Record<string, unknown>
  uiSchema?: Record<string, unknown>
  refreshHints?: string[]
  returnPolicy?: Record<string, unknown> | null
  returnableNodes?: Array<Record<string, unknown>>
  [key: string]: unknown
}

export interface ProcessCapabilities {
  instance?: Record<string, unknown>
  currentTask?: Record<string, unknown> | null
  pendingTasks?: Array<Record<string, unknown>>
  permissions?: Record<string, unknown>
  operations: ProcessCapabilityOperation[]
  timeline?: Array<Record<string, unknown>>
  protocolVersion?: string
  [key: string]: unknown
}

export interface ProcessInstanceLookupParams {
  appType?: string
  formInstId?: string
  formInstanceId?: string
  instanceId?: string
}

export interface WorkflowApproveParams {
  instanceId: string
  action?: "approved" | "rejected"
  comments?: string
  formUuid?: string
  appType?: string
  updateFormDataJson?: string
}

export interface WorkflowStartFromExistingInstanceParams {
  formUuid: string
  appType?: string
  formInstId?: string
  formInstanceId?: string
  updateFormDataJson?: string
  data?: Record<string, unknown>
  submissionDepartmentId?: string
  selectedApprovers?: Record<string, string[]>
  initiatorSelectedApprovers?: Record<string, string[]>
}

export interface WorkflowTransferParams {
  taskId: string
  newAssignee: string
  reason?: string
}

export interface WorkflowReturnParams {
  taskId: string
  targetNodeId: string
  reason?: string
}

export interface WorkflowWithdrawParams {
  instanceId: string
  reason?: string
}

export interface WorkflowSaveTaskParams {
  instanceId: string
  formUuid: string
  appType?: string
  updateFormDataJson: string
  comments?: string
}

export interface WorkflowResubmitParams {
  taskId: string
  formUuid: string
  appType?: string
  updateFormDataJson: string
  comments?: string
  selectedApprovers?: Record<string, string[]>
  initiatorSelectedApprovers?: Record<string, string[]>
}

export interface WorkflowPreviewParams {
  formUuid: string
  appType?: string
  data: Record<string, unknown>
  submissionDepartmentId?: string
  selectedApprovers?: Record<string, string[]>
  initiatorSelectedApprovers?: Record<string, string[]>
}

export interface WorkflowDefinitionByFormParams {
  formUuid: string
  appType?: string
  id?: string
}

export interface WorkflowInitiatorSelectRequirementsParams {
  formUuid: string
  appType?: string
  data: Record<string, unknown>
  submissionDepartmentId?: string
}

export interface WorkflowResubmitInitiatorSelectRequirementsParams extends WorkflowInitiatorSelectRequirementsParams {
  taskId: string
}

export interface WorkflowInitiatorSelectCandidatesParams {
  formUuid: string
  appType?: string
  nodeId: string
  page?: number
  pageSize?: number
  keyword?: string
  departmentId?: string
}

export interface WorkflowTaskParams {
  taskId: string
}

export type ConnectorRequestBodyType =
  "json" | "form-data" | "x-www-form-urlencoded" | "text" | "raw"

export type ConnectorResponseType = "json" | "text" | "binary"

export interface ConnectorInvokeParams<TBody = unknown> {
  appType?: string
  connector: string
  api: string
  pathParams?: Record<string, unknown>
  query?: Record<string, unknown>
  body?: TBody
  headers?: Record<string, string>
  requestBodyType?: ConnectorRequestBodyType
  responseType?: ConnectorResponseType
}

export interface ConnectorInvokeResult<TResult = unknown> {
  status: number
  duration: number
  data: TResult
  headers?: Record<string, unknown>
  contentType?: string
  encoding?: "base64"
}

export interface ConnectorCallParams<TBody = unknown> extends Omit<
  ConnectorInvokeParams<TBody>,
  "connector" | "api"
> {}

export interface AuthLogoutRedirectOptions {
  loginUrl?: string
  callbackUrl?: string
  callbackParamName?: string
  replace?: boolean
  continueOnLogoutError?: boolean
  fallback?: "reload" | "none"
  redirect?: (url: string) => void
}

export type FileAccessTicketPurpose =
  "preview" | "download" | "onlyoffice" | string

/** @deprecated Use FileAccessTicketPurpose. */
export type FileAccessTicketAction = FileAccessTicketPurpose

export interface CreateFileAccessTicketOptions {
  appType?: string
}

export interface FileAccessTicketResult {
  ticket: string
  purpose?: FileAccessTicketPurpose
  /** @deprecated Compatibility with older platform responses. */
  action?: FileAccessTicketAction
  appType?: string
  bucketName?: string
  objectName?: string
  fileName?: string
  contentType?: string
  mimeType?: string
  previewUrl?: string
  previewPageUrl?: string
  downloadUrl?: string
  officeTextPreviewUrl?: string
  renderMode?: string
  expiresAt?: string | Date
  [key: string]: unknown
}

export type StructuredExportScope = "selected" | "all"

export interface StructuredExportSourceDefinition {
  type: "form" | "dataView" | "function"
  formUuid?: string
  dataViewCode?: string
  functionCode?: string
  contract?: string
  idField?: string
  fields?: string[]
  filterOperators?: Record<string, string>
}

export type StructuredExportValueDefinition =
  | { type: "field"; path: string }
  | { type: "coalesce"; paths: string[] }
  | { type: "template"; template: string }
  | {
      type: "constant"
      value: string | number | boolean | null
    }

export type StructuredExportFormatType =
  | "text"
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "datetime"
  | "boolean"
  | "enum"
  | "join"
  | "member"
  | "department"
  | "json"
  | "mask"

export interface StructuredExportFormatDefinition {
  type: StructuredExportFormatType
  pattern?: string
  currency?: string
  locale?: string
  inputUnit?: "fraction" | "percent"
  trueLabel?: string
  falseLabel?: string
  map?: Record<string, string | number | boolean | null>
  separator?: string
  itemPath?: string
  keepStart?: number
  keepEnd?: number
  maskChar?: string
}

export interface StructuredExportCellStyle {
  bold?: boolean
  italic?: boolean
  fontColor?: string
  fillColor?: string
  horizontal?: "left" | "center" | "right"
  wrapText?: boolean
}

export interface StructuredExportStyleRule {
  when: {
    operator:
      | "eq"
      | "ne"
      | "in"
      | "notIn"
      | "contains"
      | "gt"
      | "gte"
      | "lt"
      | "lte"
      | "empty"
      | "notEmpty"
    value?: unknown
  }
  style: StructuredExportCellStyle
}

export interface StructuredExportColumnDefinition {
  key: string
  title: string
  value?: string | StructuredExportValueDefinition
  valuePath?: string
  dataIndex?: string | string[]
  format?: StructuredExportFormatType | StructuredExportFormatDefinition
  width?: number
  emptyValue?: string | number | boolean | null
  style?: StructuredExportCellStyle
  styleRules?: StructuredExportStyleRule[]
}

export interface StructuredExportSheetDefinition {
  key?: string
  name: string
  source?: StructuredExportSourceDefinition
  query?: object
  scope?: StructuredExportScope
  rowIds?: Array<string | number>
  columns: StructuredExportColumnDefinition[]
  renderer?: {
    type?: "function"
    functionCode: string
    input?: Record<string, unknown>
  }
  freezeHeader?: boolean
  autoFilter?: boolean
}

export interface StructuredExportWorkbookDefinition {
  fileName?: string
  creator?: string
  maxRows?: number
  sheets: StructuredExportSheetDefinition[]
}

export interface StructuredExportCreateParams {
  appType?: string
  protocol?: "structured_export_v1"
  exportKey: string
  source?: StructuredExportSourceDefinition
  query?: object
  scope?: StructuredExportScope
  rowIds?: Array<string | number>
  fieldKeys?: string[]
  columns?: StructuredExportColumnDefinition[]
  fileName?: string
  workbook?: StructuredExportWorkbookDefinition
  /**
   * An already-published App Function implementing
   * structured_export_provider_v1. No executable code is accepted here.
   */
  definitionCode?: string
  definitionInput?: Record<string, unknown>
}

export interface StructuredExportGetParams {
  appType?: string
}

export type StructuredExportTaskStatus =
  "pending" | "running" | "completed" | "failed"

export interface StructuredExportTask {
  id: string
  protocol: "structured_export_v1"
  status: StructuredExportTaskStatus
  progress?: number
  total?: number
  processed?: number
  message?: string
  downloadUrl?: string
  expiresAt?: string
}

export interface PageSdk {
  context: PageContext
  request<TResult = unknown, TRaw = TResult>(
    options: PageRequestOptions,
  ): Promise<PageApiResponse<TResult, TRaw>>
  download(options: PageRequestOptions): Promise<PageBinaryResponse>
  /**
   * Creates a shareable or new-window file URL. In-page React previews should use
   * AttachmentPreviewList, ImagePreviewGrid, or useFilePreview from runtime/react.
   */
  createFileAccessTicket(
    bucketName: string,
    objectName: string,
    fileName?: string,
    purpose?: FileAccessTicketPurpose,
    options?: CreateFileAccessTicketOptions,
  ): Promise<PageApiResponse<FileAccessTicketResult>>
  export: {
    create(
      params: StructuredExportCreateParams,
    ): Promise<PageApiResponse<StructuredExportTask>>
    get(
      taskId: string,
      params?: StructuredExportGetParams,
    ): Promise<PageApiResponse<StructuredExportTask>>
  }
  transport: {
    request<TResult = unknown, TRaw = TResult>(
      options: PageRequestOptions,
    ): Promise<PageApiResponse<TResult, TRaw>>
    download(options: PageRequestOptions): Promise<PageBinaryResponse>
  }
  auth: {
    logout<T = boolean>(): Promise<PageApiResponse<T>>
    logoutAndRedirect<T = boolean>(
      options?: AuthLogoutRedirectOptions,
    ): Promise<PageApiResponse<T> | null>
  }
  connector: {
    invoke<TResult = unknown, TBody = unknown>(
      params: ConnectorInvokeParams<TBody>,
    ): Promise<PageApiResponse<ConnectorInvokeResult<TResult>>>
    call<TResult = unknown, TBody = unknown>(
      name: string,
      params?: ConnectorCallParams<TBody>,
    ): Promise<PageApiResponse<ConnectorInvokeResult<TResult>>>
    download<TBody = unknown>(
      params: ConnectorInvokeParams<TBody>,
    ): Promise<PageBinaryResponse>
  }
  form: {
    getDetail<T = unknown>(
      params: FormGetDetailParams,
    ): Promise<PageApiResponse<T>>
    create<T = FormCreateResult, TRaw = unknown>(
      params: FormCreateParams,
    ): Promise<PageApiResponse<T, TRaw>>
    update<T = unknown, TRaw = unknown>(
      params: FormUpdateParams,
    ): Promise<PageApiResponse<T, TRaw>>
    remove<T = unknown, TRaw = unknown>(
      params: FormRemoveParams,
    ): Promise<PageApiResponse<T, TRaw>>
    getChangeRecords<T = unknown>(
      params: FormChangeRecordParams,
    ): Promise<PageApiResponse<T>>
    search<T = unknown>(
      params: FormSearchParams,
    ): Promise<PageApiResponse<PageListResult<T>>>
    searchIds<T = string>(
      params: FormSearchParams,
    ): Promise<PageApiResponse<PageListResult<T>>>
    advancedSearch<T = unknown>(
      params: FormAdvancedSearchParams,
    ): Promise<PageApiResponse<PageListResult<T>>>
    advancedExport(params: FormExportParams): Promise<PageBinaryResponse>
    downloadImportTemplate(
      params: DataManagementConfigParams,
    ): Promise<PageBinaryResponse>
    importPreview<T = unknown>(
      params: FormImportParams,
    ): Promise<PageApiResponse<T>>
    importExcel<T = unknown>(
      params: FormImportParams,
    ): Promise<PageApiResponse<T>>
    getImportRecords<T = unknown>(
      params: ImportExportRecordQuery,
    ): Promise<PageApiResponse<T>>
    getExportRecords<T = unknown>(
      params: ImportExportRecordQuery,
    ): Promise<PageApiResponse<T>>
    downloadImportSource(
      params: ImportExportRecordDownloadParams,
    ): Promise<PageBinaryResponse>
    downloadImportFailed(
      params: ImportExportRecordDownloadParams,
    ): Promise<PageBinaryResponse>
    downloadExportRecord(
      params: ImportExportRecordDownloadParams,
    ): Promise<PageBinaryResponse>
    getDataManagementConfig<T = PageDataManagementConfig | null>(
      params: DataManagementConfigParams,
    ): Promise<PageApiResponse<T>>
    saveDataManagementConfig<T = PageDataManagementConfig>(
      params: SaveDataManagementConfigParams,
    ): Promise<PageApiResponse<T>>
  }
  user: {
    create<T = PageUserRecord>(
      params: CreateUserParams,
    ): Promise<PageApiResponse<T>>
    update<T = PageUserRecord>(
      params: UpdateUserParams,
    ): Promise<PageApiResponse<T>>
    remove<T = boolean>(id: string): Promise<PageApiResponse<T>>
    get<T = PageUserRecord>(id?: string): Promise<PageApiResponse<T>>
    getCurrent<T = PageUserRecord>(): Promise<PageApiResponse<T>>
    getByUsername<T = PageUserRecord>(
      username: string,
    ): Promise<PageApiResponse<T>>
    list<T = PageOffsetListResult<PageUserRecord>>(
      params?: UserListParams,
    ): Promise<PageApiResponse<T>>
    search<T = PageUserRecord[]>(keyword?: string): Promise<PageApiResponse<T>>
    listAll<T = PageUserRecord[]>(): Promise<PageApiResponse<T>>
    listByDepartment<T = PageUserRecord[]>(
      departmentId: string,
    ): Promise<PageApiResponse<T>>
    validate<T = unknown>(
      params: ValidateUserParams,
    ): Promise<PageApiResponse<T>>
  }
  department: {
    getParentDepartments<T = PageDepartmentRecord[]>(
      departmentId: string,
      options?: GetParentDepartmentsOptions,
    ): Promise<PageApiResponse<T>>
    getCurrentUserParentDepartments(
      options?: GetParentDepartmentsOptions,
    ): Promise<CurrentUserDepartmentParents[]>
  }
  organization: {
    capabilities<T = OrganizationCapabilities>(params?: {
      appType?: string
    }): Promise<PageApiResponse<T>>
    departments: {
      list<T = PageDepartmentRecord[]>(params?: {
        appType?: string
      }): Promise<PageApiResponse<T>>
      get<T = PageDepartmentRecord>(
        departmentId: string,
        params?: { appType?: string },
      ): Promise<PageApiResponse<T>>
      create<T = PageDepartmentRecord>(
        params: CreateOrganizationDepartmentParams,
      ): Promise<PageApiResponse<T>>
      update<T = PageDepartmentRecord>(
        departmentId: string,
        params: UpdateOrganizationDepartmentParams,
      ): Promise<PageApiResponse<T>>
    }
    accounts: {
      list<T = OrganizationListResult<PageUserRecord>>(
        params?: OrganizationAccountListParams,
      ): Promise<PageApiResponse<T>>
      get<T = PageUserRecord>(
        userId: string,
        params?: { appType?: string },
      ): Promise<PageApiResponse<T>>
      create<T = PageUserRecord>(
        params: CreateOrganizationAccountParams,
      ): Promise<PageApiResponse<T>>
      update<T = PageUserRecord>(
        userId: string,
        params: UpdateOrganizationAccountParams,
      ): Promise<PageApiResponse<T>>
      resetPassword<T = PageUserRecord>(
        userId: string,
        params: ResetOrganizationAccountPasswordParams,
      ): Promise<PageApiResponse<T>>
      changeMyPassword<T = PageUserRecord>(
        params: ChangeOrganizationAccountPasswordParams,
      ): Promise<PageApiResponse<T>>
    }
    schoolContact: {
      relations: {
        list<T = SchoolContactRelationListResult>(
          params?: SchoolContactRelationListParams,
        ): Promise<PageApiResponse<T>>
      }
      teachers: {
        list<T = SchoolContactTeacherListResult>(
          params?: SchoolContactTeacherListParams,
        ): Promise<PageApiResponse<T>>
      }
      children: {
        list<T = SchoolContactRelationListResult>(
          guardianUserId: string,
          params?: Pick<SchoolContactRelationListParams, "page" | "pageSize">,
        ): Promise<PageApiResponse<T>>
      }
      guardians: {
        list<T = SchoolContactRelationListResult>(
          studentUserId: string,
          params?: Pick<SchoolContactRelationListParams, "page" | "pageSize">,
        ): Promise<PageApiResponse<T>>
      }
      myFamily: {
        get<T = SchoolContactRelationListResult>(
          params?: Pick<SchoolContactRelationListParams, "page" | "pageSize">,
        ): Promise<PageApiResponse<T>>
      }
    }
  }
  role: {
    create<T = PageRoleRecord>(
      params: CreateRoleParams,
    ): Promise<PageApiResponse<T>>
    update<T = PageRoleRecord>(
      id: string,
      params: UpdateRoleParams,
    ): Promise<PageApiResponse<T>>
    remove<T = boolean>(id: string): Promise<PageApiResponse<T>>
    get<T = PageRoleRecord | null>(id: string): Promise<PageApiResponse<T>>
    list<T = PageOffsetListResult<PageRoleRecord>>(
      params?: RoleListParams,
    ): Promise<PageApiResponse<T>>
    listUsers<T = PageOffsetListResult<PageUserRecord>>(
      roleId: string,
      params?: RoleUsersParams,
    ): Promise<PageApiResponse<T>>
    assignRoles<T = PageUserRecord>(
      params: AssignRolesParams,
    ): Promise<PageApiResponse<T>>
    addUserRole<T = boolean>(
      params: ChangeUserRoleParams,
    ): Promise<PageApiResponse<T>>
    removeUserRole<T = boolean>(
      params: ChangeUserRoleParams,
    ): Promise<PageApiResponse<T>>
    batchAddUsers<T = unknown>(
      params: BatchAddUsersToRoleParams,
    ): Promise<PageApiResponse<T>>
    getMyRoles<T = PageRoleRecord[]>(
      params?: GetUserRolesParams,
    ): Promise<PageApiResponse<T>>
    getCurrentRole<T = PageRoleRecord | null>(
      params?: GetUserRolesParams,
    ): Promise<PageApiResponse<T>>
    switchPlatformRole<T = boolean>(
      params: SwitchPlatformRoleParams,
    ): Promise<PageApiResponse<T>>
    switchAppRole<T = boolean>(
      params: SwitchAppRoleParams,
    ): Promise<PageApiResponse<T>>
  }
  permission: {
    formGroup: {
      create<T = FormPermissionGroup>(
        params: CreateFormPermissionGroupDto,
      ): Promise<PageApiResponse<T>>
      update<T = FormPermissionGroup>(
        id: string,
        params: UpdateFormPermissionGroupDto,
      ): Promise<PageApiResponse<T>>
      remove<T = boolean>(id: string): Promise<PageApiResponse<T>>
      get<T = FormPermissionGroup | null>(
        id: string,
      ): Promise<PageApiResponse<T>>
      list<T = PageOffsetListResult<FormPermissionGroup>>(
        params?: QueryFormPermissionGroupDto,
      ): Promise<PageApiResponse<T>>
      getViewFieldPermissions<
        T = Record<string, ViewFieldPermissionValue>,
      >(params: {
        appType?: string
        formUuid: string
      }): Promise<PageApiResponse<T>>
      getViewPermissionSummary<T = ViewPermissionSummary>(params: {
        appType?: string
        formUuid: string
      }): Promise<PageApiResponse<T>>
    }
    pageGroup: {
      create<T = PagePermissionGroup>(
        params: CreatePagePermissionGroupDto,
      ): Promise<PageApiResponse<T>>
      update<T = PagePermissionGroup>(
        id: string,
        params: UpdatePagePermissionGroupDto,
      ): Promise<PageApiResponse<T>>
      remove<T = boolean>(id: string): Promise<PageApiResponse<T>>
      get<T = PagePermissionGroup | null>(
        id: string,
      ): Promise<PageApiResponse<T>>
      list<T = PageOffsetListResult<PagePermissionGroup>>(
        params?: QueryPagePermissionGroupDto,
      ): Promise<PageApiResponse<T>>
      getUserMenuPermissions<T = UserMenuPermissionsResponse>(
        appType?: string,
      ): Promise<PageApiResponse<T>>
    }
    api: {
      create<T = PageApiPermissionRecord>(
        params: CreateApiPermissionParams,
      ): Promise<PageApiResponse<T>>
      update<T = PageApiPermissionRecord>(
        id: string,
        params: UpdateApiPermissionParams,
      ): Promise<PageApiResponse<T>>
      remove<T = boolean>(id: string): Promise<PageApiResponse<T>>
      list<T = PageOffsetListResult<PageApiPermissionRecord>>(
        params?: ApiPermissionListParams,
      ): Promise<PageApiResponse<T>>
      assign<T = boolean>(
        params: AssignPermissionsParams,
      ): Promise<PageApiResponse<T>>
      getByRole<T = PageApiPermissionRecord[]>(
        roleId: string,
      ): Promise<PageApiResponse<T>>
      getRolesByPermission<T = PageRoleRecord[]>(
        permissionId: string,
      ): Promise<PageApiResponse<T>>
    }
    ui: {
      create<T = PageUiPermissionRecord>(
        params: CreateUiPermissionParams,
      ): Promise<PageApiResponse<T>>
      update<T = PageUiPermissionRecord>(
        id: string,
        params: UpdateUiPermissionParams,
      ): Promise<PageApiResponse<T>>
      remove<T = boolean>(id: string): Promise<PageApiResponse<T>>
      list<T = PageOffsetListResult<PageUiPermissionRecord>>(
        params?: UiPermissionListParams,
      ): Promise<PageApiResponse<T>>
      assign<T = boolean>(
        params: AssignPermissionsParams,
      ): Promise<PageApiResponse<T>>
      getMyPlatform<T = PageUiPermissionRecord[]>(): Promise<PageApiResponse<T>>
      getMyApp<T = PageUiPermissionRecord[]>(
        appType?: string,
      ): Promise<PageApiResponse<T>>
    }
  }
  process: {
    getInstance<T = unknown>(
      params: GetProcessInstanceParams,
    ): Promise<PageApiResponse<T>>
    terminateInstance<T = unknown>(
      params: TerminateProcessInstanceParams,
    ): Promise<PageApiResponse<T>>
    approveTask<T = unknown>(
      params: ApproveTaskParams,
    ): Promise<PageApiResponse<T>>
    triggerCallbackTask<T = unknown>(
      params: TriggerCallbackTaskParams,
    ): Promise<PageApiResponse<T>>
    getBasic<T = unknown>(
      params: ProcessInstanceLookupParams,
    ): Promise<PageApiResponse<T>>
    getProgress<T = unknown>(
      params: ProcessInstanceLookupParams,
    ): Promise<PageApiResponse<T>>
    getPermission<T = unknown>(
      params: ProcessInstanceLookupParams,
    ): Promise<PageApiResponse<T>>
    resolveCapabilities<T = ProcessCapabilities>(
      params: ResolveProcessCapabilitiesParams,
    ): Promise<PageApiResponse<T>>
    startFromExistingInstance<T = unknown>(
      params: WorkflowStartFromExistingInstanceParams,
    ): Promise<PageApiResponse<T>>
    approve<T = unknown>(
      params: WorkflowApproveParams,
    ): Promise<PageApiResponse<T>>
    reject<T = unknown>(
      params: WorkflowApproveParams,
    ): Promise<PageApiResponse<T>>
    transferTask<T = unknown>(
      params: WorkflowTransferParams,
    ): Promise<PageApiResponse<T>>
    adminTransferTask<T = unknown>(
      params: WorkflowTransferParams,
    ): Promise<PageApiResponse<T>>
    returnTask<T = unknown>(
      params: WorkflowReturnParams,
    ): Promise<PageApiResponse<T>>
    withdraw<T = unknown>(
      params: WorkflowWithdrawParams,
    ): Promise<PageApiResponse<T>>
    retryException<T = unknown>(params: {
      instanceId: string
    }): Promise<PageApiResponse<T>>
    saveTask<T = unknown>(
      params: WorkflowSaveTaskParams,
    ): Promise<PageApiResponse<T>>
    resubmitTask<T = unknown>(
      params: WorkflowResubmitParams,
    ): Promise<PageApiResponse<T>>
    getReturnableNodes<T = unknown>(
      params: WorkflowTaskParams,
    ): Promise<PageApiResponse<T>>
    preview<T = unknown>(
      params: WorkflowPreviewParams,
    ): Promise<PageApiResponse<T>>
    getDefinitionByForm<T = unknown>(
      params: WorkflowDefinitionByFormParams,
    ): Promise<PageApiResponse<T>>
    getInitiatorSelectRequirements<T = unknown>(
      params: WorkflowInitiatorSelectRequirementsParams,
    ): Promise<PageApiResponse<T>>
    getResubmitInitiatorSelectRequirements<T = unknown>(
      params: WorkflowResubmitInitiatorSelectRequirementsParams,
    ): Promise<PageApiResponse<T>>
    getInitiatorSelectCandidates<T = unknown>(
      params: WorkflowInitiatorSelectCandidatesParams,
    ): Promise<PageApiResponse<T>>
    triggerCallback<T = unknown>(
      params: TriggerCallbackTaskParams,
    ): Promise<PageApiResponse<T>>
  }
  dataSource: {
    run<TResult = unknown, TRaw = TResult>(
      name: string,
      params?: Record<string, unknown>,
    ): Promise<PageApiResponse<TResult, TRaw>>
  }
  dataView: {
    query<T = unknown>(
      code: string,
      params?: DataViewQueryParams,
    ): Promise<PageApiResponse<DataViewQueryResult<T>>>
    stats<T = unknown>(
      code: string,
      params?: DataViewStatsParams,
    ): Promise<PageApiResponse<DataViewQueryResult<T>>>
  }
  function: {
    invoke<TResult = unknown, TInput = unknown>(
      code: string,
      params?: FunctionInvokeParams<TInput>,
    ): Promise<PageApiResponse<FunctionInvokeResult<TResult>>>
  }
  notification: {
    sendByType<T = SendNotificationResult>(
      params: SendNotificationByTypeParams,
    ): Promise<PageApiResponse<T>>
    batchSendByType<T = SendNotificationResult>(
      params: BatchSendNotificationByTypeParams,
    ): Promise<PageApiResponse<T>>
    findConfig<T = NotificationTypeConfig | null>(
      notificationType: string,
      params?: FindNotificationConfigParams,
    ): Promise<PageApiResponse<T>>
    previewTemplate<T = NotificationTemplatePreview>(
      params: PreviewNotificationTemplateParams,
    ): Promise<PageApiResponse<T>>
    previewDingTalk<T = DingTalkNotificationPreviewResult>(
      params: PreviewDingTalkNotificationParams,
    ): Promise<PageApiResponse<T>>
    sendDingTalk<T = SendNotificationResult>(
      params: SendNotificationByTypeParams,
    ): Promise<PageApiResponse<T>>
    capabilities<T = DingTalkNotificationCapabilities>(params?: {
      appType?: string
    }): Promise<PageApiResponse<T>>
    listInbox<T = NotificationInboxListResult>(
      params?: ListNotificationInboxParams,
    ): Promise<PageApiResponse<T>>
    getUnreadCount<T = NotificationUnreadCountResult>(params?: {
      appType?: string
    }): Promise<PageApiResponse<T>>
    markRead<T = NotificationInboxMessage>(
      messageId: string,
      params?: { appType?: string },
    ): Promise<PageApiResponse<T>>
    markAllRead<T = MarkAllNotificationReadResult>(params?: {
      appType?: string
    }): Promise<PageApiResponse<T>>
  }
  workCenter: {
    listItems<T = WorkCenterItem>(
      params: ListWorkCenterItemsParams,
    ): Promise<PageApiResponse<WorkCenterListResult<T>>>
    getStats<T = WorkCenterStats>(
      params?: WorkCenterStatsParams,
    ): Promise<PageApiResponse<T>>
  }
  loginLog: {
    list<T = PageOffsetListResult<LoginLogRecord>>(
      params?: LoginLogListParams,
    ): Promise<PageApiResponse<T>>
    get<T = LoginLogRecord | null>(
      id: string,
      params?: LoginLogGetParams,
    ): Promise<PageApiResponse<T>>
    stats<T = LoginLogStats>(
      params?: LoginLogStatsParams,
    ): Promise<PageApiResponse<T>>
  }
  navigation: PageNavigationApi
  ui: PageContext["ui"]
}
