// src/types.ts - 表单组件库核心类型

import type { ReactNode } from 'react';
import type {
  FormSectionAccent,
  FormSectionIconKey,
  FormSectionVariant,
} from './layout/FormSection';

/** 字段行为状态 */
export type FieldBehavior = 'NORMAL' | 'READONLY' | 'DISABLED' | 'HIDDEN';

export type FormEngineMode = 'submit' | 'edit' | 'readonly';

export type StandardFormPageMode = FormEngineMode | 'detail' | 'process';

export type FormSubmitBehavior =
  | 'auto'
  | 'create'
  | 'update'
  | 'save-draft'
  | 'start-existing-process';

/** 校验预设模式 */
export type ValidationPreset = 'phone' | 'idCard' | 'email' | 'url' | 'bankCard';

/** 校验规则 */
export interface ValidationRule {
  required?: boolean;
  message?: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  preset?: ValidationPreset;
  pattern?: RegExp | string;
  validator?: (value: any) => Promise<void> | void;
}

/** 字段声明（schema 中的每个字段定义） */
export interface FieldDefinition {
  fieldId: string;
  componentName: string;
  label: string;
  required?: boolean;
  rules?: ValidationRule[];
  behavior?: FieldBehavior;
  placeholder?: string;
  tips?: string;
  defaultValue?: any;
  defaultValueType?: 'static' | 'expression';
  defaultValueExpression?: string;
  // 各组件特有的 props 通过泛型或 [key: string]: any 扩展
  [key: string]: any;
}

export type DateShortcutType =
  | 'today'
  | 'yesterday'
  | 'tomorrow'
  | 'currentWeek'
  | 'currentMonth'
  | 'pastDays'
  | 'futureDays';

export interface DateShortcutConfig {
  type: DateShortcutType;
  amount?: number;
  format?: string;
  includeTime?: boolean;
}

export type PeopleShortcutType =
  | 'currentUser'
  | 'currentDepartment'
  | 'parentDepartment'
  | 'role'
  | 'fixed'
  | 'currentUserManager'
  | 'currentUserManager2';

export interface PeopleShortcutConfig {
  type: PeopleShortcutType;
  roleId?: string;
  values?: any[];
}

// ============ 文本默认值快捷方式 ============

export type TextShortcutType =
  | 'currentUserName'
  | 'currentUserJobNumber'
  | 'currentDeptName'
  | 'uuid';

export interface TextShortcutConfig {
  type: TextShortcutType;
}

export interface LayoutVisibleWhen {
  field: string;
  operator:
    | 'eq'
    | 'ne'
    | 'in'
    | 'notIn'
    | 'contains'
    | 'empty'
    | 'notEmpty'
    | 'between'
    | 'changed';
  value?: any;
}

export interface BaseLayoutNode {
  id: string;
  type: 'field' | 'section' | 'grid' | 'tabs' | 'steps';
  hidden?: boolean;
  visibleWhen?: LayoutVisibleWhen | LayoutVisibleWhen[];
}

export interface FieldLayoutNode extends BaseLayoutNode {
  type: 'field';
  fieldId: string;
  span?: number;
  className?: string;
}

export interface SectionLayoutNode extends BaseLayoutNode {
  type: 'section';
  title: string;
  description?: string;
  variant?: FormSectionVariant;
  accent?: FormSectionAccent;
  iconKey?: FormSectionIconKey;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  children: FormLayoutNode[];
}

export interface GridLayoutCell {
  key?: string;
  children: FormLayoutNode[];
}

export interface GridLayoutNode extends BaseLayoutNode {
  type: 'grid';
  columns?: 1 | 2 | 3 | 4;
  gap?: number | string;
  columnGap?: number | string;
  rowGap?: number | string;
  columnRatios?: number[];
  layoutPreset?: string;
  cells?: GridLayoutCell[];
  children: FormLayoutNode[];
}

export interface TabLayoutItem {
  key: string;
  label: string;
  children: FormLayoutNode[];
}

export interface TabsLayoutNode extends BaseLayoutNode {
  type: 'tabs';
  defaultActiveKey?: string;
  items: TabLayoutItem[];
}

export interface StepLayoutItem {
  key: string;
  title: string;
  description?: string;
  children: FormLayoutNode[];
}

export interface StepsLayoutNode extends BaseLayoutNode {
  type: 'steps';
  items: StepLayoutItem[];
}

export type FormLayoutNode =
  | FieldLayoutNode
  | SectionLayoutNode
  | GridLayoutNode
  | TabsLayoutNode
  | StepsLayoutNode;

export interface FormTemplateConfig {
  type?: 'standard';
  defaultMode?: StandardFormPageMode;
  formType?: 'form' | 'process';
  submitSuccessMode?: 'redirect' | 'stay' | 'continue';
  enableDraft?: boolean;
  enableProcessPreview?: boolean;
  enableEdit?: boolean;
  enableDelete?: boolean;
  enableChangeRecords?: boolean;
  appearance?: FormAppearanceConfig;
}

