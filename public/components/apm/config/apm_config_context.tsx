/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { DataPublicPluginStart } from '../../../../../../src/plugins/data/public';
import { ResolvedApmConfig } from '../../../../common/types/observability_saved_object_attributes';
import { OSDSavedApmConfigClient } from '../../../services/saved_objects/saved_object_client/osd_saved_objects/apm_config';

interface ApmConfigContextState {
  config: ResolvedApmConfig | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

const ApmConfigContext = createContext<ApmConfigContextState | undefined>(undefined);

interface ApmConfigProviderProps {
  children: React.ReactNode;
  dataService: DataPublicPluginStart;
}

export const ApmConfigProvider: React.FC<ApmConfigProviderProps> = ({ children, dataService }) => {
  const [config, setConfig] = useState<ResolvedApmConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = OSDSavedApmConfigClient.getInstance();
      const { configs } = await client.getBulkWithResolvedReferences(dataService);
      setConfig(configs.length > 0 ? configs[0] : null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, [dataService]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const refresh = useCallback(() => {
    fetchConfig();
  }, [fetchConfig]);

  return (
    <ApmConfigContext.Provider value={{ config, loading, error, refresh }}>
      {children}
    </ApmConfigContext.Provider>
  );
};

export const useApmConfig = (): ApmConfigContextState => {
  const context = useContext(ApmConfigContext);
  if (context === undefined) {
    throw new Error('useApmConfig must be used within an ApmConfigProvider');
  }
  return context;
};
