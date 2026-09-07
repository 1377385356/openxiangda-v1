import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildTicketFilterGroup } from "./ticket-query";

describe("service-ticket query builder", () => {
  it("builds structured filters instead of browser-side filtering", () => {
    const group = buildTicketFilterGroup({
      keyword: "离心机",
      statuses: ["new", "processing"],
      priorities: ["urgent"],
      collegeScopeKey: "college_science",
    });

    assert.equal(group.logic, "AND");
    assert.deepEqual(
      group.rules.map((item) => item.key),
      ["status", "priority", "collegeScopeKey"],
    );
    assert.equal(group.conditions.length, 1);
    assert.equal(group.conditions[0]?.logic, "OR");
    assert.deepEqual(
      group.conditions[0]?.rules.map((item) => item.key),
      ["title", "description"],
    );
  });

  it("omits empty search fields", () => {
    const group = buildTicketFilterGroup({ keyword: "   " });

    assert.deepEqual(group.rules, []);
    assert.deepEqual(group.conditions, []);
  });
});
