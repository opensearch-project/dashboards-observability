/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { useApmConfig } from '../../config/apm_config_context';
import { PPLSearchService } from '../../query_services/ppl_search_service';
import { getMappedFieldNames } from '../../query_services/field_mapping_service';
import { getQueryNodeType } from '../../query_services/query_requests/ppl_queries';
import { normalizeNodeType } from '../utils/platform_utils';

export interface ResolvedNodeType {
  /** Normalized node type (service / database / messaging / external / ...). */
  nodeType: string;
  /** True until the service map has been consulted. */
  resolving: boolean;
}

/**
 * Resolve a node's type from the service map rather than trusting the URL: a `nodeType`
 * param can be missing (older links, links built without it) or wrong. The URL type is
 * used only when the service map cannot be read.
 *
 * Service-map data without typed nodes (no `targetNode.type` mapped) has only services, so
 * no query is sent for it.
 *
 * @param name - Node name
 * @param environment - Node environment, or undefined to match any
 * @param hintedType - Type from the URL, used if the lookup fails
 */
export function useResolvedNodeType(
  name: string,
  environment: string | undefined,
  hintedType: string | undefined
): ResolvedNodeType {
  const { config } = useApmConfig();
  const dataset = config?.serviceMapDataset;
  const [resolved, setResolved] = useState<{ key: string; nodeType: string } | null>(null);
  const key = `${dataset?.id || ''}|${name}|${environment || ''}|${hintedType || ''}`;

  useEffect(() => {
    if (!dataset || !name) {
      setResolved({ key, nodeType: normalizeNodeType(hintedType) });
      return;
    }
    const abortController = new AbortController();
    const resolve = async () => {
      let nodeType: string;
      try {
        const fields = await getMappedFieldNames(dataset.title, dataset.datasourceId);
        if (!fields.has('targetNode.type')) {
          nodeType = 'service';
        } else {
          const resp = await new PPLSearchService().executeQuery(
            getQueryNodeType(dataset.title, name, environment),
            {
              id: dataset.id,
              title: dataset.title,
              ...(dataset.datasourceId && {
                dataSource: { id: dataset.datasourceId, type: 'DATA_SOURCE' },
              }),
            },
            abortController.signal
          );
          const row = resp?.jsonData?.[0];
          // Never a target: a root service.
          nodeType = row ? normalizeNodeType(row['targetNode.type']) : 'service';
        }
      } catch (e) {
        if (abortController.signal.aborted) return;
        console.warn('[useResolvedNodeType] Falling back to the URL node type:', e);
        nodeType = normalizeNodeType(hintedType);
      }
      if (!abortController.signal.aborted) setResolved({ key, nodeType });
    };
    resolve();
    return () => abortController.abort();
    // key covers dataset, name, environment and hint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = resolved?.key === key ? resolved : null;
  return {
    nodeType: current?.nodeType ?? normalizeNodeType(hintedType),
    resolving: current === null,
  };
}
