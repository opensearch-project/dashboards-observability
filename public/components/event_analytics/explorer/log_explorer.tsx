/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */
import { isEmpty } from 'lodash';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { batch, useSelector, useDispatch } from 'react-redux';
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
import { getDateRange } from '../utils/utils';
import {
  QUERY_ASSIST_END_TIME,
  QUERY_ASSIST_START_TIME,
} from '../../../../common/constants/shared';
import { coreRefs } from '../../../../public/framework/core_refs';

import { init as initFields } from '../../event_analytics/redux/slices/field_slice';
import { init as initPatterns } from '../../event_analytics/redux/slices/patterns_slice';
import { init as initQueryResult } from '../../event_analytics/redux/slices/query_result_slice';
import { init as initQuery } from '../../event_analytics/redux/slices/query_slice';
import { init as initVisualizationConfig } from '../../event_analytics/redux/slices/viualization_config_slice';
import { resetSummary as initQueryAssistSummary } from '../../event_analytics/redux/slices/query_assistant_summarization_slice';
import { init as initSearchMetaData } from '../../event_analytics/redux/slices/search_meta_data_slice';

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
  const dispatch = useDispatch();
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [tabCreatedTypes, setTabCreatedTypes] = useState({});

  const dispatchSavedObjectId = async () => {
    return getExistingEmptyTab({
      tabIds: tabIdsRef.current,
      queries: queryRef.current,
      explorerData: explorerDataRef.current,
    });
  };

  const dateRange = coreRefs.queryAssistEnabled
    ? [QUERY_ASSIST_START_TIME, QUERY_ASSIST_END_TIME]
    : getDateRange(undefined, undefined, queries[tabIds[0]]);
  const [startTime, setStartTime] = useState(dateRange[0]);
  const [endTime, setEndTime] = useState(dateRange[1]);

  useEffect(() => {
    if (!isEmpty(savedObjectId)) {
      dispatchSavedObjectId();
    } else {
      // below piece of code was added to simulate creating a new tab if saved obj isn't being loaded,
      // since tabs being visually removed means 'new tab' cannot be created any other way
      const tabId = tabIds[0];
      batch(() => {
        dispatch(initQuery({ tabId }));
        dispatch(initQueryResult({ tabId }));
        dispatch(initFields({ tabId }));
        dispatch(initVisualizationConfig({ tabId }));
        dispatch(initPatterns({ tabId }));
        dispatch(initQueryAssistSummary({ tabId }));
        dispatch(initSearchMetaData({ tabId }));
      });
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
        startTime={startTime}
        endTime={endTime}
        setStartTime={setStartTime}
        setEndTime={setEndTime}
        queryManager={queryManager}
        dataSourcePluggables={dataSourcePluggables}
      />
    </>
  );
};
