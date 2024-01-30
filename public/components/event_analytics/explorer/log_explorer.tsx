/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */
import { isEmpty } from 'lodash';
import { EuiPage } from '@elastic/eui';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { LogExplorerRouterContext } from '..';
import {
  APP_ANALYTICS_TAB_ID_REGEX,
  CREATE_TAB_PARAM_KEY,
  TAB_CHART_ID,
  TAB_EVENT_ID,
} from '../../../../common/constants/explorer';
import { EmptyTabParams, ILogExplorerProps } from '../../../../common/types/explorer';
import { selectQueryResult } from '../redux/slices/query_result_slice';
import { selectQueries } from '../redux/slices/query_slice';
import { selectQueryTabs } from '../redux/slices/query_tab_slice';
import { Explorer } from './explorer';

const searchBarConfigs = {
  [TAB_EVENT_ID]: {
    showSaveButton: true,
    showSavePanelOptionsList: false,
  },
  [TAB_CHART_ID]: {
    showSaveButton: true,
    showSavePanelOptionsList: true,
  },
};

const getExistingEmptyTab = ({ tabIds }: EmptyTabParams) => tabIds[0];

export const LogExplorer = ({
  pplService,
  dslService,
  savedObjects,
  timestampUtils,
  setToast,
  savedObjectId,
  notifications,
  http,
  queryManager,
  dataSourcePluggables,
}: ILogExplorerProps) => {
  const history = useHistory();
  const routerContext = useContext(LogExplorerRouterContext);
  const tabIds = useSelector(selectQueryTabs).queryTabIds.filter(
    (tabid: string) => !tabid.match(APP_ANALYTICS_TAB_ID_REGEX)
  );
  const queries = useSelector(selectQueries);
  const curSelectedTabId = useSelector(selectQueryTabs).selectedQueryTab;
  const explorerData = useSelector(selectQueryResult);
  const queryRef = useRef();
  const tabIdsRef = useRef();
  const explorerDataRef = useRef();
  const curSelectedTabIdRef = useRef();
  queryRef.current = queries;
  tabIdsRef.current = tabIds;
  explorerDataRef.current = explorerData;
  curSelectedTabIdRef.current = curSelectedTabId;

  const [tabCreatedTypes, setTabCreatedTypes] = useState({});

  const dispatchSavedObjectId = async () => {
    return getExistingEmptyTab({
      tabIds: tabIdsRef.current,
      queries: queryRef.current,
      explorerData: explorerDataRef.current,
    });
  };

  useEffect(() => {
    if (!isEmpty(savedObjectId)) {
      dispatchSavedObjectId();
    }
    if (routerContext && routerContext.searchParams.has(CREATE_TAB_PARAM_KEY)) {
      // need to wait for current redux event loop to finish
      setImmediate(() => {
        routerContext.searchParams.delete(CREATE_TAB_PARAM_KEY);
        routerContext.routerProps.history.replace({
          search: routerContext.searchParams.toString(),
        });
      });
    }
  }, []);

  return (
    <>
      <Explorer
        key={`explorer_${tabIds[0]}`}
        pplService={pplService}
        dslService={dslService}
        tabId={tabIds[0]}
        savedObjects={savedObjects}
        timestampUtils={timestampUtils}
        setToast={setToast}
        history={history}
        notifications={notifications}
        savedObjectId={savedObjectId}
        tabCreatedTypes={tabCreatedTypes}
        curSelectedTabId={curSelectedTabIdRef}
        http={http}
        searchBarConfigs={searchBarConfigs}
        queryManager={queryManager}
        dataSourcePluggables={dataSourcePluggables}
      />
    </>
  );
};
