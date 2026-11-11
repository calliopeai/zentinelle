import { Input } from "@calliopelabs/ui";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Field, Select, Textarea } from "./form";

const meta = {
  title: "Patterns/Form",
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;
type Story = StoryObj;

const OPTIONS = [
  { value: "security", label: "Security" },
  { value: "privacy", label: "Privacy" },
];

export const Fields: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-4">
      <Field label="Name" required hint="What could go wrong, in a line.">
        <Input defaultValue="Prompt injection through retrieved documents" />
      </Field>
      <Field label="Category">
        <Select options={OPTIONS} defaultValue="privacy" />
      </Field>
      <Field label="Residual likelihood">
        <Select options={OPTIONS} placeholder="Not assessed" defaultValue="" />
      </Field>
      <Field label="Description">
        <Textarea defaultValue="Instructions planted in indexed documents." />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText(/Name/)).toHaveAccessibleDescription(
      "What could go wrong, in a line.",
    );
    await expect(canvas.getByLabelText("Category")).toHaveValue("privacy");
  },
};

export const WithError: Story = {
  render: () => (
    <div className="max-w-md">
      <Field label="Name" required error="A risk needs a name.">
        <Input defaultValue="" />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByLabelText(/Name/);
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAccessibleDescription("A risk needs a name.");
  },
};
