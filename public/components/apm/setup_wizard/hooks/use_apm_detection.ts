/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { coreRefs } from '../../../../framework/core_refs';
import { detectApmDataAcrossDataSources } from '../utils/apm_auto_detect';
import { ApmDetectionResult } from '../types';

/**
 * Runs APM data detection across all data sources once (with a manual refresh).
 * Shared by the traces and services wizard steps so detection happens a single
 * time per wizard session.
 */
export const useApmDetection = () => {
  const [detections, setDetections] = useState<ApmDetectionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();
  const [refreshToken, setRefreshToken] = useState({});

  useEffect(() => {
    const data = coreRefs.data;
    const savedObjectsClient = coreRefs.savedObjectsClient;
    if (!data || !savedObjectsClient) {
      setDetections([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(undefined);

    (async () => {
      try {
        const results = await detectApmDataAcrossDataSources(
          savedObjectsClient,
          data.indexPatterns
        );
        if (!cancelled) {
          setDetections(results);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setDetections([]);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const refresh = useCallback(() => setRefreshToken({}), []);

  return { detections, loading, error, refresh };
};

/** Public shape of the detection hook, shared by the wizard steps. */
export type ApmDetectionHook = ReturnType<typeof useApmDetection>;
