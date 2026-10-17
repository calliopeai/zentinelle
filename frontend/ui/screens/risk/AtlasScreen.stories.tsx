import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import type { Role } from "../../product";
import { NARROW, atlas } from "../../storybook/fixtures/risk";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import { AtlasScreen, type AtlasScreenProps } from "./AtlasScreen";

/** Evidence > MITRE ATLAS (admin), on REST `threats/atlas`. */
const meta = {
  title: "Risk & compliance/Screens/Evidence ATLAS",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj;

function Atlas({
  role = "admin",
  ...props
}: Partial<AtlasScreenProps> & { role?: Role }) {
  return (
    <ShellStory path="/evidence/atlas" role={role} defaultAssistantHidden>
      <AtlasScreen
        capabilities={capabilitiesOf(role)}
        atlas={atlas}
        onRefresh={() => {}}
        {...props}
      />
    </ShellStory>
  );
}

export const Full: Story = {
  render: () => <Atlas />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/not certification or endorsement/),
    ).toBeInTheDocument();
    await expect(canvas.getAllByText("Unverified").length).toBe(2);
  },
};

export const Operator: Story = { render: () => <Atlas role="operator" /> };

export const Loading: Story = { render: () => <Atlas atlas={null} loading /> };

export const Empty: Story = {
  render: () => <Atlas atlas={{ ...atlas, techniques: [] }} />,
};

export const LoadError: Story = {
  render: () => (
    <Atlas
      atlas={null}
      error={{ message: "threats/atlas answered 403." }}
      onRetry={() => {}}
    />
  ),
};

export const LongData: Story = {
  render: () => (
    <Atlas
      atlas={{
        ...atlas,
        techniques: atlas.techniques.map((t) => ({
          ...t,
          residual_risk: `${t.residual_risk ?? ""} `.repeat(4),
          enforcement_point: `${t.enforcement_point}, post-tool output inspection, and the outbound egress proxy`,
        })),
      }}
    />
  ),
};

export const Narrow: Story = { ...NARROW, render: () => <Atlas /> };
