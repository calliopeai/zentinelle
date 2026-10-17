import { Input } from "@calliopelabs/ui";
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, userEvent, within } from "storybook/test";

import { FormActions, FormField, Select, useSaveState } from "./FormField";

const meta = {
  title: "Settings/Components/Form field",
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;

type Story = StoryObj;

export const WithHint: Story = {
  render: () => (
    <FormField label="Contact email" hint="Alerts and incidents go here.">
      {(control) => (
        <Input type="email" defaultValue="ops@acme.example" {...control} />
      )}
    </FormField>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByLabelText("Contact email"),
    ).toHaveAccessibleDescription("Alerts and incidents go here.");
  },
};

export const WithError: Story = {
  render: () => (
    <FormField
      label="Webhook URL"
      error="Enter a URL that starts with https://."
    >
      {(control) => <Input defaultValue="hooks.slack.com" {...control} />}
    </FormField>
  ),
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByLabelText("Webhook URL");
    await expect(input).toHaveAttribute("aria-invalid", "true");
  },
};

export const NativeSelect: Story = {
  render: () => (
    <FormField label="Default enforcement">
      {(control) => (
        <Select
          {...control}
          defaultValue="warn"
          options={[
            { value: "monitor", label: "Monitor (record only)" },
            { value: "warn", label: "Warn (record and notify)" },
            { value: "block", label: "Block (enforce)" },
          ]}
        />
      )}
    </FormField>
  ),
};

function SaveDemo({ fail }: { fail?: boolean }) {
  const save = useSaveState();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save.run(async () => {
          if (fail) throw new Error("The server refused the change.");
        });
      }}
    >
      <FormActions submitLabel="Save" {...save}>
        Revision 12
      </FormActions>
    </form>
  );
}

export const Saves: Story = {
  render: () => <SaveDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByText("Saved")).toBeInTheDocument();
  },
};

export const SaveFails: Story = {
  render: () => <SaveDemo fail />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("The server refused the change."),
    ).toBeInTheDocument();
  },
};

export const Pending: Story = {
  render: () => (
    <form>
      <FormActions submitLabel="Save" pending pendingLabel="Saving" />
    </form>
  ),
};
