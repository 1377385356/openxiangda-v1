import { describe, expect, it } from "vitest"

import { mergeAdminListPreference } from "./preferences"

describe("mergeAdminListPreference", () => {
  const columns = [
    { key: "name", title: "名称", sortable: true },
    { key: "secret", title: "敏感字段", sortable: true },
    { key: "status", title: "状态", sortable: true, locked: true },
  ]
  const searchFields = [
    { key: "name", label: "名称" },
    { key: "status", label: "状态", locked: true },
  ]

  it("applies permission restrictions before user and locked settings", () => {
    const result = mergeAdminListPreference({
      version: 2,
      columns,
      searchFields,
      allowedColumnKeys: ["name", "status"],
      locked: {
        visibleColumnKeys: ["status"],
        hiddenColumnKeys: ["name"],
        sorts: [{ field: "status", direction: "descend" }],
      },
      user: {
        version: 1,
        columns: [
          { key: "secret", visible: true },
          { key: "name", visible: true, width: 220 },
          { key: "status", visible: false },
        ],
        sorts: [{ field: "secret", direction: "ascend" }],
      },
    })

    expect(result.version).toBe(2)
    expect(result.columns?.map((column) => column.key)).toEqual([
      "name",
      "status",
    ])
    expect(result.columns?.find((column) => column.key === "name")).toMatchObject(
      { visible: false, width: 220 },
    )
    expect(
      result.columns?.find((column) => column.key === "status"),
    ).toMatchObject({ visible: true })
    expect(result.sorts).toEqual([
      { field: "status", direction: "descend" },
    ])
  })

  it("drops deleted fields and invalid historical sorts after an upgrade", () => {
    const result = mergeAdminListPreference({
      version: 3,
      columns,
      searchFields,
      defaultSorts: [{ field: "name", direction: "ascend" }],
      user: {
        version: 1,
        columns: [{ key: "removed", visible: true }],
        searches: [{ key: "removed", visible: true }],
        sorts: [{ field: "removed", direction: "descend" }],
      },
    })

    expect(result.columns?.some((column) => column.key === "removed")).toBe(
      false,
    )
    expect(result.searches?.some((field) => field.key === "removed")).toBe(
      false,
    )
    expect(result.sorts).toEqual([
      { field: "name", direction: "ascend" },
    ])
  })
})