export interface FormAppearanceConfig {
  layout?: 'horizontal' | 'vertical' | 'inline';
  variant?: 'outlined' | 'borderless' | 'filled' | 'underlined';
  size?: 'small' | 'middle' | 'large';
  columns?: 1 | 2 | 3 | 4;
  rendererSize?: 'compact' | 'default' | 'large';
  gap?: number | string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | number | string;
  requiredMark?: boolean | 'optional';
  colon?: boolean;
  labelCol?: Record<string, any>;
  wrapperCol?: Record<string, any>;
  scrollToFirstError?: boolean | Record<string, any>;
}

export interface FormRuntimeConfig {
  version?: string;
  generatedAt?: string;
  editorVersion?: string;
  currentUser?: UserItem;
  currentDepartment?: DepartmentTreeNode;
  currentUserManagers?: UserItem[];
  appType?: string;
  /**
   * 运行时数据查询函数（带权限控制）
   * 由宿主环境(app-workspace)注入，底层应调用 advancedSearch 接口
   */
  fetchFormData?: (params: RuntimeDataQueryParams) => Promise<RuntimeDataQueryResult>;
  [key: string]: any;
}

export interface RuntimeDataQueryParams {
  formUuid: string;
  appType: string;
  filters?: Array<{
    fieldId: string;
    operator: string;
    value?: any;
  }>;
  conditionLogic?: 'and' | 'or';
  sort?: { field: string; order: 'asc' | 'desc' };
  fieldId?: string;
  deduplicate?: boolean;
  pageSize?: number;
  currentPage?: number;
}

export interface RuntimeDataQueryResult {
  data: any[];
  totalCount?: number;
}

/** 表单 Schema 定义 */
export interface FormSchema {
  formMeta: {
    formUuid: string;
    appType: string;
    title: string;
  };
  fields: FieldDefinition[];
  layout?: FormLayoutNode[];
  rules?: FormEffect[];
  template?: FormTemplateConfig;
  runtime?: FormRuntimeConfig;
}

export interface LowcodePageMeta {
  pageId?: string;
  pageCode?: string;
  routeKey?: string;
  appType: string;
  title: string;
}

export type LowcodePageNodeType =
  | 'PageSection'
  | 'PageGrid'
  | 'HeadingBlock'
  | 'TextBlock'
  | 'DataManagementList'
  | 'FormBlock';

export interface LowcodePageNode {
  id: string;
  type: LowcodePageNodeType | string;
  props?: Record<string, any>;
  children?: LowcodePageNode[];
  cells?: Array<{
    key?: string;
    children: LowcodePageNode[];
  }>;
}

export interface LowcodePageSchema {
  schemaKind: 'page';
  pageMeta: LowcodePageMeta;
  nodes: LowcodePageNode[];
  dataSources?: Array<Record<string, any>>;
  runtime?: Record<string, any>;
}

export interface RuntimeResponse<T = any> {
  code?: number;
  success?: boolean;
  data?: T;
  result?: T;
  message?: string;
  error?: string;
  releaseControl?: {
    revision?: number;
    etag?: string;
    activeFormReleaseHead?: Record<string, any>;
  };
}

export interface RuntimeRequestConfig {
  url: string;
  method?: string;
  params?: Record<string, any>;
  data?: any;
  headers?: HeadersInit;
  responseType?: 'json' | 'blob';
}

export type RuntimeAuthHeadersProvider = () => HeadersInit | undefined;

export type RuntimeUploadProvider = 'platform' | 'oss' | 'builtin-oss';

export interface RuntimeUploadOptions {
  uploadProvider?: RuntimeUploadProvider;
  storageScope?: 'app' | 'platform';
  storageCode?: string;
  appType?: string;
  /** Explicit public form context. The server compares these values with the
   * signed guest policy claim; they are never trusted as authorization. */
  policyCode?: string;
  routeCode?: string;
  formUuid?: string;
  formCode?: string;
  fieldId?: string;
  uploadPurpose?: 'attachment' | 'image';
  imageCompression?: ImageCompressionConfig;
}

