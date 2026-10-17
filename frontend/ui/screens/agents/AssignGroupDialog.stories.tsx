import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";

import { groups } from "../../storybook/fixtures/agents";
import { AssignGroupDialog } from "./AssignGroupDialog";

/** Put an agent in a group; GetAgentGroups fills the choice. */
const meta = {
  title: "Screens/Agents/Assign group dialog",
  component: AssignGroupDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    agentName: "support-bot",
    currentGroupId: null,
    groups: groups.agentGroups,
    onAssign: fn(async () => {}),
  },
} satisfies Meta<typeof AssignGroupDialog>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args }) => {
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: /Group/ }),
      "grp-2",
    );
    await userEvent.click(screen.getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(args.onAssign).toHaveBeenCalledWith("grp-2"));
  },
};

/** The current group is preselected, and assigning it again is not offered. */
export const AlreadyInGroup: Story = { args: { currentGroupId: "grp-1" } };

export const Loading: Story = { args: { groups: null } };

export const NoGroups: Story = { args: { groups: [] } };

export const Refused: Story = {
  args: {
    onAssign: fn(async () =>
      Promise.reject(new Error("The group belongs to another organization.")),
    ),
  },
  play: async () => {
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: /Group/ }),
      "grp-3",
    );
    await userEvent.click(screen.getByRole("button", { name: "Assign" }));
    await expect(await screen.findByRole("alert")).toHaveTextContent(
      "another organization",
    );
  },
};

export const LongName: Story = {
  args: {
    agentName:
      "Customer support escalation router for the EMEA enterprise tier, second generation",
  },
};
