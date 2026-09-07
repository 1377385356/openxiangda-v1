import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ensureSchemaFormUuid } from "./form-api.mjs";

const config = {
  platformUrl: "https://platform.example.com",
  servicePrefix: "/service",
  appType: "APP_TEST",
  appKey: "app-key",
  appSecret: "app-secret",
  userId: "user-1",
  defaults: {
    formBuilderVersion: "2.0",
  },
  menu: {
    parentId: "",
    icon: "",
  },
};

let tempDirs: string[] = [];

function createSchemaFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "form-api-"));
  tempDirs.push(dir);
  const schemaPath = path.join(dir, "schema.ts");
  fs.writeFileSync(
    schemaPath,
    `export default { formMeta: { formUuid: "FORM_1", appType: "APP_TEST", title: "客户表单", formType: "receipt" } };\n`,
    "utf-8",
  );
  return schemaPath;
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("form api provisioning helpers", () => {
  it("does not create a menu for an existing schema formUuid unless requested", async () => {
    const schemaPath = createSchemaFile();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/forms/getFormList")) {
        return Response.json({
          code: 200,
          data: [{ formUuid: "FORM_1", appType: "APP_TEST" }],
        });
      }
      if (url.endsWith("/forms/menu/create")) {
        return Response.json({ code: 200, data: { id: "MENU_1" } });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureSchemaFormUuid({
      config,
      schemaPath,
      formName: "customer",
      accessToken: "token",
      ensureMenu: false,
    });

    expect(result.formUuid).toBe("FORM_1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      fetchMock.mock.calls.map(([url]) => String(url)).join("\n"),
    ).not.toContain("/forms/menu/create");
  });

  it("does not create a menu for an existing schema formUuid by default", async () => {
    const schemaPath = createSchemaFile();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/forms/getFormList")) {
        return Response.json({
          code: 200,
          data: [{ formUuid: "FORM_1", appType: "APP_TEST" }],
        });
      }
      if (url.endsWith("/forms/menu/create")) {
        return Response.json({ code: 200, data: { id: "MENU_1" } });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await ensureSchemaFormUuid({
      config,
      schemaPath,
      formName: "customer",
      accessToken: "token",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      fetchMock.mock.calls.map(([url]) => String(url)).join("\n"),
    ).not.toContain("/forms/menu/create");
  });

  it("creates a menu for an existing schema formUuid when explicitly requested", async () => {
    const schemaPath = createSchemaFile();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/forms/getFormList")) {
        return Response.json({
          code: 200,
          data: [{ formUuid: "FORM_1", appType: "APP_TEST" }],
        });
      }
      if (url.endsWith("/forms/getMenusByAppType")) {
        return Response.json({ code: 200, data: [] });
      }
      if (url.endsWith("/forms/menu/create")) {
        return Response.json({ code: 200, data: { id: "MENU_1" } });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await ensureSchemaFormUuid({
      config,
      schemaPath,
      formName: "customer",
      accessToken: "token",
      ensureMenu: true,
    });

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(
      "https://platform.example.com/service/dingtalk-api/v1.0/forms/menu/create",
    );
  });

  it("creates a menu when a schema formUuid form is created this run", async () => {
    const schemaPath = createSchemaFile();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/forms/getFormList")) {
        return Response.json({ code: 200, data: [] });
      }
      if (url.endsWith("/forms/createForm")) {
        return Response.json({ code: 200, data: { formUuid: "FORM_1" } });
      }
      if (url.endsWith("/forms/getMenusByAppType")) {
        return Response.json({ code: 200, data: [] });
      }
      if (url.endsWith("/forms/menu/create")) {
        return Response.json({ code: 200, data: { id: "MENU_1" } });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureSchemaFormUuid({
      config,
      schemaPath,
      formName: "customer",
      accessToken: "token",
      ensureMenu: false,
    });

    expect(result.created).toBe(true);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(
      "https://platform.example.com/service/dingtalk-api/v1.0/forms/menu/create",
    );
  });

  it("uses OpenXiangda workspace state bindings before schema literals", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "form-api-"));
    tempDirs.push(dir);
    const schemaPath = path.join(dir, "schema.ts");
    fs.mkdirSync(path.join(dir, ".openxiangda"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".openxiangda", "state.json"),
      `${JSON.stringify(
        {
          version: 1,
          profiles: {
            dev: {
              baseUrl: "https://platform.example.com/service",
              appType: "APP_TEST",
              resources: {
                forms: {
                  customer: {
                    formUuid: "FORM_STATE",
                    title: "客户表单",
                  },
                },
              },
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    fs.writeFileSync(
      schemaPath,
      [
        'const FORM_UUID = "";',
        'const APP_TYPE = process.env.OPENXIANGDA_APP_TYPE || process.env.APP_TYPE || "";',
        'export default { formMeta: { formUuid: FORM_UUID, appType: APP_TYPE, title: "客户表单", formType: "receipt" } };',
        "",
      ].join("\n"),
      "utf-8",
    );

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/forms")) {
        return Response.json({
          code: 200,
          data: [{ formUuid: "FORM_STATE", appType: "APP_TEST" }],
        });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureSchemaFormUuid({
      config: {
        ...config,
        workspaceRoot: dir,
        openXiangdaAccessToken: "token",
        openXiangdaProfile: "dev",
      },
      schemaPath,
      formName: "customer",
      accessToken: "token",
    });

    expect(result.formUuid).toBe("FORM_STATE");
    expect(result.appType).toBe("APP_TEST");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(schemaPath, "utf-8")).toContain('const FORM_UUID = "";');
  });

  it("uses the bound OpenXiangda appType and stores stale imported form ids in workspace state", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "form-api-"));
    tempDirs.push(dir);
    const schemaPath = path.join(dir, "schema.ts");
    const metaPath = path.join(dir, "meta.ts");
    fs.writeFileSync(
      metaPath,
      [
        'export const CUSTOMER_INFO_FORM_UUID = "FORM_OLD";',
        'export const CUSTOMER_INFO_APP_TYPE = "APP_OLD";',
        'export const CUSTOMER_INFO_TITLE = "客户表单";',
        "",
      ].join("\n"),
      "utf-8",
    );
    fs.writeFileSync(
      schemaPath,
      [
        "import {",
        "  CUSTOMER_INFO_APP_TYPE,",
        "  CUSTOMER_INFO_FORM_UUID,",
        "  CUSTOMER_INFO_TITLE,",
        '} from "./meta";',
        "export default {",
        "  formMeta: {",
        "    formUuid: CUSTOMER_INFO_FORM_UUID,",
        "    appType: CUSTOMER_INFO_APP_TYPE,",
        "    title: CUSTOMER_INFO_TITLE,",
        '    formType: "receipt",',
        "  },",
        "};",
        "",
      ].join("\n"),
      "utf-8",
    );

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toBe(
        "https://platform.example.com/service/openxiangda-api/v1/apps/APP_TEST/forms",
      );
      const body = JSON.parse(String(init?.body || "{}"));
      expect(body.formUuid).toBeUndefined();
      expect(body.name).toBe("客户表单");
      return Response.json({
        code: 200,
        data: { form: { formUuid: "FORM_NEW" } },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureSchemaFormUuid({
      config: {
        ...config,
        workspaceRoot: dir,
        openXiangdaAccessToken: "token",
        openXiangdaProfile: "dev",
      },
      schemaPath,
      formName: "customer",
      accessToken: "token",
    });

    expect(result.created).toBe(true);
    expect(result.formUuid).toBe("FORM_NEW");
    expect(result.appType).toBe("APP_TEST");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(metaPath, "utf-8")).toContain(
      'CUSTOMER_INFO_FORM_UUID = "FORM_OLD"',
    );
    expect(fs.readFileSync(metaPath, "utf-8")).toContain(
      'CUSTOMER_INFO_APP_TYPE = "APP_OLD"',
    );
    expect(
      JSON.parse(
        fs.readFileSync(path.join(dir, ".openxiangda", "state.json"), "utf-8"),
      ).profiles.dev.resources.forms.customer.formUuid,
    ).toBe("FORM_NEW");
  });

  it("creates OpenXiangda forms without requiring schema formUuid writeback", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "form-api-"));
    tempDirs.push(dir);
    const schemaPath = path.join(dir, "schema.ts");
    fs.writeFileSync(
      schemaPath,
      `export default { formMeta: { appType: "", title: "客户表单", formType: "receipt" } };\n`,
      "utf-8",
    );

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toBe(
        "https://platform.example.com/service/openxiangda-api/v1/apps/APP_TEST/forms",
      );
      const body = JSON.parse(String(init?.body || "{}"));
      expect(body.formUuid).toBeUndefined();
      return Response.json({
        code: 200,
        data: { form: { formUuid: "FORM_CREATED" } },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureSchemaFormUuid({
      config: {
        ...config,
        workspaceRoot: dir,
        openXiangdaAccessToken: "token",
        openXiangdaProfile: "dev",
      },
      schemaPath,
      formName: "customer",
      accessToken: "token",
    });

    expect(result.created).toBe(true);
    expect(result.formUuid).toBe("FORM_CREATED");
    expect(fs.readFileSync(schemaPath, "utf-8")).not.toContain("FORM_CREATED");
    expect(
      JSON.parse(
        fs.readFileSync(path.join(dir, ".openxiangda", "state.json"), "utf-8"),
      ).profiles.dev.resources.forms.customer.formUuid,
    ).toBe("FORM_CREATED");
  });

  it("stores managed-environment form bindings on the selected target without mutating the legacy profile", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "form-api-"));
    tempDirs.push(dir);
    const schemaPath = path.join(dir, "schema.ts");
    fs.mkdirSync(path.join(dir, ".openxiangda"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".openxiangda", "state.json"),
      `${JSON.stringify(
        {
          version: 1,
          currentTarget: "instrument-example-pre",
          profiles: {
            dev: {
              appType: "APP_PROD",
              resources: {
                forms: {
                  customer: { formUuid: "FORM_PROD" },
                },
              },
            },
          },
          targets: {
            "instrument-example-pre": {
              targetName: "instrument-example-pre",
              profile: "dev",
              kind: "preproduction",
              environmentId: "environment-pre",
              appType: "APP_PRE",
              resources: { forms: {} },
            },
            "instrument-example-prod": {
              targetName: "instrument-example-prod",
              profile: "dev",
              kind: "production",
              environmentId: "environment-prod",
              appType: "APP_PROD",
              resources: {
                forms: {
                  customer: { formUuid: "FORM_PROD" },
                },
              },
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    fs.writeFileSync(
      schemaPath,
      `export default { formMeta: { formUuid: "", appType: process.env.OPENXIANGDA_APP_TYPE || "", title: "客户表单", formType: "receipt" } };\n`,
      "utf-8",
    );

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toBe(
        "https://platform.example.com/service/openxiangda-api/v1/apps/APP_PRE/forms",
      );
      const body = JSON.parse(String(init?.body || "{}"));
      expect(body.formUuid).toBeUndefined();
      return Response.json({
        code: 200,
        data: { form: { formUuid: "FORM_PRE" } },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureSchemaFormUuid({
      config: {
        ...config,
        appType: "APP_PRE",
        workspaceRoot: dir,
        openXiangdaAccessToken: "token",
        openXiangdaProfile: "dev",
        openXiangdaTarget: "instrument-example-pre",
      },
      schemaPath,
      formName: "customer",
      accessToken: "token",
    });

    expect(result.formUuid).toBe("FORM_PRE");
    const state = JSON.parse(
      fs.readFileSync(path.join(dir, ".openxiangda", "state.json"), "utf-8"),
    );
    expect(state.targets["instrument-example-pre"].resources.forms.customer.formUuid).toBe(
      "FORM_PRE",
    );
    expect(state.targets["instrument-example-prod"].resources.forms.customer.formUuid).toBe(
      "FORM_PROD",
    );
    expect(state.profiles.dev.resources.forms.customer.formUuid).toBe(
      "FORM_PROD",
    );
  });
});
