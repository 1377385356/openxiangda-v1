import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertTicketTransition,
  getAvailableTicketActions,
  getNextTicketStatus,
} from "./state-machine";
import type { TicketOperator, TicketRecord } from "./types";

const operator: TicketOperator = {
  userId: "u_001",
  roleCodes: ["ticket_operator"],
  departmentIds: ["dept_lab"],
};

const ticket: TicketRecord = {
  formInstanceId: "ticket_001",
  title: "设备故障",
  status: "new",
  ownerDeptScopeKey: "dept_lab",
};

describe("service-ticket state machine", () => {
  it("returns deterministic next status", () => {
    assert.equal(getNextTicketStatus("new", "accept"), "accepted");
    assert.equal(getNextTicketStatus("resolved", "close"), "closed");
    assert.equal(getNextTicketStatus("closed", "start"), null);
  });

  it("filters available actions by status and operator permission", () => {
    assert.deepEqual(getAvailableTicketActions(ticket, operator), [
      "accept",
      "cancel",
    ]);

    assert.deepEqual(
      getAvailableTicketActions(ticket, {
        userId: "u_002",
        roleCodes: ["student"],
        departmentIds: ["dept_other"],
      }),
      [],
    );
  });

  it("throws clear errors for unauthorized or invalid transitions", () => {
    assert.throws(
      () =>
        assertTicketTransition(ticket, "accept", {
          userId: "u_002",
          roleCodes: [],
          departmentIds: [],
        }),
      /无权操作/,
    );

    assert.throws(
      () => assertTicketTransition({ ...ticket, status: "closed" }, "start", operator),
      /不允许执行动作/,
    );
  });
});