export interface FormRuntimeApi {
  request: <T = any>(config: RuntimeRequestConfig) => Promise<RuntimeResponse<T> | Blob>;
  uploadFile: (
    file: File,
    bucketName?: string,
    onProgress?: (percent: number) => void,
    options?: RuntimeUploadOptions,
  ) => Promise<AttachmentItem>;
  uploadPublicFile: (
    file: File,
    bucketName?: string,
    onProgress?: (percent: number) => void,
  ) => Promise<AttachmentItem>;
  deleteFile: (
    objectName: string,
    bucketName?: string,
    options?: RuntimeUploadOptions,
  ) => Promise<{ success: boolean }>;
  createDownloadTicket: (bucketName: string, objectName: string, fileName?: string) => Promise<any>;
  /**
   * Creates a protected file access ticket.
   *
   * previewPageUrl is the page URL that can be opened directly.
   * previewUrl is the raw file content stream URL for iframe/img/PDF viewers.
   */
  createFileAccessTicket: (
    bucketName: string,
    objectName: string,
    fileName?: string,
    purpose?: 'download' | 'preview' | 'onlyoffice',
    options?: { appType?: string },
  ) => Promise<any>;
  getUserById: (id: string) => Promise<any>;
  getUserList: (params?: Record<string, any>) => Promise<any[]>;
  getDepartmentRoots: () => Promise<any[]>;
  getDepartmentChildren: (parentId: string) => Promise<any[]>;
  searchDepartments?: (
    params: DepartmentSearchParams,
  ) => Promise<DepartmentSearchResult | DepartmentTreeNode[]>;
  getDepartmentParentDepartments: (id: string) => Promise<any[]>;
  getDepartmentMembers: (id: string) => Promise<any[]>;
  getDepartmentMembersPage: (
    id: string,
    params?: { page?: number; pageSize?: number },
  ) => Promise<{ items: any[]; total: number; page: number; pageSize: number }>;
  getChinaDivisions: (parentAdcode?: string) => Promise<any[]>;
  advancedSearch: (params: Record<string, any>) => Promise<any>;
  getDingTalkSignature: (url: string) => Promise<any>;
  submitFormData: (payload: Record<string, any>) => Promise<any>;
  updateFormData: (payload: Record<string, any>) => Promise<any>;
  startProcessFromExistingInstance: (payload: Record<string, any>) => Promise<any>;
}

export type FormRuntimeApiConfig = Partial<FormRuntimeApi> & {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  getAuthHeaders?: RuntimeAuthHeadersProvider;
};

/** 表单引擎配置 */
export interface FormEngineConfig {
  mode: FormEngineMode;
  formUuid: string;
  appType: string;
  defaultUploadProvider?: RuntimeUploadProvider;
  formInstanceId?: string;
  submitBehavior?: FormSubmitBehavior;
  permissions?: {
    fieldPermissions: Record<string, FieldBehavior>;
    operations: string[];
  };
  submit?: {
    beforeSubmit?: (values: Record<string, any>) => Promise<boolean | void>;
    afterSubmit?: (response: any) => Promise<void>;
    submitSuccessMode?: 'redirect' | 'stay' | 'callback';
    redirectUrl?: string;
  };
  api?: FormRuntimeApiConfig;
  navigation?: {
    basePath?: string;
  };
  compatibility?: {
    apiContracts?: 'strict' | 'legacy';
    legacyFallbacks?: boolean;
  };
  effects?: FormEffect[];
}

export type FormEffectConditionOperator =
  | 'eq'
  | 'ne'
  | 'in'
  | 'notIn'
  | 'contains'
  | 'empty'
  | 'notEmpty'
  | 'between'
  | 'changed';

export type FormEffectCondition =
  | {
      field: string;
      operator: FormEffectConditionOperator;
      value?: any;
    }
  | {
      all: FormEffectCondition[];
    }
  | {
      any: FormEffectCondition[];
    }
  | {
      not: FormEffectCondition;
    };

export type FormEffectAction =
  | {
      field: string;
      action:
        | 'show'
        | 'hide'
        | 'enable'
        | 'disable'
        | 'setValue'
        | 'clearValue'
        | 'setRequired'
        | 'setOptions';
      value?: any;
    }
  | {
      target: string;
      targetType?: 'field' | 'layout';
      action:
        | 'show'
        | 'hide'
        | 'enable'
        | 'disable'
        | 'setValue'
        | 'clearValue'
        | 'setRequired'
        | 'setOptions';
      value?: any;
    };

/** 字段联动效果 */
export interface FormEffect {
  id?: string;
  name?: string;
  when: FormEffectCondition;
  then: FormEffectAction[];
}

/** 基础字段组件 Props */
export interface BaseFieldProps {
  fieldId: string;
  label: string;
  value?: any;
  behavior?: FieldBehavior;
  required?: boolean;
  rules?: ValidationRule[];
  placeholder?: string;
  tips?: string;
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
  tipsClassName?: string;
  readonlyClassName?: string;
  onChange?: (value: any) => void;
  onBlur?: (value: any) => void;
}

/** TextField 专用 Props */
export interface TextFieldProps extends BaseFieldProps {
  defaultValue?: string;
  maxLength?: number;
  showCount?: boolean;
  allowClear?: boolean;
  prefix?: string;
  suffix?: string;
  autoComplete?: string;
  variant?: FormAppearanceConfig['variant'];
  size?: FormAppearanceConfig['size'];
  defaultShortcut?: TextShortcutConfig;
  defaultValueLinkage?: DefaultValueLinkageConfig;
  validationPresets?: ValidationPreset[];
}

/** NumberField 专用 Props */
export interface NumberFieldProps extends BaseFieldProps {
  defaultValue?: number | null;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  unit?: string;
  unitPosition?: 'prefix' | 'suffix';
  thousandSeparator?: boolean;
  controls?: boolean;
  keyboard?: boolean;
  stringMode?: boolean;
  variant?: FormAppearanceConfig['variant'];
  size?: FormAppearanceConfig['size'];
}

