import type { Meta, StoryObj } from "@storybook/react-vite";
import { within } from "storybook/test";

import {
  atlas,
  brocs,
  complianceMocks,
  controlEvidence,
  reportsMocks,
  riskMocks,
  riskTrend,
  risks,
} from "../../storybook/fixtures/risk";
import type { GraphQLMock } from "../../storybook/graphql";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import {
  AtlasConnected,
  BrocsConnected,
  ComplianceConnected,
  ComplianceGapsConnected,
  EvidenceCoverageConnected,
  FrameworkDetailConnected,
  ReportsConnected,
  RiskCreateConnected,
  RiskDetailConnected,
  RisksConnected,
  RisksOverviewConnected,
  type RiskRestClient,
} from "./connected";

/** The area's REST reads, answered from fixtures. */
const rest: RiskRestClient = {
  trend: async () => ({ trend: riskTrend }),
  evidence: async () => controlEvidence,
  atlas: async () => atlas,
  brocs: async () => brocs,
  createJob: async (body) => ({
    id: 1,
    status: "pending",
    created_at: "2026-10-16T12:00:00Z",
    completed_at: null,
    error_message: null,
    ...body,
  }),
  job: async (id) => ({
    id,
    report_type: "audit_trail",
    status: "completed",
    format: "csv",
    params: {},
    created_at: "2026-10-16T12:00:00Z",
    completed_at: "2026-10-16T12:01:00Z",
    error_message: null,
  }),
};

/**
 * The containers on the app's own hooks and documents, answered by the
 * foundation's MockLink and the fixtures above: what each route renders.
 */
const meta = {
  title: "Risk & compliance/Connected",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type S = StoryObj;

const mocks = (...lists: GraphQLMock[][]) => ({
  graphql: { mocks: lists.flat() },
});
const operator = capabilitiesOf("operator");
const admin = capabilitiesOf("admin");

export const Register: S = {
  parameters: mocks(riskMocks.list),
  render: () => (
    <ShellStory path="/risks" role="operator" defaultAssistantHidden>
      <RisksConnected capabilities={operator} view="list" />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText(risks[0].name);
  },
};

export const RegisterByRpn: S = {
  parameters: mocks(riskMocks.list),
  render: () => (
    <ShellStory path="/risks?view=rpn" role="operator" defaultAssistantHidden>
      <RisksConnected capabilities={operator} view="rpn" />
    </ShellStory>
  ),
};

export const RegisterError: S = {
  parameters: mocks(riskMocks.listError),
  render: Register.render,
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText(/risk register/);
  },
};

export const Risk: S = {
  parameters: mocks(riskMocks.detail),
  render: () => (
    <ShellStory
      path={`/risks/${risks[0].id}`}
      role="operator"
      defaultAssistantHidden
    >
      <RiskDetailConnected
        capabilities={operator}
        id={risks[0].id}
        editing={false}
      />
    </ShellStory>
  ),
};

export const RiskEditing: S = {
  parameters: mocks(riskMocks.detail),
  render: () => (
    <ShellStory
      path={`/risks/${risks[0].id}`}
      role="operator"
      defaultAssistantHidden
    >
      <RiskDetailConnected capabilities={operator} id={risks[0].id} editing />
    </ShellStory>
  ),
};

export const NewRisk: S = {
  render: () => (
    <ShellStory path="/risks/create" role="operator" defaultAssistantHidden>
      <RiskCreateConnected capabilities={operator} />
    </ShellStory>
  ),
};

export const Overview: S = {
  parameters: mocks(riskMocks.stats),
  render: () => (
    <ShellStory path="/risks/overview" role="operator" defaultAssistantHidden>
      <RisksOverviewConnected capabilities={operator} client={rest} />
    </ShellStory>
  ),
};

export const Compliance: S = {
  parameters: mocks(complianceMocks.overview),
  render: () => (
    <ShellStory path="/compliance" role="admin" defaultAssistantHidden>
      <ComplianceConnected capabilities={admin} />
    </ShellStory>
  ),
};

export const Framework: S = {
  parameters: mocks(complianceMocks.overview),
  render: () => (
    <ShellStory path="/compliance/soc2" role="operator" defaultAssistantHidden>
      <FrameworkDetailConnected capabilities={operator} frameworkId="soc2" />
    </ShellStory>
  ),
};

export const Gaps: S = {
  parameters: mocks(complianceMocks.overview),
  render: () => (
    <ShellStory path="/compliance/gaps" role="operator" defaultAssistantHidden>
      <ComplianceGapsConnected capabilities={operator} />
    </ShellStory>
  ),
};

export const Evidence: S = {
  render: () => (
    <ShellStory path="/evidence" role="admin" defaultAssistantHidden>
      <EvidenceCoverageConnected capabilities={admin} client={rest} />
    </ShellStory>
  ),
};

export const Atlas: S = {
  render: () => (
    <ShellStory path="/evidence/atlas" role="admin" defaultAssistantHidden>
      <AtlasConnected capabilities={admin} client={rest} />
    </ShellStory>
  ),
};

export const Brocs: S = {
  render: () => (
    <ShellStory path="/evidence/brocs" role="admin" defaultAssistantHidden>
      <BrocsConnected capabilities={admin} client={rest} />
    </ShellStory>
  ),
};

export const EvidenceFailed: S = {
  render: () => (
    <ShellStory path="/evidence" role="admin" defaultAssistantHidden>
      <EvidenceCoverageConnected
        capabilities={admin}
        client={{
          ...rest,
          evidence: async () => {
            throw new globalThis.Error("");
          },
        }}
      />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("The evidence could not be loaded.");
  },
};

export const Reports: S = {
  parameters: mocks(reportsMocks.list, complianceMocks.overview),
  render: () => (
    <ShellStory path="/reports" role="operator" defaultAssistantHidden>
      <ReportsConnected
        capabilities={operator}
        view="all"
        client={rest}
        today="2026-10-16"
      />
    </ShellStory>
  ),
};

export const ReportsRisk: S = {
  parameters: mocks(reportsMocks.list, complianceMocks.overview),
  render: () => (
    <ShellStory
      path="/reports?type=risk"
      role="operator"
      defaultAssistantHidden
    >
      <ReportsConnected
        capabilities={operator}
        view="risk"
        client={rest}
        today="2026-10-16"
      />
    </ShellStory>
  ),
};
