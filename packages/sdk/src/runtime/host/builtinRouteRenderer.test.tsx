import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserRuntimeRouteResolution } from "./browserHost";
import { BuiltinRouteRenderer } from "./builtinRouteRenderer";

const componentCalls = vi.hoisted(() => ({
  standardFormPage: vi.fn(),
  dataManagementList: vi.fn(),
}));

vi.mock("../../components/templates/StandardFormPage", async () => {
  const React = await import("react");
  return {
    StandardFormPage: (props: any) => {
      componentCalls.standardFormPage(props);
      return React.createElement(
        "div",
        {
          "data-testid": "standard-form-page",
          "data-mode": props.mode,
          "data-app-type": props.appType,
          "data-form-uuid": props.formUuid,
          "data-form-instance-id": props.formInstanceId,
          "data-field-count": String(props.schema?.fields?.length || 0),
        },
        props.schema?.formMeta?.title,
      );
    },
  };
});

vi.mock("../../components/modules/DataManagementList", async () => {
  const React = await import("react");
  return {
    DataManagementList: (props: any) => {
      componentCalls.dataManagementList(props);
      return React.createElement(
        "div",
        {
          "data-testid": "data-management-list",
          "data-app-type": props.appType,
          "data-form-uuid": props.formUuid,
          "data-menu-form-uuid": props.menuFormUuid,
          "data-form-type": props.formType,
          "data-detail-base-path": props.detailBasePath,
        },
        props.title || "data-list",
      );
    },
  };
});

const createRoute = (
  partial: Partial<BrowserRuntimeRouteResolution>,
): BrowserRuntimeRouteResolution => ({
  appType: "APP_DEMO",
  path: "/APP_DEMO/form/customer",
  search: "",
  kind: "form-submit",
  mode: "builtin-route",
  params: {},
  query: {},
  runtime: {},
  ...partial,
});

