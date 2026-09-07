export interface WorkbenchState {
  selectedMode: "plan" | "preview" | "publish";
  draftName: string;
  dirty: boolean;
}

export type WorkbenchAction =
  | { type: "selectMode"; mode: WorkbenchState["selectedMode"] }
  | { type: "rename"; name: string }
  | { type: "saved" };

export const initialWorkbenchState: WorkbenchState = {
  selectedMode: "plan",
  draftName: "运营方案",
  dirty: false,
};

export function workbenchReducer(
  state: WorkbenchState,
  action: WorkbenchAction,
): WorkbenchState {
  if (action.type === "selectMode") {
    return { ...state, selectedMode: action.mode };
  }
  if (action.type === "rename") {
    return { ...state, draftName: action.name, dirty: true };
  }
  return { ...state, dirty: false };
}
