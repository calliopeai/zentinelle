export interface CurrentUser {
  id: string;
  username: string;
  email: string;
  is_staff: boolean;
  is_superuser: boolean;
  profile?: {
    id: string;
    username: string;
  };
}

export interface MeQueryData {
  me: CurrentUser | null;
}

export type MeQueryVariables = Record<string, never>;
