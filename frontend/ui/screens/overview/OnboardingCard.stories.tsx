import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { dashboardStats } from "../../storybook/fixtures/dashboard";
import { toOverview, type OnboardingStep } from "./overview-model";
import { OnboardingCard } from "./OnboardingCard";

/** From the backend's checklist, when it sends one. */
const checklistSteps = toOverview({
  stats: dashboardStats.dashboardStats,
  riskStats: null,
  openAlerts: [],
}).onboarding as OnboardingStep[];

/** Standalone deployments send no checklist; the steps come from the counts. */
const derivedSteps = toOverview({
  stats: { ...dashboardStats.dashboardStats!, checklist: null, policies: null },
  riskStats: null,
  openAlerts: [],
}).onboarding as OnboardingStep[];

const meta = {
  title: "Screens/Overview/OnboardingCard",
  component: OnboardingCard,
  args: { steps: checklistSteps, canMutate: true },
} satisfies Meta<typeof OnboardingCard>;
export default meta;

type Story = StoryObj<typeof meta>;

export const FromChecklist: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("2 of 3 done")).toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: "Turn on a compliance framework" }),
    ).toHaveAttribute("href", "/compliance");
  },
};

export const FromCounts: Story = { args: { steps: derivedSteps } };

export const Viewer: Story = {
  args: { canMutate: false },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole("link"),
    ).not.toBeInTheDocument();
  },
};

export const LongData: Story = {
  args: {
    steps: [
      ...checklistSteps,
      {
        key: "connect_astrolift_cluster_with_a_very_long_backend_key",
        label:
          "Connect astrolift cluster with a very long backend key nobody gave words",
        done: false,
        href: "/dashboard",
      },
    ],
  },
};
