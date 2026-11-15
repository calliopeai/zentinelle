import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";

import { copilotPreview, policyList } from "../../storybook/fixtures/policies";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import {
  PolicyCopilotScreen,
  type PolicyCopilotScreenProps,
} from "./PolicyCopilotScreen";
import { NARROW } from "./story-helpers";

function Story({
  role = "operator",
  ...props
}: Partial<PolicyCopilotScreenProps> & {
  role?: "viewer" | "operator" | "admin";
}) {
  return (
    <ShellStory path="/policies/copilot" role={role} defaultAssistantHidden>
      <PolicyCopilotScreen
        capabilities={capabilitiesOf(role)}
        status="enabled"
        request="Lower the monthly spend cap to $2,500"
        onRequestChange={fn()}
        policyId="pol-budget-org"
        onPolicyIdChange={fn()}
        policies={policyList.map((p) => ({ id: p.id, name: p.name }))}
        onPreview={fn()}
        previewing={false}
        preview={null}
        onStage={fn()}
        staging={false}
        staged={null}
        onTransition={fn()}
        {...props}
      />
    </ShellStory>
  );
}

const meta = {
  title: "Policies/Copilot",
  component: Story,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Story>;
export default meta;
type S = StoryObj<typeof meta>;

export const Ask: S = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("button", { name: "Preview the draft" }),
    ).toBeEnabled();
  },
};

export const Loading: S = { args: { status: "loading" } };

export const Off: S = {
  args: { status: "disabled", statusReason: null },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("The policy copilot is off");
  },
};

export const OffForAdmin: S = { args: { status: "disabled", role: "admin" } };

export const StatusFailed: S = {
  args: { status: "error", error: { message: "Service unavailable" } },
};

export const Viewer: S = { args: { role: "viewer" } };

export const Previewing: S = { args: { previewing: true } };

export const Preview: S = {
  args: { preview: copilotPreview },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("Changes: config.");
  },
};

export const NewPolicy: S = {
  args: {
    policyId: "",
    preview: { ...copilotPreview, policy_id: null, before: {} },
  },
};

export const Failed: S = {
  args: { error: { message: "Configure an active provider key" } },
};

export const Staged: S = {
  args: {
    preview: copilotPreview,
    staged: { id: "chg-7", status: "draft" },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("button", { name: "Validate" }),
    ).toBeEnabled();
  },
};

export const StagedNeedsAdmin: S = {
  args: { preview: copilotPreview, staged: { id: "chg-7", status: "staged" } },
};

export const Narrow: S = { args: { preview: copilotPreview }, ...NARROW };