/** TextAreaField 专用 Props */
export interface TextAreaFieldProps extends BaseFieldProps {
  defaultValue?: string;
  rows?: number;
  minRows?: number;
  maxRows?: number;
  autoSize?: boolean | { minRows?: number; maxRows?: number };
  maxLength?: number;
  showCount?: boolean;
  allowClear?: boolean;
  autoComplete?: string;
  variant?: FormAppearanceConfig['variant'];
  size?: FormAppearanceConfig['size'];
  defaultShortcut?: TextShortcutConfig;
  defaultValueLinkage?: DefaultValueLinkageConfig;
}

/** 选项类型 */
export interface OptionItem {
  value: string;
  label: string;
  color?: string;
  disabled?: boolean;
}

export interface FieldValueSyncConfig {
  targetFieldId: string;
  valuePath?: 'value' | 'label';
  emptyValue?: any;
}

// ============ 选项数据源配置 ============

export type OptionSourceType = 'custom' | 'linkedForm' | 'dataLinkage';

export interface OptionSourceConfig {
  type: OptionSourceType;
  linkedForm?: LinkedFormOptionConfig;
  dataLinkage?: DataLinkageConfig;
}

export interface LinkedFormOptionConfig {
  formUuid: string;
  formTitle?: string;
  fieldId: string;
  fieldLabel?: string;
  valueFieldId?: string;
  valueFieldLabel?: string;
  labelFieldId?: string;
  labelFieldLabel?: string;
  searchFieldId?: string;
  searchFieldLabel?: string;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: DataFilter[];
  deduplicate?: boolean;
  pageSize?: number;
  remoteSearch?: boolean;
  remoteSearchMinChars?: number;
}

export interface DataLinkageConfig {
  formUuid: string;
  formTitle?: string;
  targetFieldId: string;
  targetFieldLabel?: string;
  conditions: DataLinkageCondition[];
  conditionLogic?: 'and' | 'or';
  deduplicate?: boolean;
}

export interface DataLinkageCondition {
  localFieldId: string;
  localFieldLabel?: string;
  localComponentName?: string;
  operator: 'eq' | 'ne' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte';
  remoteFieldId: string;
  remoteFieldLabel?: string;
  remoteComponentName?: string;
}

export interface DataFilter {
  fieldId: string;
  fieldLabel?: string;
  componentName?: string;
  operator:
    | 'eq'
    | 'ne'
    | 'contains'
    | 'gt'
    | 'lt'
    | 'gte'
    | 'lte'
    | 'in'
    | 'notIn'
    | 'empty'
    | 'notEmpty';
  value?: any;
}

// ============ 默认值联动配置 ============

export interface DefaultValueLinkageConfig {
  formUuid: string;
  formTitle?: string;
  targetFieldId: string;
  targetFieldLabel?: string;
  conditions: DataLinkageCondition[];
  conditionLogic?: 'and' | 'or';
}

// ============ 日期限制配置 ============

export type DateRangeRestriction = 'none' | 'todayAndAfter' | 'todayAndBefore' | 'custom';

export interface DateRestrictionConfig {
  type: DateRangeRestriction;
  customStart?: string;
  customEnd?: string;
}

// ============ 成员显示格式 ============

export type UserDisplayFormat = 'name' | 'nameWithJobNumber' | 'nameWithDepartment';

/** SelectField 专用 Props */
export interface SelectFieldProps extends BaseFieldProps {
  defaultValue?: OptionItem | null;
  options: OptionItem[];
  allowClear?: boolean;
  showSearch?: boolean;
  optionFilterProp?: string;
  optionLabelProp?: string;
  placement?: 'bottomLeft' | 'bottomRight' | 'topLeft' | 'topRight';
  maxTagTextLength?: number;
  variant?: FormAppearanceConfig['variant'];
  size?: FormAppearanceConfig['size'];
  optionEffects?: FormEffect[];
  optionSource?: OptionSourceConfig;
  coloredOptions?: boolean;
  defaultValueLinkage?: DefaultValueLinkageConfig;
  valueSync?: FieldValueSyncConfig[];
}

/** MultiSelectField 专用 Props */
export interface MultiSelectFieldProps extends BaseFieldProps {
  defaultValue?: OptionItem[];
  options: OptionItem[];
  allowClear?: boolean;
  showSearch?: boolean;
  maxCount?: number;
  maxTagCount?: number | 'responsive';
  maxTagTextLength?: number;
  optionFilterProp?: string;
  optionLabelProp?: string;
  placement?: 'bottomLeft' | 'bottomRight' | 'topLeft' | 'topRight';
  variant?: FormAppearanceConfig['variant'];
  size?: FormAppearanceConfig['size'];
  optionEffects?: FormEffect[];
  optionSource?: OptionSourceConfig;
  coloredOptions?: boolean;
}

/** RadioField 专用 Props */
export interface RadioFieldProps extends BaseFieldProps {
  defaultValue?: OptionItem | null;
  options: OptionItem[];
  direction?: 'horizontal' | 'vertical';
  optionType?: 'default' | 'button';
  buttonStyle?: 'outline' | 'solid';
  size?: FormAppearanceConfig['size'];
  optionEffects?: FormEffect[];
  optionSource?: OptionSourceConfig;
  coloredOptions?: boolean;
}

