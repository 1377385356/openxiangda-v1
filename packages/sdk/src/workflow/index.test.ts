import { describe, expect, it } from "vitest"

import { defineWorkflow, flow as workflowFlow } from "./index"

describe("workflow DSL", () => {
  it("compiles semantic approval actions and function_call nodes", () => {
    const workflow = defineWorkflow({
      build(flow) {
        const start = flow.start()
        const approval = flow.approval("manager", {
          label: "主管审批",
          actions: [
            flow.action.approve("通过"),
            flow.action.reject("驳回"),
            flow.action.transfer(),
            flow.action.return(),
          ],
          returnPolicy: {
            scopeType: "previous_all",
            resubmitMode: "resume_current",
          },
          fieldPermissions: [
            { fieldId: "amount", fieldBehavior: "READONLY" },
          ],
        })
        const functionNode = flow.functionCall("sync_budget", {
          functionCode: "sync_budget",
          input: { amount: "{{form.amount}}" },
          saveResponseTo: "budgetResult",
        })
        const end = flow.end()
        flow.sequence(start, approval, functionNode, end)
      },
    })

    const compiled = workflow.compile()
    const approval = compiled.definitionJson.nodes.find(
      (node) => node.id === "manager",
    )
    const functionNode = compiled.definitionJson.nodes.find(
      (node) => node.id === "sync_budget",
    )

    expect(functionNode).toMatchObject({
      type: "function_call",
      data: {
        functionCode: "sync_budget",
        saveResponseTo: "budgetResult",
      },
    })
    expect(approval?.data.actions.map((action: any) => action.action)).toEqual([
      "agree",
      "rejected",
      "transfer",
      "return",
    ])
    expect(approval?.data.returnConfig).toMatchObject({
      enabled: true,
      scopeType: "previous_all",
      resubmitMode: "resume_current",
    })
    expect(compiled.definitionJson.flowConfig.manager).toEqual([
      { fieldId: "amount", fieldBehavior: "READONLY" },
    ])
  })

  it("adds hidden controller, else, and converge nodes for condition branches", () => {
    const workflow = defineWorkflow({
      build(flow) {
        const start = flow.start()
        const approve = flow.approval("approve", { label: "审批" })
        const branch = flow.conditionBranches("amount_branch", [
          {
            id: "large",
            label: "大额",
            condition: {
              ruleType: "group",
              condition: "AND",
              rules: [{ fieldId: "amount", operator: "GT", value: 1000 }],
            },
            nodes: [approve],
          },
        ])
        const end = flow.end()
        flow.sequence(start, branch.entry)
        flow.sequence(branch.converge, end)
      },
    })

    const compiled = workflow.compile()
    const ids = compiled.definitionJson.nodes.map((node) => node.id)

    expect(ids).toContain("amount_branch_controller")
    expect(ids).toContain("amount_branch_converge")
    expect(ids).toContain("amount_branch_else")
    expect(
      compiled.definitionJson.nodes.find(
        (node) => node.id === "amount_branch_controller",
      )?.data,
    ).toMatchObject({
      branchType: "condition_controller",
      branchId: "amount_branch",
      branchControllerId: "amount_branch_controller",
      convergeNodeId: "amount_branch_converge",
    })
    expect(
      compiled.definitionJson.nodes.find(
        (node) => node.id === "amount_branch_converge",
      )?.data,
    ).toMatchObject({
      branchType: "converge",
      branchId: "amount_branch",
      branchControllerId: "amount_branch_controller",
      convergeNodeId: "amount_branch_converge",
    })
    expect(
      compiled.definitionJson.nodes.find(
        (node) => node.id === "amount_branch_large",
      )?.data.condition.rules[0],
    ).toMatchObject({
      id: "amount",
      fieldId: "amount",
      opCode: "GT",
      operator: "GT",
    })
    expect(
      compiled.definitionJson.nodes.find(
        (node) => node.id === "amount_branch_else",
      )?.data.isElse,
    ).toBe(true)
    expect(compiled.definitionJson.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "amount_branch_else",
          target: "amount_branch_converge",
        }),
      ]),
    )
  })

  it("emits runtime-compatible metadata for parallel branches", () => {
    const workflow = defineWorkflow({
      build(flow) {
        const reviewer = flow.approval("reviewer", { label: "评审" })
        const finance = flow.approval("finance", { label: "财务" })
        const branch = flow.parallel("parallel_review", [
          { id: "reviewer", nodes: [reviewer] },
          { id: "finance", nodes: [finance] },
        ])
        const start = flow.start()
        const end = flow.end()
        flow.sequence(start, branch.entry)
        flow.sequence(branch.converge, end)
      },
    })

    const compiled = workflow.compile()
    const entry = compiled.definitionJson.nodes.find(
      (node) => node.id === "parallel_review_branch",
    )
    const converge = compiled.definitionJson.nodes.find(
      (node) => node.id === "parallel_review_converge",
    )

    expect(entry?.data).toMatchObject({
      branchType: "parallel",
      branchId: "parallel_review",
      branchControllerId: "parallel_review_branch",
      convergeNodeId: "parallel_review_converge",
    })
    expect(converge?.data).toMatchObject({
      branchType: "converge",
      branchId: "parallel_review",
      branchControllerId: "parallel_review_branch",
      convergeNodeId: "parallel_review_converge",
    })
  })

  it("exports flow.define for declarative AI-authored workflows", () => {
    const workflow = workflowFlow.define({
      id: "declarative-smoke",
      name: "声明式流程",
      formUuid: "FORM_UUID",
      nodes: [
        workflowFlow.start("start"),
        workflowFlow.approval("manager", {
          label: "主管审批",
          assignees: [workflowFlow.assignee.initiator()],
          actions: [
            workflowFlow.action.approve("通过"),
            workflowFlow.action.returnToInitiator(),
          ],
          fieldPermissions: {
            amount: "readonly",
            secret: "hidden",
          },
        }),
        workflowFlow.branch("amount_branch", {
          label: "金额分支",
          branches: [
            {
              id: "large",
              label: "大额",
              condition: {
                ruleType: "group",
                condition: "AND",
                rules: [{ fieldId: "amount", operator: "GT", value: 1000 }],
              },
              next: "notify",
            },
            { id: "else", label: "其他", else: true, next: "sync_budget" },
          ],
        }),
        workflowFlow.notification("notify", {
          label: "通知发起人",
          title: "流程通知",
          content: "流程进入下一步",
          recipientType: "user",
          recipients: [workflowFlow.assignee.initiator()],
        }),
        workflowFlow.functionCall("sync_budget", {
          functionName: "sync_budget",
          input: { amount: "${amount}" },
        }),
        workflowFlow.end("end"),
      ],
      edges: [
        workflowFlow.connect("start", "manager"),
        workflowFlow.connect("manager", "amount_branch"),
        workflowFlow.connect("notify", "end"),
        workflowFlow.connect("sync_budget", "end"),
      ],
    })

    const compiled = workflow.compile()
    const manager = compiled.definitionJson.nodes.find((node) => node.id === "manager")
    const ids = compiled.definitionJson.nodes.map((node) => node.id)

    expect(manager?.data.approverType).toBe("ext_target_approval")
    expect(manager?.data.approvals).toEqual(["originator"])
    expect(manager?.data.actions.map((action: any) => action.action)).toEqual([
      "agree",
      "return",
    ])
    expect(manager?.data.returnConfig).toMatchObject({
      enabled: true,
      scopeType: "initiator",
      resubmitMode: "replay",
      allowOriginatorReturn: true,
    })
    expect(compiled.definitionJson.flowConfig.manager).toEqual([
      { fieldId: "amount", fieldBehavior: "READONLY" },
      { fieldId: "secret", fieldBehavior: "HIDDEN" },
    ])
    expect(ids).toEqual(
      expect.arrayContaining([
        "amount_branch",
        "amount_branch_large",
        "amount_branch_else",
        "notify",
        "sync_budget",
      ]),
    )
    expect(
      compiled.definitionJson.nodes.find((node) => node.id === "amount_branch")
        ?.data,
    ).toMatchObject({
      branchType: "condition_controller",
      branchId: "amount_branch",
      branchControllerId: "amount_branch",
    })
    expect(
      compiled.definitionJson.nodes.find(
        (node) => node.id === "amount_branch_large",
      )?.data.condition.rules[0],
    ).toMatchObject({
      id: "amount",
      fieldId: "amount",
      opCode: "GT",
      operator: "GT",
    })
    expect(compiled.definitionJson.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "amount_branch_large", target: "notify" }),
        expect.objectContaining({ source: "amount_branch_else", target: "sync_budget" }),
      ]),
    )
  })

  it("fails fast for workflow nodes that the engine requires to be explicit", () => {
    const workflow = defineWorkflow({
      build(flow) {
        flow.sequence(
          flow.start(),
          flow.callbackWait("wait_external_callback", {
            label: "等待外部回调",
          }),
          flow.workNotification("notify", {
            label: "通知",
          }),
          flow.end(),
        )
      },
    })

    expect(() => workflow.compile()).toThrow(
      /callback_wait node wait_external_callback requires eventCode/,
    )
    expect(() => workflow.compile()).toThrow(
      /work_notification node notify requires title, content, and recipientType/,
    )
  })

  it("infers originator return config from semantic return actions", () => {
    const workflow = defineWorkflow({
      build(flow) {
        const start = flow.start()
        const manager = flow.approval("manager", {
          label: "主管审批",
          actions: [
            flow.action.approve("通过"),
            flow.action.returnToInitiator("退回发起人"),
          ],
        })
        const end = flow.end()
        flow.sequence(start, manager, end)
      },
    })

    const compiled = workflow.compile()
    const manager = compiled.definitionJson.nodes.find((node) => node.id === "manager")

    expect(manager?.data.returnConfig).toMatchObject({
      enabled: true,
      scopeType: "initiator",
      resubmitMode: "replay",
      allowOriginatorReturn: true,
    })
  })

  it("keeps explicit initiator return policy in compiled approval nodes", () => {
    const workflow = defineWorkflow({
      build(flow) {
        const start = flow.start()
        const manager = flow.approval("manager", {
          label: "主管审批",
          actions: [flow.action.approve("通过"), flow.action.return("退回")],
          returnPolicy: {
            scopeType: "initiator",
            resubmitMode: "resume_current",
          },
        })
        const end = flow.end()
        flow.sequence(start, manager, end)
      },
    })

    const compiled = workflow.compile()
    const manager = compiled.definitionJson.nodes.find((node) => node.id === "manager")

    expect(manager?.data.returnConfig).toMatchObject({
      enabled: true,
      scopeType: "initiator",
      resubmitMode: "resume_current",
    })
  })
})
