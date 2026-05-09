import { gql } from "@apollo/client";

export const GET_LEGAL_HOLDS = gql`
  query LegalHolds($holdType: String, $status: String) {
    legalHolds(holdType: $holdType, status: $status) {
      id
      name
      description
      referenceNumber
      holdType
      holdTypeDisplay
      status
      statusDisplay
      appliesToAll
      entityTypes
      userIdentifiers
      dataFrom
      dataTo
      effectiveDate
      expirationDate
      releasedAt
      custodianEmail
      notifyOnAccess
      notificationEmails
      isActive
      createdAt
      updatedAt
    }
  }
`;

export const GET_LEGAL_HOLD_OPTIONS = gql`
  query LegalHoldOptions {
    legalHoldOptions {
      holdTypes {
        value
        label
      }
      statuses {
        value
        label
      }
    }
  }
`;
