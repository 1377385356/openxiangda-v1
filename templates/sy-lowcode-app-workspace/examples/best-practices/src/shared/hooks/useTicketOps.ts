import { useCallback, useEffect, useMemo, useState } from "react";
import type { PageSdk } from "openxiangda/runtime";

import {
  getTicketUiPermissions,
  type TicketAction,
  type TicketOperator,
  type TicketRecord,
  type TicketSearchState,
} from "@/domain/service-ticket";
import {
  queryTickets,
  transitionTicket,
  type TicketQueryResult,
} from "@/shared/services/service-ticket";

const initialResult: TicketQueryResult = { records: [], total: 0 };

export function useTicketOps(sdk: PageSdk, operator: TicketOperator) {
  const [search, setSearch] = useState<TicketSearchState>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [result, setResult] = useState<TicketQueryResult>(initialResult);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [submittingAction, setSubmittingAction] = useState<TicketAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: "loading" | "refreshing" = "loading") => {
      if (mode === "loading") setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const next = await queryTickets(sdk, {
          currentPage: page,
          pageSize,
          search,
        });
        setResult(next);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "加载失败");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, pageSize, sdk, search],
  );

  useEffect(() => {
    void load("loading");
  }, [load]);

  const runAction = useCallback(
    async (ticket: TicketRecord, action: TicketAction, comment?: string) => {
      setSubmittingAction(action);
      setError(null);
      try {
        await transitionTicket(sdk, ticket, action, operator, comment);
        await load("refreshing");
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "操作失败");
      } finally {
        setSubmittingAction(null);
      }
    },
    [load, operator, sdk],
  );

  const recordsWithPermissions = useMemo(
    () =>
      result.records.map((ticket) => ({
        ticket,
        permissions: getTicketUiPermissions(ticket, operator),
      })),
    [operator, result.records],
  );

  return {
    search,
    setSearch,
    page,
    setPage,
    pageSize,
    setPageSize,
    total: result.total,
    recordsWithPermissions,
    loading,
    refreshing,
    submittingAction,
    error,
    reload: () => load("refreshing"),
    runAction,
  };
}
