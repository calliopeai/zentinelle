import { gql } from "@apollo/client";

export const GET_COMPLIANCE_REPORTS = gql`
  query GetComplianceReports($first: Int, $after: String) {
    complianceReports(first: $first, after: $after) {
      id
      name
      framework
      generatedAt
      period
      status
      downloadUrl
    }
  }
`;