/** CheckboxField 专用 Props */
export interface CheckboxFieldProps extends BaseFieldProps {
  defaultValue?: OptionItem[];
  options: OptionItem[];
  direction?: 'horizontal' | 'vertical';
  maxCount?: number;
  optionEffects?: FormEffect[];
  optionSource?: OptionSourceConfig;
  coloredOptions?: boolean;
}

/** DateField 专用 Props */
export interface DateFieldProps extends BaseFieldProps {
  defaultValue?: string;
  defaultShortcut?: DateShortcutConfig;
  dateFormat?: string;
  showTime?: boolean;
  dateRestriction?: DateRestrictionConfig;
  defaultValueLinkage?: DefaultValueLinkageConfig;
}

/** CascadeDateField 专用 Props */
export interface CascadeDateFieldProps extends BaseFieldProps {
  defaultValue?: { start: string; end: string } | null;
  defaultShortcut?: DateShortcutConfig;
  dateFormat?: string;
  showTime?: boolean;
  startLabel?: string;
  endLabel?: string;
  dateRestriction?: DateRestrictionConfig;
  defaultValueLinkage?: DefaultValueLinkageConfig;
}

/** 附件项 */
export interface ImageVariant {
  url: string;
  objectName?: string;
  bucketName?: string;
  width?: number;
  height?: number;
  size?: number;
  contentType?: string;
  quality?: number;
}

export interface AttachmentImageVariants {
  thumb?: ImageVariant;
  preview?: ImageVariant;
}

export interface AttachmentItem {
  url: string;
  name: string;
  id: string;
  uid?: string;
  status?: 'uploading' | 'done' | 'error';
  provider?: 'platform' | 'oss';
  uploadProvider?: RuntimeUploadProvider;
  storageScope?: 'app' | 'platform';
  storageCode?: string;
  appType?: string;
  objectName?: string;
  bucketName?: string;
  originalName?: string;
  contentType?: string;
  mimeType?: string;
  extension?: string;
  thumbUrl?: string;
  previewUrl?: string;
  publicUrl?: string;
  downloadUrl?: string;
  width?: number;
  height?: number;
  variants?: AttachmentImageVariants;
  visibility?: 'public' | 'private';
  size?: number;
  percent?: number;
  error?: string;
}

export interface ImageCompressionVariantConfig {
  /** 压缩变体最大宽度，默认 thumb=320、preview=1280。 */
  maxWidth?: number;
  /** 压缩变体最大高度，默认 thumb=320、preview=1280。 */
  maxHeight?: number;
  /** JPEG/WebP 输出质量，取值 0-1；PNG 会忽略该值。 */
  quality?: number;
  /** 默认 source 保持原图格式；显式 webp/png/jpeg 时需确保存储 allowedExtensions 放行。 */
  format?: 'source' | 'jpeg' | 'webp' | 'png';
}

export interface ImageCompressionConfig {
  /** 设为 false 时完全跳过压缩；默认只有显式配置 imageCompression 才启用。 */
  enabled?: boolean;
  /** 预留选项；当前默认始终保留原图 url，并附加 thumb/preview 变体。 */
  preserveOriginal?: boolean;
  /** 小于等于该字节数的图片不生成压缩变体。 */
  skipBelowBytes?: number;
  /** 缩略图配置；设为 false 时不生成 thumb。 */
  thumb?: ImageCompressionVariantConfig | false;
  /** 预览图配置；设为 false 时不生成 preview。 */
  preview?: ImageCompressionVariantConfig | false;
}

/** AttachmentField 专用 Props */
export interface AttachmentFieldProps extends BaseFieldProps {
  defaultValue?: AttachmentItem[];
  maxCount?: number;
  accept?: string;
  maxSize?: number;
  uploadAction?: string;
  bucketName?: string;
  /** 自定义上传提供方；oss 需配置 storageCode，builtin-oss 使用平台内置 OSS。 */
  uploadProvider?: RuntimeUploadProvider;
  /** src/resources/storage/<code>.json 中声明的存储 code。 */
  storageCode?: string;
  multiple?: boolean;
  allowedTypes?: string[];
  showPreview?: boolean;
  showDownload?: boolean;
  showFileSize?: boolean;
  showFileTypeBadge?: boolean;
  /** @deprecated Preview now opens in the runtime dialog; use ticket previewPageUrl for shareable links. */
  previewPagePath?: string;
  mobileDownloadMode?: 'auto' | 'direct' | 'ticketRelay';
  /** 图片附件的浏览器端压缩配置；非图片、GIF、SVG 会自动跳过。 */
  imageCompression?: ImageCompressionConfig;
}

/** ImageField 专用 Props */
export interface ImageFieldProps extends BaseFieldProps {
  defaultValue?: AttachmentItem[];
  maxCount?: number;
  accept?: string;
  uploadAction?: string;
  bucketName?: string;
  /** 自定义上传提供方；oss 需配置 storageCode，builtin-oss 使用平台内置 OSS。 */
  uploadProvider?: RuntimeUploadProvider;
  /** src/resources/storage/<code>.json 中声明的存储 code。 */
  storageCode?: string;
  multiple?: boolean;
  maxSize?: number;
  listType?: 'text' | 'picture' | 'picture-card';
  showPreviewIcon?: boolean;
  showRemoveIcon?: boolean;
  showDownloadIcon?: boolean;
  /** 浏览器端压缩配置；原图 url 保留，压缩图写入 thumbUrl/previewUrl/variants。 */
  imageCompression?: ImageCompressionConfig;
}

