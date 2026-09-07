import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildConditionDataPermission,
  buildRoleCode,
  deriveRoleScopeKeys,
} from "./permissions";

describe("role-governance permission helpers", () => {
  it("normalizes dynamic role codes", () => {
    assert.equal(buildRoleCode({ roleCode: " College Admin " }), "college_admin");
    assert.equal(buildRoleCode({ roleCode: "class  advisor" }), "class_advisor");
  });

  it("derives hidden scope keys from maintainable select values", () => {
    assert.deepEqual(
      deriveRoleScopeKeys({
        collegeScope: { label: "理学院", value: "college_science" },
        classScope: { label: "2026 级一班", value: "class_2026_01" },
      }),
      {
        collegeScopeKey: "college_science",
        classScopeKey: "class_2026_01",
      },
    );
  });

  it("builds condition-based data permissions from hidden scope keys", () => {
    const permission = buildConditionDataPermission({
      collegeScopeKey: "college_science",
      classScopeKey: "",
      ownerDeptScopeKey: "dept_lab",
    });

    assert.equal(permission.type, "condition");
    assert.deepEqual(permission.condition.rules, [
      {
        field: "collegeScopeKey",
        componentType: "Text",
        op: "=",
        value: "college_science",
      },
      {
        field: "ownerDeptScopeKey",
        componentType: "Text",
        op: "=",
        value: "dept_lab",
      },
    ]);
  });
});
