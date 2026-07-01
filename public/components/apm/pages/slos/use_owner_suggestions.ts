/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Suggestion sources for the wizard's Service & owner panel.
 *
 *   - Services: distinct Prometheus `service_name` / `rpc_service` label values
 *     on the selected datasource (the same metadata route the suggest-engine
 *     discovery probes use). Datasource-scoped, so empty until one is picked.
 *   - Teams: distinct `owner.teams` values across existing SLOs. There is no
 *     backend team registry, so prior SLOs are the only consistency anchor.
 *
 * Both are *suggestions* only — the combobox still accepts free text. Failures
 * degrade to an empty list (the field keeps working as free text); discovery
 * gaps must never block SLO creation.
 */

import { useEffect, useState } from 'react';
import type { SloApiClient } from './slo_api_client';

/** Prometheus labels that carry a service identifier across OTel metric families. */
const SERVICE_LABELS = ['service_name', 'rpc_service'];

export interface OwnerSuggestions {
  services: string[];
  teams: string[];
}

const EMPTY: OwnerSuggestions = { services: [], teams: [] };

export function useOwnerSuggestions(
  apiClient: Pick<SloApiClient, 'labelValues' | 'list'>,
  datasourceId: string
): OwnerSuggestions {
  const [suggestions, setSuggestions] = useState<OwnerSuggestions>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Teams: independent of datasource — pull from existing SLOs once.
      const teamsPromise = apiClient
        .list({ pageSize: 200 })
        .then((res) => {
          const set = new Set<string>();
          for (const slo of res.results) {
            for (const t of slo.owner?.teams ?? []) if (t) set.add(t);
          }
          return Array.from(set).sort();
        })
        .catch(() => [] as string[]);

      // Services: datasource-scoped label values. Skip the round-trips entirely
      // when no datasource is selected yet.
      const servicesPromise = datasourceId
        ? Promise.all(
            SERVICE_LABELS.map((label) =>
              apiClient
                .labelValues(datasourceId, label)
                .then((r) => r.values ?? [])
                .catch(() => [] as string[])
            )
          ).then((lists) => Array.from(new Set(lists.flat())).sort())
        : Promise.resolve([] as string[]);

      const [teams, services] = await Promise.all([teamsPromise, servicesPromise]);
      if (!cancelled) setSuggestions({ services, teams });
    })();

    return () => {
      cancelled = true;
    };
  }, [apiClient, datasourceId]);

  return suggestions;
}
