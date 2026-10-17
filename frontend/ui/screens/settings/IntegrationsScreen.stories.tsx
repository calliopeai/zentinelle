import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import {
  NARROW,
  astroliftInstalls,
  enrollmentCode,
  longAstroliftInstalls,
} from "../../storybook/fixtures/settings";
import { ShellStory } from "../../storybook/ShellStory";
import { IntegrationsScreen } from "./IntegrationsScreen";
import { SettingsForbiddenScreen } from "./SettingsForbiddenScreen";

const meta = {
  title: "Settings/Screens/Integrations",
  component: IntegrationsScreen,
  parameters: { layout: "fullscreen" },
  args: {
    installs: { data: astroliftInstalls },
    zentinelleUrl: "https://zentinelle.acme.example",
    onGenerateCode: fn(async () => {}),
    code: null,
    onCloseCode: fn(),
    onDisconnect: fn(async () => {}),
    onRevokeCluster: fn(async () => {}),
  },
  render: (args) => (
    <ShellStory path="/settings/astrolift" defaultAssistantHidden>
      <IntegrationsScreen {...args} />
    </ShellStory>
  ),
} satisfies Meta<typeof IntegrationsScreen>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Connected: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Integrations" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("eks-prod-use1")).toBeInTheDocument();
    await expect(
      canvas.getByText("No clusters registered yet"),
    ).toBeInTheDocument();
  },
};

export const Empty: Story = { args: { installs: { data: [] } } };

export const Loading: Story = {
  args: { installs: { data: null, loading: true } },
};

export const Failed: Story = {
  args: {
    installs: {
      data: null,
      error: { message: "Unable to load Astrolift installs" },
      retry: fn(),
    },
  },
};

export const LongData: Story = {
  args: { installs: { data: longAstroliftInstalls } },
};

export const Narrow: Story = { ...NARROW };

export const CodeGenerated: Story = { args: { code: enrollmentCode } };

export const GenerateFails: Story = {
  args: {
    onGenerateCode: fn(async () => {
      throw new Error("Enrollment is turned off on this Zentinelle AI.");
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Generate enrollment code" }),
    );
    await expect(
      await canvas.findByText(
        "Enrollment is turned off on this Zentinelle AI.",
      ),
    ).toBeInTheDocument();
  },
};

export const Disconnects: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "Disconnect astrolift-prod",
      }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await body.findByRole("button", { name: "Disconnect" }),
    );
    await expect(args.onDisconnect).toHaveBeenCalledWith(astroliftInstalls[0]);
  },
};

export const Viewer: Story = {
  render: () => (
    <ShellStory path="/settings/astrolift" role="viewer" defaultAssistantHidden>
      <SettingsForbiddenScreen title="Integrations" />
    </ShellStory>
  ),
};
