import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, fn, within } from "storybook/test";

import { agentsMocks } from "../../storybook/fixtures/agents";
import {
  contentRulesMocks,
  detectionsMocks,
} from "../../storybook/fixtures/content-rules";
import {
  analyzerMocks,
  changeSets,
  copilotPreview,
  effectivePolicy,
  policyDiff,
  policyVersions,
  policiesMocks,
  policyMocks,
  policyOptionsMocks,
  simulateMocks,
} from "../../storybook/fixtures/policies";
import {
  promptDetail,
  promptMocks,
  promptsMocks,
} from "../../storybook/fixtures/prompts";
import type { GraphQLMock } from "../../storybook/graphql";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import {
  ContentRulesConnected,
  DetectionsConnected,
  EffectivePolicyConnected,
  PoliciesConnected,
  PolicyChangesConnected,
  PolicyCopilotConnected,
  PolicyHierarchyConnected,
  PolicyDetailConnected,
  PolicyEditorConnected,
  PromptEditorConnected,
  PromptLibraryConnected,
  type Panel,
} from "./connected";
import { resolved } from "./story-helpers";
import type { PoliciesRestClient } from "./writes";

/** The area's REST calls, answered from fixtures. */
const rest: PoliciesRestClient = {
  history: async () => policyVersions,
  diff: async () => policyDiff,
  effective: async () => effectivePolicy,
  changes: async (status) =>
    changeSets.filter((c) => !status || c.status === status),
  transition: async (_id, to) => ({ status: to }),
  copilotStatus: async () => ({ enabled: true, reason: null }),
  copilotDraft: async () => copilotPreview.after,
  copilotDiff: async () => copilotPreview,
  copilotStage: async () => ({ change_id: "chg-7", status: "draft" }),
};

/**
 * The containers on the app's own hooks and documents, answered by the
 * foundation's MockLink: what each route will render, before any route
 * changes. Each story lists the operations its screen sends.
 */
const meta = {
  title: "Policies/Connected",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type S = StoryObj;

const mocks = (...lists: GraphQLMock[][]) => ({
  graphql: { mocks: lists.flat() },
});
const operator = capabilitiesOf("operator");

function Policies({ panel: initial = null }: { panel?: Panel }) {
  const [panel, setPanel] = React.useState<Panel>(initial);
  return (
    <ShellStory path="/policies" role="operator" defaultAssistantHidden>
      <PoliciesConnected
        capabilities={operator}
        panel={panel}
        onPanelChange={setPanel}
        onToggleEnabled={resolved()}
        onDuplicate={resolved()}
        onDelete={resolved()}
      />
    </ShellStory>
  );
}

export const PoliciesFromGetPolicies: S = {
  parameters: mocks(policiesMocks.full, policyOptionsMocks.full),
  render: () => <Policies />,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("link", {
        name: /^Monthly spend cap/,
      }),
    ).toBeInTheDocument();
  },
};

export const PoliciesLoading: S = {
  parameters: mocks(policiesMocks.loading, policyOptionsMocks.loading),
  render: () => <Policies />,
};

export const PoliciesError: S = {
  parameters: mocks(policiesMocks.error, policyOptionsMocks.full),
  render: () => <Policies />,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/went wrong/),
    ).toBeInTheDocument();
  },
};

export const AnalyzeFromPolicyAnalyzer: S = {
  parameters: mocks(
    policiesMocks.full,
    policyOptionsMocks.full,
    analyzerMocks.full,
  ),
  render: () => <Policies panel="analyze" />,
  play: async () => {
    await expect(
      await within(document.body).findByText(
        /Default rate limit, Legacy rate limit/,
      ),
    ).toBeInTheDocument();
  },
};

export const SimulatePanelOpen: S = {
  parameters: mocks(
    policiesMocks.full,
    policyOptionsMocks.full,
    simulateMocks.full,
  ),
  render: () => <Policies panel="simulate" />,
};

function Detail({ tab }: { tab: "overview" | "scope" }) {
  return (
    <ShellStory
      path="/policies/pol-budget-org"
      role="operator"
      defaultAssistantHidden
    >
      <PolicyDetailConnected
        capabilities={operator}
        id="pol-budget-org"
        tab={tab}
        onCompare={fn()}
        onAskAssistant={fn()}
        onToggleEnabled={resolved()}
        onDuplicate={resolved()}
        onDelete={resolved()}
      />
    </ShellStory>
  );
}

export const PolicyFromGetPolicy: S = {
  parameters: mocks(policyMocks.full),
  render: () => <Detail tab="overview" />,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("heading", {
        name: "Monthly spend cap",
      }),
    ).toBeInTheDocument();
  },
};

export const PolicyEffectFromSimulatePolicy: S = {
  parameters: mocks(policyMocks.full, simulateMocks.full),
  render: () => <Detail tab="scope" />,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("7.8%"),
    ).toBeInTheDocument();
  },
};

export const PolicyMissing: S = {
  parameters: mocks(policyMocks.missing),
  render: () => <Detail tab="overview" />,
};

