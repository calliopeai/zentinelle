import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { FormActions, useSaveState } from "./FormField";

const meta = {
  title: "Settings/Components/Form actions",
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;

type Story = StoryObj;

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

export const Idle: Story = {
  render: () => <SaveDemo />,
};

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
