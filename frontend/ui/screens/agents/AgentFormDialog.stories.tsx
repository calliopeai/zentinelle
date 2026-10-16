import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";

import { AgentFormDialog, type AgentFormDialogProps } from "./AgentFormDialog";

const registered: AgentFormDialogProps["onSubmit"] = async () => ({
  apiKey: "znt_live_91ab4c2e7d0f6a3b8e5c1d9f2a7b4e6c",
});
const saved: AgentFormDialogProps["onSubmit"] = async () => undefined;

/** Register an agent and show its key once, or edit one. */
const meta = {
  title: "Screens/Agents/Agent form dialog",
  component: AgentFormDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    mode: "register",
    onSubmit: fn(registered),
    onCopy: fn(),
  },
} satisfies Meta<typeof AgentFormDialog>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Register: Story = {};

/** The form refuses what the server would: a bad slug, no type, metadata that is not an object. */
export const Invalid: Story = {
  play: async ({ args }) => {
    await userEvent.type(
      await screen.findByRole("textbox", { name: /Name/ }),
      "x",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /Agent id/ }),
      "Not A Slug",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /Metadata/ }),
      "[[1]",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Register agent" }),
    );
    await expect(screen.getByText(/at least 2 characters/)).toBeInTheDocument();
    await expect(screen.getByText(/Lowercase letters/)).toBeInTheDocument();
    await expect(
      screen.getByText(/Choose the agent's type/),
    ).toBeInTheDocument();
    await expect(
      screen.getByText(/Metadata is a JSON object/),
    ).toBeInTheDocument();
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

/** After registering, the key is shown once with a copy button. */
export const KeyRevealed: Story = {
  play: async ({ args }) => {
    await userEvent.type(
      await screen.findByRole("textbox", { name: /Name/ }),
      "research-bot",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /Agent id/ }),
      "research-bot",
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /Type/ }),
      "langgraph",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /Capabilities/ }),
      "chat, tools",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Register agent" }),
    );
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith({
        name: "research-bot",
        agentId: "research-bot",
        agentType: "langgraph",
        capabilities: ["chat", "tools"],
        metadata: null,
      }),
    );
    await expect(
      await screen.findByText("znt_live_91ab4c2e7d0f6a3b8e5c1d9f2a7b4e6c"),
    ).toBeInTheDocument();
  },
};

/** The server refused (success false): its message shows and the dialog stays open. */
export const Refused: Story = {
  args: {
    onSubmit: fn<AgentFormDialogProps["onSubmit"]>(async () => {
      throw new Error("An agent with this id already exists.");
    }),
  },
  play: async () => {
    await userEvent.type(
      await screen.findByRole("textbox", { name: /Name/ }),
      "support-bot",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /Agent id/ }),
      "support-bot",
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /Type/ }),
      "chat",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Register agent" }),
    );
    await expect(await screen.findByRole("alert")).toHaveTextContent(
      "already exists",
    );
  },
};

export const Edit: Story = {
  args: {
    mode: "edit",
    onSubmit: fn(saved),
    initial: {
      name: "support-bot",
      agentId: "support-bot",
      agentType: "langgraph",
      capabilities: ["chat", "tools"],
      metadata: {
        owner_id: "dana@example.com",
        taxonomy: ["function:customer_service"],
      },
    },
  },
  play: async () => {
    await expect(
      await screen.findByRole("textbox", { name: /Agent id/ }),
    ).toBeDisabled();
  },
};

export const EditLongName: Story = {
  args: {
    mode: "edit",
    initial: {
      name: "Customer support escalation router for the EMEA enterprise tier, second generation",
      agentId:
        "customer-support-escalation-router-for-the-emea-enterprise-tier",
      agentType: "ms-agent-framework",
    },
  },
};
