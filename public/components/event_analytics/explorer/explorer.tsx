/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import dateMath from '@elastic/datemath';
import {
  EuiContextMenuItem,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiLoadingSpinner,
  EuiPage,
  EuiPageBody,
  EuiPageSideBar,
  EuiPanel,
  EuiSpacer,
  EuiSplitPanel,
  EuiTabbedContent,
  EuiTabbedContentTab,
  EuiText,
} from '@elastic/eui';
import { FormattedMessage } from '@osd/i18n/react';
import { createBrowserHistory } from 'history';
import isEmpty from 'lodash/isEmpty';
import isEqual from 'lodash/isEqual';
import reduce from 'lodash/reduce';
import sum from 'lodash/sum';
import React, {
  ReactElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { batch, useDispatch, useSelector } from 'react-redux';
import { LogExplorerRouterContext } from '..';
import {
  DEFAULT_DATA_SOURCE_TYPE,
  QUERY_LANGUAGE,
} from '../../../../common/constants/data_sources';
import {
  CREATE_TAB_PARAM,
  CREATE_TAB_PARAM_KEY,
  DATE_PICKER_FORMAT,
  DEFAULT_AVAILABILITY_QUERY,
  EVENT_ANALYTICS_DOCUMENTATION_URL,
  FINAL_QUERY,
  PATTERNS_EXTRACTOR_REGEX,
  PATTERNS_REGEX,
  RAW_QUERY,
  SAVED_OBJECT_ID,
  SAVED_OBJECT_TYPE,
  SAVED_QUERY,
  SAVED_VISUALIZATION,
  SELECTED_DATE_RANGE,
  SELECTED_TIMESTAMP,
  TAB_CHART_ID,
  TAB_CHART_TITLE,
  TAB_EVENT_ID,
  TAB_EVENT_TITLE,
  TIME_INTERVAL_OPTIONS,
} from '../../../../common/constants/explorer';
import { QUERY_ASSIST_API } from '../../../../common/constants/query_assist';
import {
  LIVE_END_TIME,
  LIVE_OPTIONS,
  PPL_DESCRIBE_INDEX_REGEX,
  PPL_METRIC_SUBTYPE,
  PPL_NEWLINE_REGEX,
} from '../../../../common/constants/shared';
import { QueryManager } from '../../../../common/query_manager';
import {
  IExplorerProps,
  IField,
  IQuery,
  IQueryTab,
  IVisualizationContainerProps,
} from '../../../../common/types/explorer';
import {
  buildQuery,
  getIndexPatternFromRawQuery,
  getSavingCommonParams,
  uiSettingsService,
} from '../../../../common/utils';
import { coreRefs } from '../../../framework/core_refs';
import { initialTabId } from '../../../framework/redux/store/shared_state';
import { PPLDataFetcher } from '../../../services/data_fetchers/ppl/ppl_data_fetcher';
import { getSavedObjectsClient } from '../../../services/saved_objects/saved_object_client/client_factory';
import { OSDSavedSearchClient } from '../../../services/saved_objects/saved_object_client/osd_saved_objects/saved_searches';
import { OSDSavedVisualizationClient } from '../../../services/saved_objects/saved_object_client/osd_saved_objects/saved_visualization';
import { PanelSavedObjectClient } from '../../../services/saved_objects/saved_object_client/ppl';
import { ExplorerSavedObjectLoader } from '../../../services/saved_objects/saved_object_loaders/explorer_saved_object_loader';
import {
  SaveAsCurrentQuery,
  SaveAsCurrentVisualization,
  SaveAsNewVisualization,
} from '../../../services/saved_objects/saved_object_savers';
import { SaveAsNewQuery } from '../../../services/saved_objects/saved_object_savers/ppl/save_as_new_query';
import { sleep } from '../../common/live_tail/live_tail_button';
import { findMinInterval } from '../../common/query_utils';
import { onItemSelect, parseGetSuggestions } from '../../common/search/autocomplete_logic';
import { Search } from '../../common/search/search';
import { processMetricsData } from '../../custom_panels/helpers/utils';
import {
  selectSearchMetaData,
  update as updateSearchMetaData,
} from '../../event_analytics/redux/slices/search_meta_data_slice';
import { getVizContainerProps } from '../../visualizations/charts/helpers';
import { TabContext, useFetchEvents, useFetchPatterns, useFetchVisualizations } from '../hooks';
import {
  render as updateCountDistribution,
  selectCountDistribution,
} from '../redux/slices/count_distribution_slice';
import { selectFields, updateFields } from '../redux/slices/field_slice';
import { selectQueryResult } from '../redux/slices/query_result_slice';
import { changeData, changeQuery, selectQueries } from '../redux/slices/query_slice';
import { updateTabName } from '../redux/slices/query_tab_slice';
import { selectExplorerVisualization } from '../redux/slices/visualization_slice';
import {
  change as changeVisualizationConfig,
  change as changeVizConfig,
  change as updateVizConfig,
  selectVisualizationConfig,
} from '../redux/slices/viualization_config_slice';
import { getDefaultVisConfig } from '../utils';
import { formatError, getContentTabTitle } from '../utils/utils';
import { DataSourceSelection } from './datasources/datasources_selection';
import { DirectQueryRunning } from './direct_query_running';
import { DataGrid } from './events_views/data_grid';
import { LogPatterns } from './log_patterns/log_patterns';
import { NoResults } from './no_results';
import { ObservabilitySideBar } from './sidebar/observability_sidebar';
import { getTimeRangeFromCountDistribution, HitsCounter, Timechart } from './timechart';
import { ExplorerVisualizations } from './visualizations';
import { DirectQueryVisualization } from './visualizations/direct_query_vis';

export const Explorer = ({
  pplService,
  dslService,
  tabId,
  savedObjects,
  timestampUtils,
  setToast,
  http,
  history,
  notifications,
  savedObjectId,
  curSelectedTabId,
  searchBarConfigs,
  appId = '',
  appBaseQuery = '',
  addVisualizationToPanel,
  startTime,
  endTime,
  setStartTime,
  setEndTime,
  callback,
  callbackInApp,
  queryManager = new QueryManager(),
  dataSourcePluggables,
}: IExplorerProps) => {
  const routerContext = useContext(LogExplorerRouterContext);
  const dispatch = useDispatch();
  const requestParams = { tabId };
  const { getLiveTail, getEvents, getAvailableFields, dispatchOnGettingHis } = useFetchEvents({
    pplService,
    requestParams,
  });
  const { getCountVisualizations } = useFetchVisualizations({
    pplService,
    requestParams,
  });
  const { getPatterns, setDefaultPatternsField } = useFetchPatterns({
    pplService,
    requestParams,
  });
  const [eventsLoading, setEventsLoading] = useState(false);

  const appLogEvents = tabId.startsWith('application-analytics-tab');
  const query = useSelector(selectQueries)[tabId];
  const explorerData = useSelector(selectQueryResult)[tabId];
  const explorerFields = useSelector(selectFields)[tabId];
  const countDistribution = useSelector(selectCountDistribution)[tabId];
  const explorerVisualizations = useSelector(selectExplorerVisualization)[tabId];
  const userVizConfigs = useSelector(selectVisualizationConfig)[tabId] || {};
  const explorerSearchMeta = useSelector(selectSearchMetaData)[tabId] || {};
  const [selectedContentTabId, setSelectedContentTab] = useState(TAB_EVENT_ID);
  const [selectedCustomPanelOptions, setSelectedCustomPanelOptions] = useState([]);
  const [selectedPanelName, setSelectedPanelName] = useState('');
  const [curVisId, setCurVisId] = useState('bar');
  const [isPanelTextFieldInvalid, _setIsPanelTextFieldInvalid] = useState(false);
  const [timeIntervalOptions, setTimeIntervalOptions] = useState(TIME_INTERVAL_OPTIONS);
  const [isOverridingTimestamp, setIsOverridingTimestamp] = useState(false);
  const [tempQuery, setTempQuery] = useState(query[RAW_QUERY]);
  const [isLiveTailPopoverOpen, setIsLiveTailPopoverOpen] = useState(false);
  const [isLiveTailOn, setIsLiveTailOn] = useState(false);
  const [liveTailTabId, setLiveTailTabId] = useState(TAB_EVENT_ID);
  const [liveTailName, setLiveTailName] = useState('Live');
  const [liveHits, setLiveHits] = useState(0);
  const [browserTabFocus, setBrowserTabFocus] = useState(true);
  const [liveTimestamp, setLiveTimestamp] = useState(DATE_PICKER_FORMAT);
  const [triggerAvailability, setTriggerAvailability] = useState(false);
  const [isQueryRunning, setIsQueryRunning] = useState(false);
  const currentPluggable = useMemo(() => {
    return explorerSearchMeta.datasources?.[0]?.type
      ? dataSourcePluggables[explorerSearchMeta?.datasources[0]?.type]
      : dataSourcePluggables.DEFAULT_INDEX_PATTERNS;
  }, [explorerSearchMeta.datasources]);
  const { ui } =
    currentPluggable?.getComponentSetForVariation(
      'languages',
      explorerSearchMeta.lang || QUERY_LANGUAGE.SQL
    ) || {};
  const SearchBar = ui?.SearchBar || Search;
  const isDefaultDataSourceType = [DEFAULT_DATA_SOURCE_TYPE, 'prometheus'].includes(
    explorerSearchMeta.datasources?.[0]?.type
  );

  const selectedIntervalRef = useRef<{
    text: string;
    value: string;
  }>();
  const [subType, setSubType] = useState('visualization');
  const [_metricMeasure, setMetricMeasure] = useState('');
  const [_metricChecked, setMetricChecked] = useState(false);
  const [_refresh, setRefresh] = useState({});
  const queryRef = useRef();
  const appBasedRef = useRef('');
  appBasedRef.current = appBaseQuery;
  const selectedPanelNameRef = useRef('');
  const explorerFieldsRef = useRef();
  const isLiveTailOnRef = useRef(false);
  const liveTailTabIdRef = useRef('');
  const liveTailNameRef = useRef('Live');
  const savedObjectLoader = useRef<ExplorerSavedObjectLoader | undefined>(undefined);
  const isObjectIdUpdatedFromSave = useRef(false); // Flag to prevent reload when the current search's objectId changes due to a save operation.
  const tempQueryRef = useRef('');
  queryRef.current = query;
  selectedPanelNameRef.current = selectedPanelName;
  explorerFieldsRef.current = explorerFields;
  isLiveTailOnRef.current = isLiveTailOn;
  liveTailTabIdRef.current = liveTailTabId;
  liveTailNameRef.current = liveTailName;
  tempQueryRef.current = tempQuery;

  const findAutoInterval = (start: string = '', end: string = '') => {
    const minInterval = findMinInterval(start, end);

    setTimeIntervalOptions([
      { text: 'Auto', value: 'auto_' + minInterval },
      ...TIME_INTERVAL_OPTIONS,
    ]);
    selectedIntervalRef.current = {
      text: 'Auto',
      value: 'auto_' + minInterval,
    };
    dispatch(
      updateCountDistribution({
        tabId,
        data: {
          selectedInterval: selectedIntervalRef.current.value.replace(/^auto_/, ''),
        },
      })
    );
  };

  const historyFromRedirection = createBrowserHistory();
  useEffect(() => {
    if (!historyFromRedirection.location.state) return;
    const {
      datasourceName,
      datasourceType,
      queryToRun,
      startTimeRange,
      endTimeRange,
    }: any = historyFromRedirection.location.state;
    batch(() => {
      if (datasourceName && datasourceType) {
        dispatch(
          updateSearchMetaData({
            tabId,
            data: {
              datasources: [
                {
                  label: datasourceName,
                  type: datasourceType,
                  value: datasourceName,
                  name: datasourceName,
                },
              ],
            },
          })
        );
      }
      if (queryToRun) {
        dispatch(
          changeQuery({
            tabId,
            query: { [RAW_QUERY]: queryToRun },
          })
        );
        setTempQuery(queryToRun);
      }
      if (startTimeRange && endTimeRange) {
        dispatch(
          changeData({
            tabId,
            data: {
              [SELECTED_DATE_RANGE]: [startTimeRange, endTimeRange],
            },
          })
        );
        setStartTime(startTimeRange);
        setEndTime(endTimeRange);
      }
    });
  }, []);

  useEffect(() => {
    const handleSetBrowserTabFocus = () => {
      if (document.hidden) setBrowserTabFocus(false);
      else setBrowserTabFocus(true);
    };
    document.addEventListener('visibilitychange', handleSetBrowserTabFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleSetBrowserTabFocus);
    };
  }, []);

  useEffect(() => {
    // query assist UI should only be enabled when the feature is enabled and configured.
    if (coreRefs.queryAssistEnabled) {
      http
        .get<{ configured: boolean; error?: string }>(QUERY_ASSIST_API.CONFIGURED)
        .catch(() => {
          console.warn('Failed to check if query assist is configured');
          return { configured: false };
        })
        .then((response) => {
          coreRefs.queryAssistEnabled = response.configured;
          setRefresh({});
        });
    }
  }, []);

  const getErrorHandler = (title: string) => {
    return (error: any) => {
      if (coreRefs.summarizeEnabled) return;
      const formattedError = formatError(error.name, error.message, error.body.message);
      notifications.toasts.addError(formattedError, {
        title,
      });
    };
  };

  const fetchData = async (
    startingTime?: string,
    endingTime?: string,
    setSummaryStatus?: boolean
  ) => {
    const curQuery: IQuery = queryRef.current!;
    await new PPLDataFetcher(
      { ...curQuery },
      { batch, dispatch, changeQuery, changeVizConfig },
      {
        tabId,
        findAutoInterval,
        getCountVisualizations,
        getLiveTail,
        getEvents,
        getErrorHandler,
        getPatterns,
        setDefaultPatternsField,
        timestampUtils,
        curVisId,
        selectedContentTabId,
        queryManager,
        getDefaultVisConfig,
        getAvailableFields,
        setSummaryStatus,
      },
      {
        appBaseQuery,
        query: curQuery,
        startingTime,
        endingTime,
        isLiveTailOn: isLiveTailOnRef.current,
        selectedInterval: selectedIntervalRef,
      },
      notifications
    ).search();
  };

  const isIndexPatternChanged = (currentQuery: string, prevTabQuery: string) =>
    !isEqual(getIndexPatternFromRawQuery(currentQuery), getIndexPatternFromRawQuery(prevTabQuery));

  const updateTabData = async (objectId: string) => {
    savedObjectLoader.current = new ExplorerSavedObjectLoader(
      getSavedObjectsClient({ objectId, objectType: 'savedQuery' }),
      notifications,
      {
        batch,
        dispatch,
        changeQuery,
        updateFields,
        updateTabName,
        updateVizConfig,
      },
      { objectId },
      {
        tabId,
        appLogEvents,
        setStartTime,
        setEndTime,
        queryManager,
        getDefaultVisConfig,
        setSelectedPanelName,
        setCurVisId,
        setTempQuery,
        setMetricChecked,
        setMetricMeasure,
        setSubType,
        setSelectedContentTab,
        fetchData,
        dispatchOnGettingHis,
      }
    );
    savedObjectLoader.current.load();
  };

  // stop polling when cancel or unmounts
  useEffect(() => {
    const sol: ExplorerSavedObjectLoader | undefined = savedObjectLoader.current;
    if (!explorerSearchMeta.isPolling && sol !== undefined && sol.getPollingInstance) {
      sol?.getPollingInstance()!.stopPolling();
      savedObjectLoader.current = undefined;
    }
    return () => {
      if (sol && sol.getPollingInstance) {
        sol?.getPollingInstance()!.stopPolling();
      }
    };
  }, [explorerSearchMeta.isPolling]);

  const prepareAvailability = async () => {
    setSelectedContentTab(TAB_CHART_ID);
    setTriggerAvailability(true);
    await setTempQuery(buildQuery(appBaseQuery, DEFAULT_AVAILABILITY_QUERY));
    await updateQueryInStore(buildQuery(appBaseQuery, DEFAULT_AVAILABILITY_QUERY));
    await handleTimeRangePickerRefresh(true);
  };

  useEffect(() => {
    if (!isEmpty(appBasedRef.current)) {
      if (callback) {
        callback(() => prepareAvailability());
      }
      if (callbackInApp) {
        callbackInApp(() => prepareAvailability());
      }
    }
  }, [appBasedRef.current]);

  useEffect(() => {
    if (
      routerContext &&
      routerContext.searchParams.get(CREATE_TAB_PARAM_KEY) === CREATE_TAB_PARAM[TAB_CHART_ID]
    ) {
      setSelectedContentTab(TAB_CHART_ID);
    }
  }, []);

  useEffect(() => {
    if (savedObjectId && !isObjectIdUpdatedFromSave.current) {
      updateTabData(savedObjectId);
      isObjectIdUpdatedFromSave.current = false;
    }
  }, [savedObjectId]);

  const handleTimePickerChange = async (timeRange: string[]) => {
    if (appLogEvents) {
      setStartTime(timeRange[0]);
      setEndTime(timeRange[1]);
    }
    await dispatch(
      changeData({
        tabId: requestParams.tabId,
        data: { [SELECTED_DATE_RANGE]: timeRange },
      })
    );
  };

  const showPermissionErrorToast = () => {
    setToast(
      'Please ask your administrator to enable Event Analytics for you.',
      'danger',
      <EuiLink href={EVENT_ANALYTICS_DOCUMENTATION_URL} target="_blank">
        Documentation
      </EuiLink>
    );
  };

  const handleTimeRangePickerRefresh = async (
    availability?: boolean,
    setSummaryStatus?: boolean
  ) => {
    handleQuerySearch(availability, setSummaryStatus);
    if (availability !== true && query.rawQuery.match(PATTERNS_REGEX)) {
      let currQuery = query.rawQuery;
      const currPattern = currQuery.match(PATTERNS_EXTRACTOR_REGEX)!.groups!.pattern;
      // Remove existing pattern selection if it exists
      if (currQuery.match(PATTERNS_REGEX)) {
        currQuery = currQuery.replace(PATTERNS_REGEX, '');
      }
      const patternSelectQuery = `${currQuery.trim()} | patterns ${currPattern}`;
      await setTempQuery(patternSelectQuery);
      await updateQueryInStore(patternSelectQuery);
      // Passing in empty string will remove pattern query
      const patternErrorHandler = getErrorHandler('Error fetching patterns');
      getPatterns(
        selectedIntervalRef.current?.value.replace(/^auto_/, '') || 'y',
        patternErrorHandler
      );
    }
  };

  const handleOverrideTimestamp = async (timestamp: IField) => {
    setIsOverridingTimestamp(true);
    await dispatch(
      changeQuery({
        tabId,
        query: { [SELECTED_TIMESTAMP]: timestamp?.name || '' },
      })
    );
    setIsOverridingTimestamp(false);
    handleQuerySearch();
  };

  /**
   * If query assist is enabled, the time range is fixed to
   * QUERY_ASSIST_START_TIME and QUERY_ASSIST_END_TIME and not useful. Return
   * the time range based on aggregation buckets instead.
   *
   * @returns startTime and endTime
   */
  const getTimeChartRange = (): { startTime?: string; endTime?: string } => {
    if (!coreRefs.queryAssistEnabled) return { startTime, endTime };
    const { startTime: start, endTime: end } = getTimeRangeFromCountDistribution(countDistribution);
    return { startTime: start ?? startTime, endTime: end ?? endTime };
  };

  const totalHits: number = useMemo(() => {
    if (isLiveTailOn && countDistribution?.data) {
      const hits = reduce(
        countDistribution.data['count()'],
        (total, n) => {
          return total + n;
        },
        liveHits
      );
      setLiveHits(hits);
      return hits;
    }
    return 0;
  }, [countDistribution?.data]);

  const showTimeBasedComponents =
    (isDefaultDataSourceType || appLogEvents) &&
    query[SELECTED_TIMESTAMP] !== '' &&
    !query[FINAL_QUERY].match(PPL_DESCRIBE_INDEX_REGEX);

  const mainContent = useMemo(() => {
    return (
      <div className="dscWrapper">
        {explorerData && !isEmpty(explorerData.jsonData) ? (
          <EuiFlexGroup direction="column" gutterSize="none">
            {showTimeBasedComponents && (
              <>
                <EuiFlexItem grow={false}>
                  <EuiPanel hasBorder={false} hasShadow={false} paddingSize="s" color="transparent">
                    {countDistribution?.data && !isLiveTailOnRef.current && (
                      <EuiPanel>
                        <Timechart
                          countDistribution={countDistribution}
                          timeIntervalOptions={timeIntervalOptions}
                          onChangeInterval={(selectedIntrv) => {
                            const intervalOptionsIndex = timeIntervalOptions.findIndex(
                              (item) => item.value === selectedIntrv
                            );
                            const intrv = selectedIntrv.replace(/^auto_/, '');
                            dispatch(
                              updateCountDistribution({
                                tabId,
                                data: { selectedInterval: intrv },
                              })
                            );
                            getCountVisualizations(intrv);
                            selectedIntervalRef.current = timeIntervalOptions[intervalOptionsIndex];
                            getPatterns(intrv, getErrorHandler('Error fetching patterns'));
                          }}
                          selectedInterval={
                            countDistribution.selectedInterval || selectedIntervalRef.current?.value
                          }
                          {...getTimeChartRange()}
                        />
                      </EuiPanel>
                    )}
                  </EuiPanel>
                </EuiFlexItem>
              </>
            )}
            {showTimeBasedComponents && (
              <EuiFlexItem grow={false}>
                <EuiPanel hasBorder={false} hasShadow={false} paddingSize="s" color="transparent">
                  <EuiPanel paddingSize="s" style={{ height: '100%' }}>
                    <LogPatterns
                      selectedIntervalUnit={selectedIntervalRef.current}
                      handleTimeRangePickerRefresh={handleTimeRangePickerRefresh}
                    />
                  </EuiPanel>
                </EuiPanel>
              </EuiFlexItem>
            )}
            <EuiFlexItem grow={false}>
              <EuiPanel hasBorder={false} hasShadow={false} paddingSize="s" color="transparent">
                <section
                  className="dscTable dscTableFixedScroll"
                  aria-labelledby="documentsAriaLabel"
                >
                  <h2 className="euiScreenReaderOnly" id="documentsAriaLabel">
                    <FormattedMessage id="discover.documentsAriaLabel" defaultMessage="Documents" />
                  </h2>
                  <div className="dscDiscover">
                    {isLiveTailOnRef.current && (
                      <>
                        <EuiSpacer size="m" />
                        <EuiFlexGroup justifyContent="center" alignItems="center" gutterSize="m">
                          <EuiLoadingSpinner size="l" />
                          <EuiText textAlign="center" data-test-subj="LiveStreamIndicator_on">
                            <strong>&nbsp;&nbsp;Live streaming</strong>
                          </EuiText>
                          <EuiFlexItem grow={false}>
                            <HitsCounter
                              hits={totalHits}
                              showResetButton={false}
                              onResetQuery={() => {}}
                            />
                          </EuiFlexItem>
                          <EuiFlexItem grow={false}>since {liveTimestamp}</EuiFlexItem>
                        </EuiFlexGroup>
                        <EuiSpacer size="m" />
                      </>
                    )}
                    {(explorerData?.datarows?.length || countDistribution.data?.['count()']) && (
                      <DataGrid
                        http={http}
                        pplService={pplService}
                        rows={explorerData.jsonData}
                        rowsAll={explorerData.jsonDataAll}
                        explorerFields={explorerFields}
                        timeStampField={
                          !query[FINAL_QUERY].match(PPL_DESCRIBE_INDEX_REGEX)
                            ? queryRef.current![SELECTED_TIMESTAMP]
                            : ''
                        }
                        rawQuery={appBasedRef.current || queryRef.current![RAW_QUERY]}
                        totalHits={
                          showTimeBasedComponents
                            ? sum(countDistribution.data?.['count()']) ||
                              explorerData.datarows.length
                            : explorerData.datarows.length
                        }
                        requestParams={requestParams}
                        startTime={startTime}
                        endTime={endTime}
                        isDefaultDataSource={
                          explorerSearchMeta?.datasources?.[0]?.type === DEFAULT_DATA_SOURCE_TYPE
                        }
                      />
                    )}
                    <a tabIndex={0} id="discoverBottomMarker">
                      &#8203;
                    </a>
                  </div>
                </section>
              </EuiPanel>
            </EuiFlexItem>
          </EuiFlexGroup>
        ) : (
          <NoResults tabId={tabId} eventsLoading={eventsLoading} />
        )}
      </div>
    );
  }, [
    isPanelTextFieldInvalid,
    explorerData,
    explorerFields,
    countDistribution,
    explorerVisualizations,
    isOverridingTimestamp,
    query,
    isLiveTailOnRef.current,
    isQueryRunning,
    eventsLoading,
  ]);

  const visualizationSettings = !isEmpty(userVizConfigs[curVisId])
    ? { ...userVizConfigs[curVisId] }
    : {
        dataConfig: getDefaultVisConfig(queryManager.queryParser().parse(tempQuery).getStats()),
      };

  const visualizations: IVisualizationContainerProps = useMemo(() => {
    return getVizContainerProps({
      vizId: curVisId,
      rawVizData: explorerVisualizations,
      query,
      indexFields: explorerFields,
      userConfigs: {
        ...visualizationSettings,
        ...processMetricsData(explorerData.schema),
      },
      appData: { fromApp: appLogEvents },
      explorer: { explorerData, explorerFields, query, http, pplService },
    });
  }, [curVisId, explorerVisualizations, explorerFields, query, userVizConfigs]);

  const callbackForConfig = (childFunc: () => void) => {
    if (childFunc && triggerAvailability) {
      childFunc();
      setTriggerAvailability(false);
    }
  };

  const explorerVis = useMemo(() => {
    return isDefaultDataSourceType || appLogEvents ? (
      <ExplorerVisualizations
        query={query}
        curVisId={curVisId}
        setCurVisId={setCurVisId}
        explorerFields={explorerFields}
        explorerVis={explorerVisualizations}
        explorerData={explorerData}
        visualizations={visualizations}
        handleOverrideTimestamp={handleOverrideTimestamp}
        callback={callbackForConfig}
        queryManager={queryManager}
      />
    ) : (
      <DirectQueryVisualization
        currentDataSource={
          explorerSearchMeta.datasources ? explorerSearchMeta.datasources?.[0]?.label : ''
        }
      />
    );
  }, [
    query,
    curVisId,
    explorerFields,
    explorerVisualizations,
    explorerData,
    visualizations,
    explorerSearchMeta.datasources,
  ]);

  const contentTabs = [
    {
      id: TAB_EVENT_ID,
      name: getContentTabTitle(TAB_EVENT_ID, TAB_EVENT_TITLE),
      content: mainContent,
    },
    {
      id: TAB_CHART_ID,
      name: getContentTabTitle(TAB_CHART_ID, TAB_CHART_TITLE),
      content: explorerVis,
    },
  ];

  const handleContentTabClick = (selectedTab: IQueryTab) => setSelectedContentTab(selectedTab.id);

  const updateQueryInStore = async (updateQuery: string) => {
    await dispatch(
      changeQuery({
        tabId,
        query: { [RAW_QUERY]: updateQuery.replaceAll(PPL_NEWLINE_REGEX, '') },
      })
    );
  };

  const handleQuerySearch = async (availability?: boolean, setSummaryStatus?: boolean) => {
    setEventsLoading(true);
    // clear previous selected timestamp when index pattern changes
    const searchedQuery = tempQueryRef.current;
    if (
      isIndexPatternChanged(searchedQuery, query[RAW_QUERY]) &&
      query[SELECTED_TIMESTAMP] !== ''
    ) {
      await dispatch(
        changeQuery({
          tabId,
          query: {
            [SELECTED_TIMESTAMP]: '',
          },
        })
      );
      await setDefaultPatternsField('', '');
    }
    if (availability !== true) {
      await updateQueryInStore(searchedQuery);
    }
    await fetchData(undefined, undefined, setSummaryStatus).finally(() => {
      setEventsLoading(false);
    });
  };

  const handleQueryChange = async (newQuery: string) => setTempQuery(newQuery);

  const handleSavingObject = useCallback(() => {
    const isOnEventPage = isEqual(selectedContentTabId, TAB_EVENT_ID);
    const isObjTypeMatchQuery = isEqual(query[SAVED_OBJECT_TYPE], SAVED_QUERY);
    const isObjTypeMatchVis = isEqual(query[SAVED_OBJECT_TYPE], SAVED_VISUALIZATION);
    const isTabHasObjID = !isEmpty(query[SAVED_OBJECT_ID]);
    const commonParams = getSavingCommonParams(
      query,
      appBaseQuery,
      explorerFields,
      selectedPanelNameRef.current,
      explorerSearchMeta
    );

    // Set the flag to differentiate between an object save action and a load action
    isObjectIdUpdatedFromSave.current = true;

    let soClient;
    if (isOnEventPage) {
      if (isTabHasObjID && isObjTypeMatchQuery) {
        soClient = new SaveAsCurrentQuery(
          { tabId, notifications },
          { dispatch, updateTabName },
          getSavedObjectsClient({
            objectId: query[SAVED_OBJECT_ID],
            objectType: 'savedQuery',
          }),
          {
            ...commonParams,
            objectId: query[SAVED_OBJECT_ID],
          }
        );
      } else {
        soClient = new SaveAsNewQuery(
          { tabId, history, notifications, showPermissionErrorToast },
          { batch, dispatch, changeQuery, updateTabName },
          OSDSavedSearchClient.getInstance(),
          { ...commonParams }
        );
      }
    } else {
      if (isTabHasObjID && isObjTypeMatchVis && subType !== PPL_METRIC_SUBTYPE) {
        soClient = new SaveAsCurrentVisualization(
          { tabId, history, notifications, showPermissionErrorToast },
          { batch, dispatch, changeQuery, updateTabName },
          getSavedObjectsClient({
            objectId: query[SAVED_OBJECT_ID],
            objectType: 'savedVisualization',
          }),
          new PanelSavedObjectClient(http),
          {
            ...commonParams,
            objectId: query[SAVED_OBJECT_ID],
            type: curVisId,
            userConfigs: JSON.stringify(userVizConfigs[curVisId]),
            description: userVizConfigs[curVisId]?.dataConfig?.panelOptions?.description || '',
            subType,
            selectedPanels: selectedCustomPanelOptions,
          }
        );
      } else {
        soClient = new SaveAsNewVisualization(
          {
            tabId,
            history,
            notifications,
            showPermissionErrorToast,
            appLogEvents,
            addVisualizationToPanel,
          },
          { batch, dispatch, changeQuery, updateTabName },
          OSDSavedVisualizationClient.getInstance(),
          new PanelSavedObjectClient(http),
          {
            ...commonParams,
            type: curVisId,
            applicationId: appId,
            userConfigs: JSON.stringify(userVizConfigs[curVisId]),
            description: userVizConfigs[curVisId]?.dataConfig?.panelOptions?.description || '',
            subType,
            selectedPanels: selectedCustomPanelOptions,
          }
        );
      }
    }
    soClient.save();
  }, [
    query,
    curVisId,
    userVizConfigs,
    selectedContentTabId,
    explorerFields,
    subType,
    selectedCustomPanelOptions,
    explorerSearchMeta,
    selectedIntervalRef.current,
    countDistribution,
  ]);

  const liveTailLoop = async (
    name: string,
    startingTime: string,
    endingTime: string,
    delayTime: number
  ) => {
    setLiveTailName(name);
    setLiveTailTabId((curSelectedTabId.current as unknown) as string);
    setIsLiveTailOn(true);
    setToast('Live tail On', 'success', '', 'right', 2000);
    setIsLiveTailPopoverOpen(false);
    setLiveTimestamp(
      dateMath.parse(endingTime, { roundUp: true })?.utc().format(DATE_PICKER_FORMAT) || ''
    );
    setLiveHits(0);
    await sleep(2000);
    const curLiveTailname = liveTailNameRef.current;
    while (isLiveTailOnRef.current === true && curLiveTailname === liveTailNameRef.current) {
      handleLiveTailSearch(startingTime, endingTime);
      if (liveTailTabIdRef.current !== curSelectedTabId.current) {
        setIsLiveTailOn(false);
        isLiveTailOnRef.current = false;
        setLiveTailName('Live');
        setLiveHits(0);
      }
      await sleep(delayTime);
    }
  };

  const stopLive = () => {
    setLiveTailName('Live');
    setIsLiveTailOn(false);
    setLiveHits(0);
    setIsLiveTailPopoverOpen(false);
    if (isLiveTailOnRef.current) setToast('Live tail Off', 'danger', '', 'right', 2000);
  };

  useEffect(() => {
    if (isEqual(selectedContentTabId, TAB_CHART_ID) || !browserTabFocus) {
      stopLive();
    }
  }, [selectedContentTabId, browserTabFocus]);

  // stop live tail if the page is moved using breadcrumbs
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      stopLive();
    }
  }).observe(document, { subtree: true, childList: true });

  const popoverItems: ReactElement[] = LIVE_OPTIONS.map((e) => {
    return (
      <EuiContextMenuItem
        key={e.label}
        onClick={async () => {
          liveTailLoop(e.label, e.startTime, LIVE_END_TIME, e.delayTime);
        }}
        data-test-subj={'eventLiveTail__delay' + e.label}
      >
        {e.label}
      </EuiContextMenuItem>
    );
  });

  const handleLiveTailSearch = useCallback(
    async (startingTime: string, endingTime: string) => {
      await updateQueryInStore(tempQuery);
      fetchData(startingTime, endingTime);
    },
    [tempQuery]
  );

  const processAppAnalyticsQuery = (queryString: string) => {
    if (!queryString.includes(appBaseQuery)) return queryString;
    if (queryString.includes(appBaseQuery) && queryString.includes('|'))
      // Some scenarios have ' | ' after base query and some have '| '
      return queryString.replace(' | ', '| ').replace(appBaseQuery + '| ', '');
    return '';
  };

  return (
    <TabContext.Provider
      value={{
        tabId,
        curVisId,
        changeVisualizationConfig,
        setToast,
        pplService,
        notifications,
        dispatch,
        handleQueryChange,
      }}
    >
      <EuiPage className="deLayout" paddingSize="none">
        <EuiPageSideBar className="explorerSidebar" sticky>
          <EuiSplitPanel.Outer className="eui-yScroll" hasBorder={true} borderRadius="none">
            {!appLogEvents && (
              <EuiSplitPanel.Inner paddingSize="s" color="subdued" grow={false}>
                <DataSourceSelection tabId={initialTabId} />
              </EuiSplitPanel.Inner>
            )}
            <EuiSplitPanel.Inner paddingSize="none" color="subdued" className="eui-yScroll">
              <ObservabilitySideBar
                tabId={initialTabId}
                pplService={pplService}
                notifications={notifications}
              />
            </EuiSplitPanel.Inner>
          </EuiSplitPanel.Outer>
        </EuiPageSideBar>
        <EuiPageBody className="deLayout__canvas">
          <div
            className={`obsExplorer dscAppContainer${
              uiSettingsService.get('theme:darkMode') && ' explorer-dark'
            }`}
          >
            <EuiFlexGroup direction="row">
              <EuiFlexItem>
                <SearchBar
                  key="search-component"
                  query={appLogEvents ? processAppAnalyticsQuery(tempQuery) : query[RAW_QUERY]}
                  tempQuery={tempQuery}
                  handleQueryChange={handleQueryChange}
                  handleQuerySearch={handleQuerySearch}
                  dslService={dslService}
                  startTime={startTime}
                  endTime={endTime}
                  setStartTime={setStartTime}
                  setEndTime={setEndTime}
                  handleTimePickerChange={(timeRange: string[]) =>
                    handleTimePickerChange(timeRange)
                  }
                  selectedPanelName={selectedPanelNameRef.current}
                  selectedCustomPanelOptions={selectedCustomPanelOptions}
                  setSelectedPanelName={setSelectedPanelName}
                  setSelectedCustomPanelOptions={setSelectedCustomPanelOptions}
                  handleSavingObject={handleSavingObject}
                  isPanelTextFieldInvalid={isPanelTextFieldInvalid}
                  savedObjects={savedObjects}
                  showSavePanelOptionsList={isEqual(selectedContentTabId, TAB_CHART_ID)}
                  handleTimeRangePickerRefresh={handleTimeRangePickerRefresh}
                  isLiveTailPopoverOpen={isLiveTailPopoverOpen}
                  closeLiveTailPopover={() => setIsLiveTailPopoverOpen(false)}
                  popoverItems={popoverItems}
                  isLiveTailOn={isLiveTailOnRef.current}
                  selectedSubTabId={selectedContentTabId}
                  searchBarConfigs={searchBarConfigs}
                  getSuggestions={parseGetSuggestions}
                  onItemSelect={onItemSelect}
                  tabId={tabId}
                  baseQuery={appBaseQuery}
                  stopLive={stopLive}
                  setIsLiveTailPopoverOpen={setIsLiveTailPopoverOpen}
                  liveTailName={liveTailNameRef.current}
                  curVisId={curVisId}
                  setSubType={setSubType}
                  http={http}
                  setIsQueryRunning={setIsQueryRunning}
                  isAppAnalytics={appLogEvents}
                  pplService={pplService}
                />
                {explorerSearchMeta.isPolling ? (
                  <DirectQueryRunning tabId={tabId} />
                ) : (
                  <EuiTabbedContent
                    className="mainContentTabs"
                    initialSelectedTab={contentTabs[0]}
                    selectedTab={contentTabs.find((tab) => tab.id === selectedContentTabId)}
                    onTabClick={(selectedTab: EuiTabbedContentTab) =>
                      handleContentTabClick(selectedTab)
                    }
                    tabs={contentTabs}
                    size="s"
                  />
                )}
              </EuiFlexItem>
            </EuiFlexGroup>
          </div>
        </EuiPageBody>
      </EuiPage>
    </TabContext.Provider>
  );
};
