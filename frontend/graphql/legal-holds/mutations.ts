import { gql } from "@apollo/client";

export const CREATE_LEGAL_HOLD = gql`
  mutation CreateLegalHold($input: CreateLegalHoldInput!) {
    createLegalHold(input: $input) {
      success
      holdId
      errors
    }
  }
`;

export const UPDATE_LEGAL_HOLD = gql`
  mutation UpdateLegalHold($input: UpdateLegalHoldInput!) {
    updateLegalHold(input: $input) {
      success
      holdId
      errors
    }
  }
`;

export const RELEASE_LEGAL_HOLD = gql`
  mutation ReleaseLegalHold($id: ID!) {
    releaseLegalHold(id: $id) {
      success
      holdId
    }
  }
`;

export const DELETE_LEGAL_HOLD = gql`
  mutation DeleteLegalHold($id: ID!) {
    deleteLegalHold(id: $id) {
      success
      errors
    }
  }
`;
