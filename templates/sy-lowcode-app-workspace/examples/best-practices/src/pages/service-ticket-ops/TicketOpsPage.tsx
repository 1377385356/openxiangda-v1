import { App as AntdApp, Button, Input, Space, Typography } from "antd";
import { DataManagementList } from "openxiangda";
import { usePageContext, usePageSdk } from "openxiangda/runtime";
import { useMemo, useState } from "react";

import type { TicketOperator, TicketRecord } from "@/domain/service-ticket";
import { QueryState } from "@/shared/components/QueryState";
import { SERVICE_TICKET_FORM_UUID } from "@/shared/services/service-ticket";
import { useTicketOps } from "@/shared/hooks/useTicketOps";

import { TicketActionTimeline } from "./components/TicketActionTimeline";
import { TicketDetailDrawer } from "./components/TicketDetailDrawer";
import { buildTicketRowActions } from "./components/TicketTableActions";

const { Title, Text } = Typography;

function useOperator(): TicketOperator {
  const context = usePageContext();
  const roleCodes = Array.isArray(context.permissions.roleCodes)
    ? (context.permissions.roleCodes as string[])
    : [];
  return {
    userId: context.user.id,
    userName: context.user.name || context.user.username,
    roleCodes,
    departmentIds:
      context.user.departments
        ?.map((item) => item.id)
        .filter((id): id is string => Boolean(id)) || [],
  };
}

export function TicketOpsPage() {
  const sdk = usePageSdk();
  const context = usePageContext();
  const operator = useOperator();
  const ticketOps = useTicketOps(sdk, operator);
  const [selectedTicket, setSelectedTicket] = useState<TicketRecord | null>(null);
  const [keyword, setKeyword] = useState("");
  const { message } = AntdApp.useApp();

  const rowActions = useMemo(
    () =>
      buildTicketRowActions({
        operator,
        submittingAction: ticketOps.submittingAction,
        onAction: async (ticket, action) => {
          await ticketOps.runAction(ticket, action);
          message.success("工单状态已更新");
        },
        onDetail: setSelectedTicket,
      }),
    [message, operator, ticketOps],
  );

  return (
    <main className="bp-ticket-ops">
      <section className="bp-ticket-ops__header">
        <div>
          <Title level={3} className="bp-ticket-ops__title">
            工单运营台
          </Title>
          <Text type="secondary">
            状态流转由 domain/state-machine 控制，页面只组合筛选、列表和操作。
          </Text>
        </div>
        <Space>
          <Input.Search
            allowClear
            value={keyword}
            placeholder="按标题或描述查询"
            onChange={(event) => setKeyword(event.target.value)}
            onSearch={(nextKeyword) =>
              ticketOps.setSearch((current) => ({
                ...current,
                keyword: nextKeyword,
              }))
            }
          />
          <Button loading={ticketOps.refreshing} onClick={ticketOps.reload}>
            刷新
          </Button>
        </Space>
      </section>

      <QueryState error={ticketOps.error} onRetry={ticketOps.reload} />

      <DataManagementList
        appType={context.app.appType}
        formUuid={SERVICE_TICKET_FORM_UUID}
        title="工单列表"
        formTitle="服务工单"
        fullHeight={false}
        rowActions={rowActions}
        maxVisibleRowActions={3}
      />

      <TicketDetailDrawer
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
        extra={<TicketActionTimeline ticketId={selectedTicket?.formInstanceId || ""} />}
      />
    </main>
  );
}
