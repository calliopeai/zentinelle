import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { SelectField, TextField, TextareaField } from "./FormField";

/** Labelled controls with their hint and error tied on. Candidates for @calliopelabs/ui. */
const meta = {
  title: "Shared/FormField",
  component: TextField,
  args: { label: "Name", hint: "Shown in the list and in alerts." },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TextField>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Text: Story = {};

export const Required: Story = { args: { required: true } };

export const Invalid: Story = {
  args: {
    required: true,
    error: "A name needs at least 2 characters.",
    defaultValue: "a",
  },
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole("textbox", { name: /Name/ });
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAccessibleDescription(
      /Shown in the list.*2 characters/,
    );
  },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: "support-bot" },
};

export const Textarea: Story = {
  render: () => (
    <TextareaField label="Description" hint="What the group is for." rows={3} />
  ),
};

export const Select: Story = {
  render: () => (
    <SelectField
      label="Tier"
      required
      placeholder="Choose a tier"
      options={[
        { value: "standard", label: "Standard" },
        { value: "restricted", label: "Restricted" },
      ]}
    />
  ),
};

export const SelectInvalid: Story = {
  render: () => (
    <SelectField
      label="Type"
      required
      placeholder="Choose a type"
      error="Choose the agent's type."
      options={[{ value: "langgraph", label: "LangGraph" }]}
    />
  ),
};