/** 子表单列定义 */
export interface SubFormColumn {
  fieldId: string;
  label: string;
  componentName: string;
  [key: string]: any;
}

/** SubFormField 专用 Props */
export interface SubFormFieldProps extends BaseFieldProps {
  defaultValue?: Record<string, any>[];
  columns: SubFormColumn[];
  maxRows?: number;
  minRows?: number;
}

/** 用户数据源项 */
export interface UserItem {
  id: string;
  name: string;
  value?: string;
  label?: string;
  username?: string;
  jobNumber?: string;
  avatar?: string;
  departments?: Array<{ id?: string; name?: string }>;
}

export type InitiatorSelectScope = 'all' | 'members' | 'roles';

export type InitiatorSelectedApprovers = Record<string, string[]>;

export interface InitiatorSelectCandidate extends UserItem {
  phone?: string;
  email?: string;
}

export interface InitiatorSelectRequirement {
  nodeId: string;
  nodeName: string;
  scope: InitiatorSelectScope;
  approvals?: string[];
  approvalNames?: string[];
  multiApprove?: 'all' | 'or' | 'oneByOne';
  candidateUsers?: InitiatorSelectCandidate[];
  totalCandidates?: number;
}

/** UserSelectField 专用 Props */
export interface UserSelectFieldProps extends BaseFieldProps {
  defaultValue?: UserItem[];
  defaultShortcut?: PeopleShortcutConfig;
  multiple?: boolean;
  searchable?: boolean;
  dataSource?: UserItem[];
  treeData?: DepartmentTreeNode[];
  allowClear?: boolean;
  maxCount?: number;
  notFoundContent?: string;
  displayFormat?: UserDisplayFormat;
  defaultValueLinkage?: DefaultValueLinkageConfig;
}

/** 部门树节点 */
export interface DepartmentTreeNode {
  id: string;
  name: string;
  value?: string;
  label?: string;
  key?: string;
  title?: string;
  hasChildren?: boolean;
  isLeaf?: boolean;
  path?: Array<{ id: string; name: string }>;
  fullPath?: string;
  children?: DepartmentTreeNode[];
}

export type DepartmentSearchScope = 'loaded' | 'all';

export interface DepartmentSearchParams {
  keyword: string;
  page?: number;
  pageSize?: number;
  includePath?: boolean;
}

export interface DepartmentSearchResult {
  items: DepartmentTreeNode[];
  total: number;
  page: number;
  pageSize: number;
}

/** DepartmentSelectField 专用 Props */
export interface DepartmentSelectFieldProps extends BaseFieldProps {
  defaultValue?: { id: string; name: string }[];
  defaultShortcut?: PeopleShortcutConfig;
  multiple?: boolean;
  treeData?: DepartmentTreeNode[];
  allowClear?: boolean;
  maxCount?: number;
  notFoundContent?: string;
  showSearch?: boolean;
  searchScope?: DepartmentSearchScope;
  searchMinLength?: number;
  searchDebounceMs?: number;
  showFullPath?: boolean;
  scopeType?: 'all' | 'specified';
  specifiedDepts?: string[];
  defaultValueLinkage?: DefaultValueLinkageConfig;
}

export interface CascadeSelectFieldProps extends BaseFieldProps {
  defaultValue?: OptionItem[] | OptionItem[][];
  options?: Array<OptionItem & { children?: any[]; isLeaf?: boolean }>;
  multiple?: boolean;
  allowClear?: boolean;
  changeOnSelect?: boolean;
  showSearch?: boolean;
  fieldNames?: { label?: string; value?: string; children?: string };
}

export interface AddressValue {
  country?: OptionItem;
  province?: OptionItem;
  city?: OptionItem;
  district?: OptionItem;
  street?: OptionItem;
  detail?: string;
  fullAddress?: string;
}

export interface AddressFieldProps extends BaseFieldProps {
  defaultValue?: AddressValue;
  mode?:
    | 'province-city'
    | 'province-city-district'
    | 'province-city-district-street'
    | 'province-city-district-street-detail';
  detailPlaceholder?: string;
  allowClear?: boolean;
}

export interface AssociationFormConfig {
  appType: string;
  formUuid: string;
  mainFieldId: string;
  selectorColumns?: Array<
    string | { title?: string; dataIndex: string; key?: string; width?: number; ellipsis?: boolean }
  >;
  dataFilterRules?: Array<{
    key: string;
    operator?: string;
    componentName?: string;
    value?: string | number;
    valueType?: 'manual' | 'currentField';
    currentFieldKey?: string;
  }>;
  dataFilterConditionType?: 'AND' | 'OR';
  dataFillingEnabled?: boolean;
  dataFillingRules?: {
    mainRules?: Array<{
      source: string;
      target: string;
      sourceType?: string;
      targetType?: string;
    }>;
  };
}