export const EditorFromGetPolicyOptions: S = {
  parameters: mocks(policyOptionsMocks.full, agentsMocks.full),
  render: () => (
    <ShellStory path="/policies/create" role="operator" defaultAssistantHidden>
      <PolicyEditorConnected
        capabilities={operator}
        source="blank"
        onSourceChange={fn()}
        onDraftFromDocument={fn(async () => null)}
        onSubmit={resolved()}
      />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("combobox", { name: "Type" }),
    ).toBeInTheDocument();
  },
};

export const EditorEditing: S = {
  parameters: mocks(
    policyOptionsMocks.full,
    agentsMocks.full,
    policyMocks.full,
  ),
  render: () => (
    <ShellStory
      path="/policies/pol-budget-org/edit"
      role="operator"
      defaultAssistantHidden
    >
      <PolicyEditorConnected
        capabilities={operator}
        id="pol-budget-org"
        source="blank"
        onSourceChange={fn()}
        onDraftFromDocument={fn(async () => null)}
        onSubmit={resolved()}
      />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByDisplayValue("Monthly spend cap"),
    ).toBeInTheDocument();
  },
};

export const ContentRulesFromGetContentRules: S = {
  parameters: mocks(contentRulesMocks.full),
  render: () => (
    <ShellStory path="/content-rules" role="operator" defaultAssistantHidden>
      <ContentRulesConnected
        capabilities={operator}
        onTest={fn()}
        onToggleEnabled={resolved()}
        onDuplicate={resolved()}
        onDelete={resolved()}
        onSubmit={resolved()}
      />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("button", {
        name: "Cloud credentials",
      }),
    ).toBeInTheDocument();
  },
};

export const ContentRulesEmpty: S = {
  parameters: mocks(contentRulesMocks.empty),
  render: ContentRulesFromGetContentRules.render,
};

export const DetectionsFromViolationsAndScans: S = {
  parameters: mocks(detectionsMocks.full),
  render: () => (
    <ShellStory
      path="/content-rules/detections"
      role="operator"
      defaultAssistantHidden
    >
      <DetectionsConnected capabilities={operator} />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("AKIA****************"),
    ).toBeInTheDocument();
  },
};

export const DetectionsError: S = {
  parameters: mocks(detectionsMocks.error),
  render: DetectionsFromViolationsAndScans.render,
};

export const PromptsFromGetSystemPrompts: S = {
  parameters: mocks(promptsMocks.full),
  render: () => (
    <ShellStory path="/system-prompts" role="operator" defaultAssistantHidden>
      <PromptLibraryConnected
        capabilities={operator}
        onFork={resolved()}
        onDelete={resolved()}
      />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("link", {
        name: /^Support agent/,
      }),
    ).toBeInTheDocument();
  },
};

export const PromptFromGetSystemPrompt: S = {
  parameters: mocks(promptMocks.full, promptsMocks.full),
  render: () => (
    <ShellStory
      path="/system-prompts/p-support"
      role="operator"
      defaultAssistantHidden
    >
      <PromptEditorConnected
        capabilities={operator}
        mode="edit"
        id="p-support"
        onPickTemplate={fn(async () => promptDetail)}
        onSave={resolved()}
        onAnalyze={fn()}
      />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByDisplayValue("Support agent"),
    ).toBeInTheDocument();
  },
};

export const HierarchyFromGetPolicies: S = {
  parameters: mocks(policiesMocks.full),
  render: () => (
    <ShellStory
      path="/policies/hierarchy"
      role="operator"
      defaultAssistantHidden
    >
      <PolicyHierarchyConnected capabilities={operator} />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("Monthly spend cap");
  },
};

export const EffectiveFromAgentLink: S = {
  parameters: mocks(agentsMocks.full),
  render: () => (
    <ShellStory
      path="/policies/effective"
      role="operator"
      defaultAssistantHidden
    >
      <EffectivePolicyConnected
        capabilities={operator}
        initialAgent="support-bot"
        client={rest}
      />
    </ShellStory>
  ),
};

export const ChangesFromRest: S = {
  render: () => {
    function Changes() {
      const [open, setOpen] = React.useState<string | null>(null);
      return (
        <PolicyChangesConnected
          capabilities={capabilitiesOf("admin")}
          openId={open}
          onOpenChange={setOpen}
          client={rest}
        />
      );
    }
    return (
      <ShellStory path="/policies/changes" role="admin" defaultAssistantHidden>
        <Changes />
      </ShellStory>
    );
  },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText(changeSets[0].title);
  },
};

export const CopilotFromRest: S = {
  parameters: mocks(policiesMocks.full),
  render: () => (
    <ShellStory path="/policies/copilot" role="operator" defaultAssistantHidden>
      <PolicyCopilotConnected
        capabilities={operator}
        initialPolicyId="pol-budget-org"
        client={rest}
      />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("button", {
      name: "Preview the draft",
    });
  },
};

export const CopilotOff: S = {
  parameters: mocks(policiesMocks.full),
  render: () => (
    <ShellStory path="/policies/copilot" role="operator" defaultAssistantHidden>
      <PolicyCopilotConnected
        capabilities={operator}
        client={{
          ...rest,
          copilotStatus: async () => ({
            enabled: false,
            reason: "Disabled by tenant policy",
          }),
        }}
      />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("Disabled by tenant policy");
  },
};
