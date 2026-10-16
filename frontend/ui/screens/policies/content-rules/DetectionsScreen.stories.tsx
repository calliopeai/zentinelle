import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { fn } from "storybook/test";

import {
  manyViolations,
  scans,
  violations,
} from "../../../storybook/fixtures/content-rules";
import { capabilitiesOf } from "../../../storybook/session";
import { ShellStory } from "../../../storybook/ShellStory";
import { NARROW } from "../story-helpers";
import {
  DetectionsScreen,
  type DetectionWindow,
  type DetectionsScreenProps,
} from "./DetectionsScreen";

function Story(
  props: Partial<DetectionsScreenProps> & { role?: "viewer" | "operator" },
) {
  const { role = "operator", ...rest } = props;
  const [window, setWindow] = React.useState<DetectionWindow>(
    rest.window ?? "7",
  );
  const [severity, setSeverity] = React.useState(rest.severity ?? "");
  const [ruleType, setRuleType] = React.useState(rest.ruleType ?? "");
  return (
    <ShellStory
      path="/content-rules/detections"
      role={role}
      defaultAssistantHidden
    >
      <DetectionsScreen
        capabilities={capabilitiesOf(role)}
        violations={violations}
        scans={scans}
        loading={false}
        onRetry={fn()}
        exportHref="/api/zentinelle/v1/export/violations.csv?days=7"
        {...rest}
        window={window}
        onWindowChange={setWindow}
        severity={severity}
        onSeverityChange={setSeverity}
        ruleType={ruleType}
        onRuleTypeChange={setRuleType}
      />
    </ShellStory>
  );
}

const meta = {
  title: "Policies/Screens/Detections",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type S = StoryObj;

export const Full: S = { render: () => <Story /> };
export const Loading: S = {
  render: () => <Story violations={[]} scans={[]} loading />,
};
export const Empty: S = {
  render: () => <Story violations={[]} scans={scans.slice(2)} />,
};
export const EmptyFiltered: S = {
  render: () => <Story violations={[]} severity="critical" />,
};
export const Error: S = {
  render: () => (
    <Story
      violations={[]}
      scans={[]}
      error={{ message: "Something went wrong on the server." }}
    />
  ),
};
/** Detections are read-only for everyone; a viewer sees the same screen. */
export const Viewer: S = { render: () => <Story role="viewer" /> };
export const LongData: S = {
  render: () => <Story violations={manyViolations} />,
};
export const Narrow: S = {
  ...NARROW,
  render: () => <Story violations={manyViolations} />,
};
