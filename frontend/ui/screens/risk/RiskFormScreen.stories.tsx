import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import type { Role } from "../../product";
import { NARROW, longRisk, risks } from "../../storybook/fixtures/risk";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import { RiskFormScreen, type RiskFormScreenProps } from "./RiskFormScreen";

/** New risk (`CreateRisk`) and Edit (`UpdateRisk`): one form. */
const meta = {
  title: "Risk & compliance/Screens/Risk form",
  parameters: { layout: "fullscreen" },
  args: { onSubmit: fn(async () => []) },
} satisfies Meta<RiskFormScreenProps>;
export default meta;
type Story = StoryObj<RiskFormScreenProps>;

function Form({
  role = "operator",
  path = "/risks/create",
  ...props
}: RiskFormScreenProps & { role?: Role; path?: string }) {
  return (
    <ShellStory path={path} role={role} defaultAssistantHidden>
      <RiskFormScreen {...props} capabilities={capabilitiesOf(role)} />
    </ShellStory>
  );
}

export const New: Story = {
  render: (args) => <Form {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Create risk" }));
    await expect(canvas.getByText("A risk needs a name.")).toBeInTheDocument();
    await expect(args.onSubmit).not.toHaveBeenCalled();
    await userEvent.type(
      canvas.getByLabelText(/^Name/),
      "Agent emails customers without approval",
    );
    await userEvent.type(
      canvas.getByLabelText(/^Description/),
      "The outreach agent can send mail directly.",
    );
    await userEvent.selectOptions(canvas.getByLabelText("Likelihood"), "5");
    await userEvent.click(canvas.getByRole("button", { name: "Create risk" }));
    await expect(args.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Agent emails customers without approval",
        likelihood: 5,
        impact: 3,
        residualLikelihood: null,
      }),
    );
  },
};

export const Edit: Story = {
  render: (args) => <Form {...args} risk={risks[0]} path="/risks/r-01" />,
};

export const ServerRejects: Story = {
  args: { onSubmit: fn(async () => ["A risk with this name already exists."]) },
  render: (args) => <Form {...args} risk={risks[0]} path="/risks/r-01" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(
      await canvas.findByText("A risk with this name already exists."),
    ).toBeInTheDocument();
  },
};

export const Viewer: Story = {
  render: (args) => <Form {...args} role="viewer" />,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText("Changing risks needs the operator role"),
    ).toBeInTheDocument();
  },
};

export const LongData: Story = {
  render: (args) => <Form {...args} risk={longRisk} path="/risks/r-99" />,
};

export const Narrow: Story = {
  ...NARROW,
  render: (args) => <Form {...args} />,
};
