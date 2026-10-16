import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { changeSets } from "../../storybook/fixtures/policies";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import {
  PolicyChangesScreen,
  type PolicyChangesScreenProps,
} from "./PolicyChangesScreen";
import { NARROW, resolved } from "./story-helpers";

function Story(
  props: Partial<PolicyChangesScreenProps> & {
    role?: "viewer" | "operator" | "admin";
  },
) {
  const { role = "operator", ...rest } = props;
  const [status, setStatus] = React.useState(rest.status ?? "");
  const [openId, setOpenId] = React.useState<string | null>(
    rest.openId ?? null,
  );
  const rows = rest.changes ?? changeSets;
  return (
    <ShellStory path="/policies/changes" role={role} defaultAssistantHidden>
      <PolicyChangesScreen
        capabilities={capabilitiesOf(role)}
        loading={false}
        onRetry={fn()}
        onTransition={resolved()}
        {...rest}
        changes={rows.filter((c) => !status || c.status === status)}
        status={status}
        onStatusChange={setStatus}
        openId={openId}
        onOpenChange={setOpenId}
      />
    </ShellStory>
  );
}

const meta = {
  title: "Policies/Screens/Changes",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type S = StoryObj;

export const Full: S = { render: () => <Story /> };
export const Loading: S = { render: () => <Story changes={[]} loading /> };
export const Empty: S = { render: () => <Story changes={[]} /> };
export const EmptyFiltered: S = {
  render: () => <Story changes={[]} status="approved" />,
};
export const Error: S = {
  render: () => (
    <Story
      changes={[]}
      error={{ message: "Something went wrong on the server." }}
    />
  ),
};

/** An operator on a staged change: Reject is theirs, Approve needs an administrator. */
export const OperatorOnStaged: S = {
  render: () => <Story openId="chg-7f3c2a91" />,
  play: async () => {
    const body = within(document.body);
    await expect(
      await body.findByRole("button", { name: "Reject" }),
    ).toBeInTheDocument();
    await expect(body.queryByRole("button", { name: "Approve" })).toBeNull();
    await expect(
      body.getByText("Approve needs an administrator."),
    ).toBeInTheDocument();
  },
};

export const AdminOnStaged: S = {
  render: () => <Story role="admin" openId="chg-7f3c2a91" />,
  play: async () => {
    await expect(
      await within(document.body).findByRole("button", { name: "Approve" }),
    ).toBeInTheDocument();
  },
};

/** A viewer reads the change and its edits, with no step to take. */
export const Viewer: S = {
  render: () => <Story role="viewer" openId="chg-7f3c2a91" />,
  play: async () => {
    const body = within(document.body);
    await body.findByRole("dialog");
    await expect(body.queryByRole("button", { name: "Reject" })).toBeNull();
  },
};

export const TransitionRefused: S = {
  render: () => (
    <Story
      openId="chg-1d9e0b22"
      onTransition={fn(async () => {
        throw new globalThis.Error(
          "Cannot transition policy change from draft to validated",
        );
      })}
    />
  ),
  play: async () => {
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("button", { name: "Validate" }),
    );
    await expect(await body.findByRole("alert")).toHaveTextContent(
      "Cannot transition",
    );
  },
};

export const LongData: S = {
  render: () => (
    <Story
      changes={[
        ...changeSets,
        ...Array.from({ length: 30 }, (_, i) => ({
          ...changeSets[1],
          id: `chg-gen-${i}`,
          title: `A generated change set with a long title that needs to wrap in the table, number ${i + 1}`,
        })),
      ]}
    />
  ),
};
export const Narrow: S = { ...NARROW, render: () => <Story /> };
