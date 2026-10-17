import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import type { Role } from "../../product";
import { NARROW, brocs } from "../../storybook/fixtures/risk";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import { BrocsScreen, type BrocsScreenProps } from "./BrocsScreen";

/** Evidence > BROCS (admin, new), on REST `controls/brocs`. */
const meta = {
  title: "Risk & compliance/Screens/Evidence BROCS",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj;

function Brocs({
  role = "admin",
  ...props
}: Partial<BrocsScreenProps> & { role?: Role }) {
  return (
    <ShellStory path="/evidence/brocs" role={role} defaultAssistantHidden>
      <BrocsScreen
        capabilities={capabilitiesOf(role)}
        brocs={brocs}
        onRefresh={() => {}}
        {...props}
      />
    </ShellStory>
  );
}

export const Full: Story = {
  render: () => <Brocs />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const domain of ["Build", "Run", "Observe", "Control", "Secure"])
      await expect(canvas.getAllByText(domain).length).toBeGreaterThan(0);
    await expect(
      canvas.getByText(/not BROCS certification/),
    ).toBeInTheDocument();
  },
};

export const Operator: Story = { render: () => <Brocs role="operator" /> };

export const Loading: Story = { render: () => <Brocs brocs={null} loading /> };

export const Empty: Story = {
  render: () => <Brocs brocs={{ ...brocs, domains: [] }} />,
};

export const LoadError: Story = {
  render: () => (
    <Brocs
      brocs={null}
      error={{ message: "controls/brocs answered 500." }}
      onRetry={() => {}}
    />
  ),
};

export const LongData: Story = {
  render: () => (
    <Brocs
      brocs={{
        ...brocs,
        domains: brocs.domains.map((d) => ({
          ...d,
          control: `${d.control}; `.repeat(3),
          customer_responsibility: `${d.customer_responsibility} `.repeat(3),
        })),
      }}
    />
  ),
};

export const Narrow: Story = { ...NARROW, render: () => <Brocs /> };
