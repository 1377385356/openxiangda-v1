export interface AppWorkspaceConfig {
  deliveryVersion: 2;
  appType: string;
  appName: string;
  runtimeMode?: "legacy" | "react-spa";
  platformUrl: string;
  servicePrefix: string;
  appKey: string;
  appSecret: string;
  userId: string;
  version: string;
  buildId: string;
  oss: {
    region: string;
    bucket: string;
    accessKeyId: string;
    accessKeySecret: string;
    pathPrefix: string;
  };
  defaults: {
    protocolVersion: string;
    frameworkVersion: string;
    cssIsolation: "namespace" | "shadow" | "none";
    formMenuParentId: string;
    formMenuIcon: string;
    pageMenuParentId: string;
    pageMenuIcon: string;
  };
  forms?: {
    dir?: string;
    publishLegacyBundle?: boolean;
  };
  compatibility?: {
    apiContracts?: "strict" | "legacy";
    legacyFallbacks?: boolean;
    requestTrace?: boolean;
  };
  governance?: {
    sdd?: {
      enabled?: boolean;
      strictHighRisk?: boolean;
      strictDocumentation?: boolean;
      documentationMode?: 'structured' | 'full';
      path?: string;
      schemaVersion?: "openxiangda-sdd-v2" | string;
    };
  };
}

export type CustomPageEntryMode = "app-shell" | "plain-page";

export interface CustomPageEntryConfig {
  mode?: CustomPageEntryMode | string;
  hidePlatformNav?: boolean;
  defaultRoute?: string;
}

export interface CustomPageConfig {
  code: string;
  name: string;
  description?: string;
  publish?: boolean;
  route?: {
    pathKey?: string;
    allowQueryKeys?: string[];
    allowHash?: boolean;
    subRouteMode?: "hash" | "memory" | string;
    defaultQuery?: Record<string, unknown>;
  };
  entry?: CustomPageEntryConfig;
  props?: Record<string, unknown>;
  dataSources?: Array<Record<string, unknown>>;
  menu?: {
    enabled?: boolean;
    name?: string;
    parentId?: string | null;
    icon?: string | null;
  };
  cssIsolation?: "namespace" | "shadow" | "none";
}

export function defineAppWorkspaceConfig<T extends AppWorkspaceConfig>(config: T): T {
  return config;
}

export function definePageConfig<T extends CustomPageConfig>(config: T): T {
  return config;
}
