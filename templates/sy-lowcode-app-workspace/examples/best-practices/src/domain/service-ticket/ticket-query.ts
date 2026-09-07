import type { TicketSearchState } from "./types";

export type FilterLogic = "AND" | "OR";

export interface FilterRule {
  id: string;
  key: string;
  componentName: string;
  operator: string;
  value: unknown;
}

export interface FilterGroup {
  id: string;
  logic: FilterLogic;
  rules: FilterRule[];
  conditions: FilterGroup[];
}

const rule = (
  key: string,
  componentName: string,
  operator: string,
  value: unknown,
): FilterRule => ({
  id: `${key}_${operator}`,
  key,
  componentName,
  operator,
  value,
});

export function buildTicketFilterGroup(search: TicketSearchState): FilterGroup {
  const group: FilterGroup = {
    id: "ticket_filters",
    logic: "AND",
    rules: [],
    conditions: [],
  };

  if (search.statuses?.length) {
    group.rules.push(rule("status", "SelectField", "IN", search.statuses));
  }
  if (search.priorities?.length) {
    group.rules.push(rule("priority", "SelectField", "IN", search.priorities));
  }
  if (search.ownerUserScopeKey) {
    group.rules.push(rule("ownerUserScopeKey", "TextField", "EQ", search.ownerUserScopeKey));
  }
  if (search.ownerDeptScopeKey) {
    group.rules.push(rule("ownerDeptScopeKey", "TextField", "EQ", search.ownerDeptScopeKey));
  }
  if (search.collegeScopeKey) {
    group.rules.push(rule("collegeScopeKey", "TextField", "EQ", search.collegeScopeKey));
  }
  if (search.classScopeKey) {
    group.rules.push(rule("classScopeKey", "TextField", "EQ", search.classScopeKey));
  }
  if (search.keyword?.trim()) {
    const keyword = search.keyword.trim();
    group.conditions.push({
      id: "keyword_or",
      logic: "OR",
      rules: [
        rule("title", "TextField", "CONTAINS", keyword),
        rule("description", "TextAreaField", "CONTAINS", keyword),
      ],
      conditions: [],
    });
  }

  return group;
}