export interface AssociationValue {
  label: string;
  value: string | number;
  record?: Record<string, any>;
}

export interface AssociationFormFieldProps extends BaseFieldProps {
  defaultValue?: AssociationValue | AssociationValue[];
  associationForm?: AssociationFormConfig;
  multiple?: boolean;
  allowClear?: boolean;
  showSearch?: boolean;
}

export type EditorToolbarAction =
  | 'undo'
  | 'redo'
  | 'heading'
  | 'fontFamily'
  | 'fontSize'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'superscript'
  | 'subscript'
  | 'color'
  | 'highlight'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'blockquote'
  | 'codeBlock'
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight'
  | 'link'
  | 'image'
  | 'imageUrl'
  | 'table'
  | 'addColumnBefore'
  | 'addColumnAfter'
  | 'deleteColumn'
  | 'addRowBefore'
  | 'addRowAfter'
  | 'deleteRow'
  | 'toggleHeaderRow'
  | 'deleteTable'
  | 'clear';

export interface EditorChoiceOption {
  label: string;
  value: string;
}

export interface EditorFieldProps extends BaseFieldProps {
  defaultValue?: string;
  rows?: number;
  maxLength?: number;
  height?: number | string;
  toolbarConfig?: 'full' | 'basic' | 'minimal' | EditorToolbarAction[] | string[];
  uploadBucketName?: string;
  maxImageSize?: number;
  allowedImageTypes?: string[];
  fontFamilies?: EditorChoiceOption[];
  fontSizes?: EditorChoiceOption[];
  colorPresets?: string[];
}

export interface SerialNumberFieldProps extends BaseFieldProps {
  defaultValue?: string;
  serialNumberRule?: Array<Record<string, any>>;
}

export interface LocationValue {
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
  district?: string;
  province?: string;
  name?: string;
  accuracy?: number;
  source?: 'browser' | 'dingTalk' | 'manual';
  time?: number;
}

export interface LocationFieldProps extends BaseFieldProps {
  defaultValue?: LocationValue;
  allowClear?: boolean;
  locateButtonText?: string;
  clearButtonText?: string;
}

export interface SignaturePoint {
  x: number;
  y: number;
  t: number;
}

export interface DigitalSignatureValue {
  url?: string;
  bucketName?: string;
  objectName?: string;
  previewUrl?: string;
  points?: SignaturePoint[];
  timestamp?: number;
  hash?: string;
}

export interface DigitalSignatureFieldProps extends BaseFieldProps {
  defaultValue?: DigitalSignatureValue;
  bucketName?: string;
  allowClear?: boolean;
}

export interface JSONFieldRendererContext {
  fieldId: string;
  label: string;
  value: any;
  formattedValue: string;
  behavior: FieldBehavior;
}

export interface JSONFieldEditorContext extends JSONFieldRendererContext {
  disabled: boolean;
  error?: string;
  onChange: (value: any) => void;
  onError: (error?: string) => void;
}

export interface JSONFieldProps extends BaseFieldProps {
  defaultValue?: any;
  indent?: number;
  rows?: number;
  renderer?: (context: JSONFieldRendererContext) => ReactNode;
  editor?: (context: JSONFieldEditorContext) => ReactNode;
}

// ============ 流程相关类型 ============

/** 流程状态 */
export type ProcessStatus =
  | 'running'
  | 'waiting'
  | 'exception'
  | 'completed'
  | 'terminated'
  | 'withdrawn'
  | 'pending'
  | 'cancelled';

/** 任务状态 */
export type TaskStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'returned'
  | 'suspended'
  | 'cancelled'
  | 'copied'
  | 'waiting'
  | 'simulated';

/** 流程任务节点类型 */
export type ProcessNodeType =
  | 'start'
  | 'approval'
  | 'copy'
  | 'end'
  | 'system'
  | 'originator_return'
  | 'callback_wait';

/** 审批操作类型 */
export type ApprovalActionType =
  | 'agree'
  | 'approved'
  | 'rejected'
  | 'reject'
  | 'transfer'
  | 'return'
  | 'save'
  | 'withdraw'
  | 'resubmit'
  | 'callback';

/** 流程操作动作定义 */
export interface ProcessAction {
  action: ApprovalActionType;
  name: { zh_CN: string; en_US?: string };
  text?: { zh_CN?: string; en_US?: string };
  hidden?: boolean;
  remark?: {
    popUp: boolean;
    required?: boolean;
    content?: { zh_CN: string; en_US?: string };
  };
}

/** 流程任务 */
export interface ProcessTask {
  id?: string;
  taskId: string;
  nodeId: string;
  nodeVisitId?: string;
  nodeType: ProcessNodeType;
  nodeName: string;
  title?: string;
  status: TaskStatus;
  canApprove?: boolean;
  assigneeId?: string;
  assignee?: string;
  assigneeName?: string;
  departmentName?: string;
  comments?: string;
  createdAt?: string;
  actionAt?: string;
  actions?: ProcessAction[];
  isSimulated?: boolean;
  multiApproveMode?: 'and' | 'or' | string;
}

