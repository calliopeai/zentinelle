import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, userEvent, within } from "storybook/test";

import { policyOptions } from "../../storybook/fixtures/policies";
import { CodeBlock } from "../../shared/CodeBlock";
import { PolicyConfigFields } from "./PolicyConfigFields";

const schemaOf = (type: string) =>
  policyOptions.policyOptions!.policyTypes.find((t) => t.value === type)!
    .configSchema;

function Live({
  type,
  initial,
}: {
  type: string;
  initial: Record<string, unknown>;
}) {
  const [value, setValue] = React.useState(initial);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PolicyConfigFields
        schema={schemaOf(type)}
        value={value}
        onChange={setValue}
      />
      <CodeBlock label="Stored configuration" value={value} />
    </div>
  );
}

const meta = {
  title: "Policies/Components/PolicyConfigFields",
  component: PolicyConfigFields,
  args: { schema: schemaOf("budget_limit"), value: {}, onChange: () => {} },
} satisfies Meta<typeof PolicyConfigFields>;
export default meta;
type S = StoryObj<typeof meta>;

export const Budget: S = {
  render: () => (
    <Live
      type="budget_limit"
      initial={{
        monthly_budget_usd: 5000,
        alert_threshold_percent: 80,
        hard_limit: true,
      }}
    />
  ),
};
export const Network: S = {
  render: () => (
    <Live
      type="network_policy"
      initial={{
        allowed_outbound_domains: ["api.openai.com"],
        extra_key_from_api: 1,
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const list = canvas.getByRole("textbox", {
      name: "Allowed outbound domains",
    });
    await userEvent.type(list, "\napi.anthropic.com");
    await expect(
      canvas.getByLabelText("Stored configuration"),
    ).toHaveTextContent("api.anthropic.com");
    await expect(
      canvas.getByLabelText("Stored configuration"),
    ).toHaveTextContent("extra_key_from_api");
  },
};
export const InvalidNumber: S = {
  render: () => <Live type="rate_limit" initial={{}} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Requests per minute" }),
      "12.5",
    );
    await expect(canvas.getByText("Enter a whole number.")).toBeInTheDocument();
  },
};
export const NoSchema: S = { args: { schema: {} } };
export const Disabled: S = {
  args: { disabled: true, value: { monthly_budget_usd: 5000 } },
};
