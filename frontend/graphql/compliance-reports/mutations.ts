import { gql } from "@apollo/client";

export const GENERATE_COMPLIANCE_REPORT = gql`
  mutation GenerateComplianceReport(
    $frameworkId: String
    $startDate: Date
    $endDate: Date
  ) {
    generateComplianceReport(
      frameworkId: $frameworkId
      startDate: $startDate
      endDate: $endDate
    ) {
      success
      reportUrl
      assessmentId
      errors
    }
  }
`;
