import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import {
  bareOrganization,
  longOrganization,
  organization,
} from "../../storybook/fixtures/settings";
import { NotificationsForm } from "./NotificationsForm";

const meta = {
  title: "Settings/Parts/Notifications form",
  component: NotificationsForm,
  parameters: { layout: "padded" },
  args: {
    organization: organization.myOrganization!,
    onSave: fn(async () => {}),
  },
} satisfies Meta<typeof NotificationsForm>;
export default meta;

type Story = StoryObj<typeof meta>;

export const On: Story = {};

export const Off: Story = {
  args: { organization: bareOrganization.myOrganization! },
};

export const LongWebhook: Story = {
  args: { organization: longOrganization.myOrganization! },
};

export const SlackNeedsAWebhook: Story = {
  args: { organization: bareOrganization.myOrganization! },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("switch", { name: "Slack" }));
    await expect(
      canvas.getByText("Slack notifications need a webhook URL."),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Save notifications" }),
    ).toBeDisabled();
  },
};

export const RejectsPlainHttp: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const url = canvas.getByLabelText("Webhook URL");
    await userEvent.clear(url);
    await userEvent.type(url, "http://hooks.example");
    await expect(
      canvas.getByText("Enter a URL that starts with https://."),
    ).toBeInTheDocument();
  },
};

export const Saves: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("switch", { name: "Email" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Save notifications" }),
    );
    await expect(args.onSave).toHaveBeenCalledWith({
      emailNotifications: false,
      slackNotifications: true,
      webhookUrl: "https://hooks.slack.com/services/T000/B000/XXXX",
    });
  },
};
