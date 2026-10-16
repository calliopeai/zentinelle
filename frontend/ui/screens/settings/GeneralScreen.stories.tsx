import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { useMyOrganization } from "@/graphql/settings/hooks";

import {
  NARROW,
  bareOrganization,
  defaultRuntime,
  longOrganization,
  longRuntime,
  organization,
  organizationMocks,
  runtime,
} from "../../storybook/fixtures/settings";
import { ShellStory } from "../../storybook/ShellStory";
import {
  GeneralScreen,
  type GeneralScreenProps,
  type GeneralTab,
} from "./GeneralScreen";
import { SettingsForbiddenScreen } from "./SettingsForbiddenScreen";

const actions = {
  onSaveOrganization: fn(async () => {}),
  runtimeActions: {
    onStage: fn(async () => {}),
    onTransition: fn(async () => {}),
    onRollback: fn(async () => {}),
  },
};

const ready: GeneralScreenProps = {
  tab: "organization",
  organization: { data: organization.myOrganization },
  runtime: { data: runtime },
  ...actions,
};

const meta = {
  title: "Settings/Screens/General",
  component: GeneralScreen,
  parameters: { layout: "fullscreen" },
  args: ready,
  render: (args) => (
    <ShellStory path="/settings" defaultAssistantHidden>
      <GeneralScreen {...args} />
    </ShellStory>
  ),
} satisfies Meta<typeof GeneralScreen>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Organization: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "General" }),
    ).toBeInTheDocument();
    for (const name of [
      "Organization",
      "Enforcement",
      "Notifications",
      "Runtime",
      "Bootstrap tokens",
    ]) {
      await expect(canvas.getByRole("link", { name })).toBeInTheDocument();
    }
  },
};

export const Enforcement: Story = { args: { tab: "enforcement" } };

export const Notifications: Story = { args: { tab: "notifications" } };

export const Runtime: Story = {
  args: { tab: "runtime" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Waiting for approval")).toBeInTheDocument();
    await expect(canvas.getByText("Revision 7 in effect")).toBeInTheDocument();
  },
};

export const RuntimeOnDefaults: Story = {
  args: { tab: "runtime", runtime: { data: defaultRuntime } },
};

export const BootstrapTokens: Story = { args: { tab: "bootstrap" } };

export const FreshOrganization: Story = {
  args: {
    tab: "notifications",
    organization: { data: bareOrganization.myOrganization },
  },
};

export const Loading: Story = {
  args: { organization: { data: null, loading: true } },
};

export const RuntimeLoading: Story = {
  args: { tab: "runtime", runtime: { data: null, loading: true } },
};

export const Failed: Story = {
  args: {
    organization: {
      data: null,
      error: { message: "Network error: the backend did not answer." },
      retry: fn(),
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText("Could not load organization settings"),
    ).toBeInTheDocument();
  },
};

export const RuntimeFailed: Story = {
  args: {
    tab: "runtime",
    runtime: {
      data: null,
      error: { message: "403: admin role required" },
      retry: fn(),
    },
  },
};

export const LongData: Story = {
  args: {
    organization: { data: longOrganization.myOrganization },
    runtime: { data: longRuntime },
  },
};

export const LongRuntime: Story = {
  args: { tab: "runtime", runtime: { data: longRuntime } },
};

export const Narrow: Story = { ...NARROW };

export const NarrowRuntime: Story = { ...NARROW, args: { tab: "runtime" } };

export const Viewer: Story = {
  render: () => (
    <ShellStory path="/settings" role="viewer" defaultAssistantHidden>
      <SettingsForbiddenScreen title="General" />
    </ShellStory>
  ),
};

/** The route's wiring: GetMyOrganization through the app's own hook, answered by the story mocks. */
function Connected({ tab }: { tab: GeneralTab }) {
  const { organization: org, loading, error, refetch } = useMyOrganization();
  return (
    <GeneralScreen
      tab={tab}
      organization={{ data: org, loading, error, retry: () => void refetch() }}
      runtime={{ data: null, loading: true }}
      {...actions}
    />
  );
}

export const ConnectedToGetMyOrganization: Story = {
  parameters: { graphql: { mocks: organizationMocks.full } },
  render: () => (
    <ShellStory path="/settings" defaultAssistantHidden>
      <Connected tab="organization" />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByDisplayValue("Acme Robotics"),
    ).toBeInTheDocument();
  },
};

export const ConnectedLoading: Story = {
  parameters: { graphql: { mocks: organizationMocks.loading } },
  render: ConnectedToGetMyOrganization.render,
};

export const ConnectedError: Story = {
  parameters: { graphql: { mocks: organizationMocks.error } },
  render: ConnectedToGetMyOrganization.render,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        "Could not load organization settings",
      ),
    ).toBeInTheDocument();
  },
};

export const SavesThroughTheTab: Story = {
  args: { tab: "enforcement" },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(
      canvas.getByLabelText("Default enforcement mode"),
      "block",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Save enforcement" }),
    );
    await expect(args.onSaveOrganization).toHaveBeenCalledWith({
      defaultPolicyMode: "block",
      auditLogging: true,
    });
  },
};