/** 流程基本信息 */
export interface ProcessBasicInfo {
  instanceId: string;
  processStatus: ProcessStatus;
  formUuid: string;
  appType: string;
  title?: string;
  originatorId: string;
  originatorName: string;
  originatorDepartment?: string;
  createdAt: string;
  currentTask?: ProcessTask;
  isExecuting?: boolean;
}

/** 审批权限 */
export interface ApprovalPermission {
  hasPermission: boolean;
  canUndo: boolean;
  isApprover: boolean;
  currentTasks?: ProcessTask[];
  futureTasksCount?: number;
  details?: string;
}

/** 可退回节点 */
export interface ReturnableNode {
  nodeId: string;
  nodeName: string;
  id?: string;
  name?: string;
  type?: string;
}

export interface ReturnPolicy {
  resubmitMode?: string;
  [key: string]: any;
}

export interface ReturnableNodeResult {
  nodes: ReturnableNode[];
  policy?: ReturnPolicy | null;
}

/** 流程预览路由 */
export interface ProcessRoute {
  nodeId: string;
  nodeName: string;
  nodeType: ProcessNodeType;
  assignees: Array<{ id: string; name: string }>;
}

/** 流程定义 */
export interface ProcessDefinition {
  processId: string;
  flowConfig?: Record<string, Record<string, FieldBehavior>>;
  startNodeId?: string;
  nodes?: Array<Record<string, any>>;
  definitionJson?: Record<string, any>;
  viewJson?: Record<string, any>;
}

/** 视图权限摘要 */
export interface ViewPermissionSummary {
  fieldPermissions: Record<string, 'FORM_FILED_HIDDEN' | 'FORM_FILED_VIEW' | 'FORM_FILED_EDIT'>;
  operations: string[];
  actions?: string[];
  can?: Record<string, boolean>;
  fieldAccessPolicy?: any;
  hasFullAccess?: boolean;
  resourceType?: string;
  matchedGroupCodes?: string[];
}

/** 表单实例数据 */
export interface FormInstanceData {
  formInstanceId: string;
  formUuid: string;
  appType: string;
  title?: string;
  instanceTitle?: string;
  data: Record<string, any>;
  creator?: {
    userId: string;
    name: string;
    avatar?: string;
    department?: string;
  };
  createdBy?: string;
  createdByName?: string;
  createdByDepartmentId?: string;
  createdByDepartmentName?: string;
  createdAt: string;
  updatedAt?: string;
}

/** 变更记录 */
export interface ChangeRecord {
  id: string;
  fieldId: string;
  fieldLabel: string;
  oldValue: any;
  newValue: any;
  operatorId: string;
  operatorName: string;
  operatedAt: string;
  operatorDepartmentName?: string;
  operationId?: string;
  changeType?: 'create' | 'update' | 'delete' | string;
  changeSource?: string;
  changedCount?: number;
  createdAt?: string;
  changes?: Array<{
    fieldKey?: string;
    fieldLabel?: string;
    beforeValue?: any;
    afterValue?: any;
  }>;
}

/** 变更记录列表响应 */
export interface ChangeRecordListResponse {
  records: ChangeRecord[];
  total: number;
  page: number;
  pageSize: number;
}

// ============ API 参数类型 ============

export interface ApproveParams {
  instanceId: string;
  action: 'approved' | 'rejected';
  comments?: string;
  appType?: string;
  formUuid?: string;
  updateFormDataJson?: string;
}

export interface TransferParams {
  taskId: string;
  newAssignee: string;
  reason?: string;
}

export interface ReturnParams {
  taskId: string;
  targetNodeId: string;
  reason?: string;
}

export interface WithdrawParams {
  instanceId: string;
  reason?: string;
}

export interface SaveTaskParams {
  instanceId: string;
  formUuid: string;
  appType: string;
  updateFormDataJson: string;
}

export interface ResubmitParams {
  taskId: string;
  formUuid: string;
  appType: string;
  updateFormDataJson: string;
  comments?: string;
  selectedApprovers?: InitiatorSelectedApprovers;
  initiatorSelectedApprovers?: InitiatorSelectedApprovers;
}

export interface PreviewParams {
  formUuid: string;
  appType: string;
  data: Record<string, any>;
  submissionDepartmentId?: string;
  selectedApprovers?: InitiatorSelectedApprovers;
  initiatorSelectedApprovers?: InitiatorSelectedApprovers;
}

export interface FormDataQueryParams {
  formInstanceId: string;
  appType: string;
  formUuid: string;
}

export interface FormDataDeleteParams {
  formInstanceId: string;
  appType: string;
  formUuid: string;
}

export interface ChangeRecordQueryParams {
  formUuid: string;
  appType: string;
  formInstanceId: string;
  page?: number;
  pageSize?: number;
}

export interface ViewPermissionQueryParams {
  formUuid: string;
  appType: string;
  formInstanceId?: string;
}

/** 状态元信息（用于 UI 渲染） */
export interface StatusMeta {
  label: string;
  tone: 'brand' | 'success' | 'danger' | 'neutral' | 'warning';
}
