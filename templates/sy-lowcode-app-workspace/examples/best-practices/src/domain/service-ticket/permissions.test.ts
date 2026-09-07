import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canViewTicket, getTicketUiPermissions } from "./permissions";
import type { TicketOperator, TicketRecord } from "./types";

const ticket: TicketRecord = {
  formInstanceId: "ticket_001",
  title: "实验室报修",
  status: "accepted",
  ownerUserScopeKey: "owner_001",
  ownerDeptScopeKey: "dept_lab",
  collegeScopeKey: "college_science",
};

describe("service-ticket permission helpers", () => {
  it("allows admins and hidden scope-key matches", () => {
    assert.equal(canViewTicket(ticket, user({ roleCodes: ["app_admin"] })), true);
    assert.equal(canViewTicket(ticket, user({ userId: "owner_001" })), true);
    assert.equal(canViewTicket(ticket, user({ collegeScopeKeys: ["college_science"] })), true);
    assert.equal(canViewTicket(ticket, user({ departmentIds: ["dept_lab"] })), true);
  });

  it("keeps action visibility tied to operation permission", () => {
    const allowed = getTicketUiPermissions(ticket, user({ departmentIds: ["dept_lab"] }));
    assert.equal(allowed.canView, true);
    assert.deepEqual(allowed.actions, ["start", "cancel"]);

    const denied = getTicketUiPermissions(ticket, user({ userId: "other" }));
    assert.equal(denied.canView, false);
    assert.deepEqual(denied.actions, []);
  });
});

function user(input: Partial<TicketOperator>): TicketOperator {
  return {
    userId: "u_001",
    roleCodes: [],
    departmentIds: [],
    ...input,
  };
}
