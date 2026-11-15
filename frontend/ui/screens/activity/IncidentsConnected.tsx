"use client";

import { useMutation } from "@apollo/client/react";
import { useTranslations } from "next-intl";

import { CREATE_INCIDENT } from "@/graphql/risks/mutations";
import { GET_INCIDENTS } from "@/graphql/risks/queries";
import type { CreateIncidentInput } from "@/graphql/risks/types";

import { payloadOrThrow } from "../../shared/mutation";
import { useIncidentsData } from "./data";
import { IncidentsScreen } from "./IncidentsScreen";

export interface IncidentsConnectedProps {
  canMutate: boolean;
}

/** Incidents on `GetIncidents` (through `useIncidentsData`) and `CreateIncident`. `app/(app)/incidents` renders this. */
export function IncidentsConnected({ canMutate }: IncidentsConnectedProps) {
  const t = useTranslations("activity.incidents");
  const data = useIncidentsData();
  const [create] = useMutation<
    {
      createIncident: {
        success: boolean | null;
        incidentId: string | null;
        errors: string[] | null;
      };
    },
    { input: CreateIncidentInput }
  >(CREATE_INCIDENT, { refetchQueries: [GET_INCIDENTS] });
  return (
    <IncidentsScreen
      {...data}
      canMutate={canMutate}
      onReport={async (input) => {
        const { data } = await create({ variables: { input } });
        payloadOrThrow(data?.createIncident, t("errors.report"));
      }}
    />
  );
}
