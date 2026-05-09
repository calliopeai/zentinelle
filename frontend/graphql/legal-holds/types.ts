export type LegalHoldStatus = "active" | "released" | "expired" | (string & {});

export type LegalHoldKind =
  | "litigation"
  | "regulatory"
  | "internal"
  | "preservation"
  | (string & {});

export interface LegalHoldData {
  id: string;
  name: string;
  description: string | null;
  referenceNumber: string | null;
  holdType: LegalHoldKind;
  holdTypeDisplay: string | null;
  status: LegalHoldStatus;
  statusDisplay: string | null;
  appliesToAll: boolean;
  entityTypes: string[];
  userIdentifiers: string[];
  dataFrom: string | null;
  dataTo: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  releasedAt: string | null;
  custodianEmail: string | null;
  notifyOnAccess: boolean;
  notificationEmails: string[];
  isActive: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface LegalHoldsQueryData {
  legalHolds: LegalHoldData[];
}

export interface LegalHoldsQueryVariables {
  holdType?: string | null;
  status?: string | null;
}

export interface LabelValueOption {
  value: string;
  label: string;
}

export interface LegalHoldOptionsData {
  legalHoldOptions: {
    holdTypes: LabelValueOption[];
    statuses: LabelValueOption[];
  } | null;
}

export interface CreateLegalHoldInput {
  name: string;
  description?: string | null;
  referenceNumber?: string | null;
  holdType?: string | null;
  appliesToAll?: boolean | null;
  entityTypes?: string[] | null;
  userIdentifiers?: string[] | null;
  dataFrom?: string | null;
  dataTo?: string | null;
  effectiveDate?: string | null;
  expirationDate?: string | null;
  custodianEmail?: string | null;
  notifyOnAccess?: boolean | null;
  notificationEmails?: string[] | null;
}

export interface UpdateLegalHoldInput extends Omit<CreateLegalHoldInput, "name"> {
  id: string;
  name?: string | null;
}

export interface CreateLegalHoldResult {
  createLegalHold: {
    success: boolean | null;
    holdId: string | null;
    errors: string[];
  };
}

export interface UpdateLegalHoldResult {
  updateLegalHold: {
    success: boolean | null;
    holdId: string | null;
    errors: string[];
  };
}

export interface ReleaseLegalHoldResult {
  releaseLegalHold: {
    success: boolean | null;
    holdId: string | null;
  };
}

export interface DeleteLegalHoldResult {
  deleteLegalHold: {
    success: boolean | null;
    errors: string[];
  };
}
