import { gql } from "@apollo/client";

export const GENERATE_COMPLIANCE_REPORT = gql`
  mutation GenerateComplianceReport(
    $framework: String
    $startDate: Date
    $endDate: Date
  ) {
    generateComplianceReport(
      framework: $framework
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
