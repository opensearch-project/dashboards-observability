/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { QUERY_ASSIST_API } from '../../../../common/constants/query_assist';
import { getOSDHttp } from '../../../../common/utils';
import { coreRefs } from '../../../framework/core_refs';

interface IQueryAssistContext {
  shouldShowUi: boolean;
}
export const QueryAssistContext = React.createContext<IQueryAssistContext>({
  shouldShowUi: false,
});

export const useQueryAssistContext = (): IQueryAssistContext => useContext(QueryAssistContext);

export const QueryAssistContextProvider: React.FC<PropsWithChildren> = (props) => {
  const http = getOSDHttp();
  const [enabled, setEnabled] = useState(!!coreRefs.queryAssistEnabled);
  useEffect(() => {
    http
      .get<{ enabled: boolean; error?: string }>(QUERY_ASSIST_API.CONFIGURED)
      .catch(() => {
        console.warn('Failed to check if query assist is configured');
        return { enabled: false };
      })
      .then((response) => {
        setTimeout(() => {
          coreRefs.queryAssistEnabled = response.enabled;
          setEnabled(response.enabled);
        }, 3000);
      });
  }, []);

  const queryAssistValue: IQueryAssistContext = useMemo(
    () => ({
      shouldShowUi: enabled,
    }),
    [enabled]
  );
  console.log('❗queryAssistValue:', queryAssistValue);

  return (
    <QueryAssistContext.Provider value={queryAssistValue}>
      {props.children}
    </QueryAssistContext.Provider>
  );
};