const createSchemaResponse = (formType = "form") =>
  new Response(
    JSON.stringify({
      code: 200,
      data: {
        schema: {
          formMeta: {
            appType: "APP_DEMO",
            formUuid: "customer",
            title: "客户表单",
          },
          fields: [],
          template: {
            type: "standard",
          },
        },
        formType,
      },
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );

const createPlatformSchemaResponse = (formType = "process") =>
  new Response(
    JSON.stringify({
      code: 200,
      data: {
        name: "平台审批表单",
        formType,
        schema: {
          version: "2.0",
          componentsTree: [
            {
              componentName: "Page",
              id: "platform_form_page",
              props: {},
              children: [
                {
                  componentName: "TextField",
                  id: "request_title_1",
                  title: "需求标题",
                  props: {
                    isFormComponent: true,
                    fieldId: "request_title",
                    componentName: "TextField",
                    label: "需求标题",
                    required: true,
                    placeholder: "请输入需求标题",
                  },
                },
                {
                  componentName: "TextAreaField",
                  id: "request_desc_1",
                  title: "需求说明",
                  props: {
                    isFormComponent: true,
                    fieldId: "request_desc",
                    componentName: "TextareaField",
                    label: "需求说明",
                  },
                },
              ],
            },
          ],
        },
      },
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );

describe("BuiltinRouteRenderer", () => {
  beforeEach(() => {
    componentCalls.standardFormPage.mockClear();
    componentCalls.dataManagementList.mockClear();
  });

  it("loads schema and renders the SDK default form submit page", async () => {
    const fetchImpl = vi.fn(async () => createSchemaResponse()) as unknown as typeof fetch;
    const route = createRoute({
      kind: "form-submit",
      params: { formUuid: "customer" },
      runtime: {
        bootstrapEndpoint: "/openxiangda-api/v1/apps/APP_DEMO/forms/customer",
      },
    });

    render(
      <BuiltinRouteRenderer
        route={route}
        servicePrefix="/service"
        fetchImpl={fetchImpl}
      />,
    );

    expect(await screen.findByTestId("standard-form-page")).toHaveAttribute(
      "data-mode",
      "submit",
    );
    expect(screen.getByTestId("standard-form-page")).toHaveAttribute(
      "data-form-uuid",
      "customer",
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      "/service/openxiangda-api/v1/apps/APP_DEMO/forms/customer",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
  });

  it("normalizes platform componentsTree schemas for builtin form pages", async () => {
    const fetchImpl = vi.fn(async () => createPlatformSchemaResponse()) as unknown as typeof fetch;

    render(
      <BuiltinRouteRenderer
        route={createRoute({
          kind: "form-submit",
          params: { formUuid: "platform_process" },
        })}
        servicePrefix="/service"
        fetchImpl={fetchImpl}
      />,
    );

    const page = await screen.findByTestId("standard-form-page");
    expect(page).toHaveTextContent("平台审批表单");
    expect(page).toHaveAttribute("data-field-count", "2");
    expect(componentCalls.standardFormPage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        schema: expect.objectContaining({
          fields: [
            expect.objectContaining({
              fieldId: "request_title",
              componentName: "TextField",
              label: "需求标题",
              required: true,
            }),
            expect.objectContaining({
              fieldId: "request_desc",
              componentName: "TextareaField",
              label: "需求说明",
            }),
          ],
          layout: [
            expect.objectContaining({ type: "field", fieldId: "request_title" }),
            expect.objectContaining({ type: "field", fieldId: "request_desc" }),
          ],
          template: expect.objectContaining({
            formType: "process",
            enableProcessPreview: true,
          }),
        }),
      }),
    );
  });

  it("renders the SDK data management list with route params and request override", () => {
    const route = createRoute({
      kind: "data-manage-list",
      path: "/APP_DEMO/data-manage-list/customer",
      params: {
        formUuid: "customer",
        menuFormUuid: "customer_menu",
        formType: "process",
      },
      query: {},
    });

    render(
      <BuiltinRouteRenderer
        route={route}
        servicePrefix="/service"
        config={{
          "data-manage-list": {
            customer: {
              title: "客户数据",
              readonly: false,
            },
          },
        }}
      />,
    );

    const list = screen.getByTestId("data-management-list");
    expect(list).toHaveAttribute("data-app-type", "APP_DEMO");
    expect(list).toHaveAttribute("data-form-uuid", "customer");
    expect(list).toHaveAttribute("data-menu-form-uuid", "customer_menu");
    expect(list).toHaveAttribute("data-form-type", "process");
    expect(list).toHaveAttribute(
      "data-detail-base-path",
      "/view/APP_DEMO/processDetail/customer",
    );
    expect(componentCalls.dataManagementList).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: "客户数据",
        readonly: false,
        requestOverride: expect.any(Function),
      }),
    );
  });

  it("does not render builtin content or overrides when route permission denies view", () => {
    const Override = () => <div data-testid="denied-override" />;

    render(
      <BuiltinRouteRenderer
        route={createRoute({
          kind: "data-manage-list",
          path: "/APP_DEMO/data-manage-list/customer",
          params: { formUuid: "customer" },
          message: "您没有权限访问该数据列表",
          runtime: {
            permission: {
              canView: false,
            },
          },
        })}
        overrides={{
          "data-manage-list": {
            customer: Override,
          },
        }}
      />,
    );

    expect(screen.getByText("您没有权限访问该数据列表")).toBeInTheDocument();
    expect(screen.queryByTestId("data-management-list")).not.toBeInTheDocument();
    expect(screen.queryByTestId("denied-override")).not.toBeInTheDocument();
  });

  it("uses an exact form override before wildcard and still exposes the default node", async () => {
    const fetchImpl = vi.fn(async () => createSchemaResponse()) as unknown as typeof fetch;
    const ExactOverride = (props: any) => (
      <div data-testid="exact-override">
        exact:{props.formUuid}
        {props.defaultNode}
      </div>
    );
    const WildcardOverride = () => <div data-testid="wildcard-override" />;

    render(
      <BuiltinRouteRenderer
        route={createRoute({
          kind: "form-detail",
          params: { formUuid: "customer", formInstId: "FORM_INST_1" },
        })}
        fetchImpl={fetchImpl}
        overrides={{
          "form-detail": {
            "*": WildcardOverride,
            customer: ExactOverride,
          },
        }}
      />,
    );

    expect(await screen.findByTestId("exact-override")).toHaveTextContent(
      "exact:customer",
    );
    expect(screen.queryByTestId("wildcard-override")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("standard-form-page")).toHaveAttribute(
        "data-mode",
        "detail",
      );
    });
  });

  it("renders the metadata-driven file preview iframe for PDF files", async () => {
    const request = vi.fn(async (config: any) => {
      if (config.url === "/file/access-ticket/TICKET_1") {
        return {
          code: 200,
          data: {
            fileName: "contract.pdf",
            extension: "pdf",
            previewType: "pdf",
            renderMode: "pdfjs",
            previewUrl: "/file/preview-by-ticket/TICKET_1",
            downloadUrl: "/file/download-by-access-ticket/TICKET_1",
          },
        };
      }
      return { code: 404, message: "not found" };
    });

    render(
      <BuiltinRouteRenderer
        requestOverride={request}
        route={createRoute({
          kind: "file-preview",
          path: "/file-preview",
          params: { ticket: "TICKET_1" },
        })}
        servicePrefix="/service"
      />,
    );

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith({
        url: "/file/access-ticket/TICKET_1",
        method: "get",
      }),
    );
    expect(await screen.findByTitle("contract.pdf")).toHaveAttribute(
      "src",
      "/service/file/preview-by-ticket/TICKET_1",
    );
  });
});
