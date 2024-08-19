/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import '@algolia/autocomplete-theme-classic';
import {
  EuiBadge,
  EuiSmallButton,
  EuiButton,
  EuiButtonEmpty,
  EuiCompressedComboBox,
  EuiComboBoxOptionOption,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPopover,
  EuiPopoverFooter,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { isEqual } from 'lodash';
import React, { useEffect, useState } from 'react';
import { batch, useDispatch, useSelector } from 'react-redux';
import { QUERY_LANGUAGE } from '../../../../common/constants/data_sources';
import {
  APP_ANALYTICS_TAB_ID_REGEX,
  INDEX,
  OLLY_QUERY_ASSISTANT,
  RAW_QUERY,
} from '../../../../common/constants/explorer';
import {
  PPL_SPAN_REGEX,
  QUERY_ASSIST_END_TIME,
  QUERY_ASSIST_START_TIME,
} from '../../../../common/constants/shared';
import { uiSettingsService } from '../../../../common/utils';
import { useFetchEvents } from '../../../components/event_analytics/hooks';
import { usePolling } from '../../../components/hooks/use_polling';
import { coreRefs } from '../../../framework/core_refs';
import { SQLService } from '../../../services/requests/sql';
import {
  useCatIndices,
  useGetIndexPatterns,
} from '../../event_analytics/explorer/query_assist/hooks';
import { SavePanel } from '../../event_analytics/explorer/save_panel';
import {
  resetSummary,
  selectQueryAssistantSummarization,
} from '../../event_analytics/redux/slices/query_assistant_summarization_slice';
import { reset, selectQueryResult } from '../../event_analytics/redux/slices/query_result_slice';
import {
  changeData,
  changeQuery,
  selectQueries,
} from '../../event_analytics/redux/slices/query_slice';
import { update as updateSearchMetaData } from '../../event_analytics/redux/slices/search_meta_data_slice';
import { PPLReferenceFlyout } from '../helpers';
import { LiveTailButton, StopLiveButton } from '../live_tail/live_tail_button';
import { Autocomplete } from './autocomplete';
import { DatePicker } from './date_picker';
import { QueryArea } from './query_area';
import { QueryAssistSummarization } from './query_assist_summarization';
import './search.scss';

export interface IQueryBarProps {
  query: string;
  tempQuery: string;
  handleQueryChange: (query: string) => void;
  handleQuerySearch: () => void;
  dslService: any;
}

export interface IDatePickerProps {
  startTime: string;
  endTime: string;
  setStartTime: (start: string) => void;
  setEndTime: (end: string) => void;
  setTimeRange: () => void;
  setIsOutputStale: () => void;
  handleTimePickerChange: (timeRange: string[]) => any;
  handleTimeRangePickerRefresh: () => any;
  isAppAnalytics: boolean;
}

export const Search = (props: any) => {
  const {
    query,
    tempQuery,
    handleQueryChange,
    handleTimePickerChange,
    dslService,
    startTime,
    endTime,
    setStartTime,
    setEndTime,
    setIsOutputStale,
    selectedPanelName,
    selectedCustomPanelOptions,
    setSelectedPanelName,
    setSelectedCustomPanelOptions,
    handleSavingObject,
    isPanelTextFieldInvalid,
    savedObjects,
    showSavePanelOptionsList,
    showSaveButton = true,
    handleTimeRangePickerRefresh,
    isLiveTailPopoverOpen,
    closeLiveTailPopover,
    popoverItems,
    isLiveTailOn,
    selectedSubTabId,
    searchBarConfigs = {},
    getSuggestions,
    onItemSelect,
    tabId = '',
    baseQuery = '',
    stopLive,
    setIsLiveTailPopoverOpen,
    liveTailName,
    curVisId,
    setSubType,
    setIsQueryRunning,
    isAppAnalytics,
    pplService,
  } = props;

  const queryRedux = useSelector(selectQueries)[tabId];
  const queryResults = useSelector(selectQueryResult)[tabId];
  const queryAssistantSummarization = useSelector(selectQueryAssistantSummarization)[tabId];
  const dispatch = useDispatch();
  const appLogEvents = tabId.match(APP_ANALYTICS_TAB_ID_REGEX);
  const [isSavePanelOpen, setIsSavePanelOpen] = useState(false);
  const [_isLanguagePopoverOpen, setLanguagePopoverOpen] = useState(false);
  const [isFlyoutVisible, setIsFlyoutVisible] = useState(false);
  const [queryLang, setQueryLang] = useState(QUERY_LANGUAGE.PPL);
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const sqlService = new SQLService(coreRefs.http);
  const { application } = coreRefs;
  const [nlqInput, setNlqInput] = useState('');

  const showQueryArea = !appLogEvents && coreRefs.queryAssistEnabled;

  const {
    data: pollingResult,
    loading: _pollingLoading,
    error: pollingError,
    startPolling: _startPolling,
    stopPolling,
  } = usePolling<any, any>((params) => {
    return sqlService.fetchWithJobId(params);
  }, 5000);

  const requestParams = { tabId };
  const { dispatchOnGettingHis } = useFetchEvents({
    pplService: new SQLService(coreRefs.http),
    requestParams,
  });
  const { getAvailableFields } = useFetchEvents({
    pplService,
    requestParams,
  });

  const closeFlyout = () => {
    setIsFlyoutVisible(false);
  };

  const showFlyout = () => {
    setIsFlyoutVisible(true);
  };

  let flyout;
  if (isFlyoutVisible) {
    flyout = <PPLReferenceFlyout module="explorer" closeFlyout={closeFlyout} />;
  }

  const Savebutton = (
    <EuiSmallButton
      iconSide="right"
      onClick={() => {
        setIsSavePanelOpen((staleState) => {
          return !staleState;
        });
      }}
      data-test-subj="eventExplorer__saveManagementPopover"
      iconType="arrowDown"
    >
      Save
    </EuiSmallButton>
  );

  const liveButton = (
    <LiveTailButton
      isLiveTailOn={isLiveTailOn}
      setIsLiveTailPopoverOpen={setIsLiveTailPopoverOpen}
      liveTailName={liveTailName}
      isLiveTailPopoverOpen={isLiveTailPopoverOpen}
      dataTestSubj="eventLiveTail"
    />
  );

  const handleQueryLanguageChange = (lang: string) => {
    if (lang === QUERY_LANGUAGE.DQL) {
      redirectToDiscover();
      return;
    }
    dispatch(
      updateSearchMetaData({
        tabId,
        data: { lang },
      })
    );
    setQueryLang(lang);
    closeLanguagePopover();
  };

  const closeLanguagePopover = () => {
    setLanguagePopoverOpen(false);
  };

  const languagePopOverItems = [
    <EuiContextMenuItem
      key={QUERY_LANGUAGE.SQL}
      onClick={() => handleQueryLanguageChange(QUERY_LANGUAGE.PPL)}
    >
      PPL
    </EuiContextMenuItem>,
    <EuiContextMenuItem
      key={QUERY_LANGUAGE.PPL}
      onClick={() => handleQueryLanguageChange(QUERY_LANGUAGE.DQL)}
    >
      DQL - Opens in Discover
    </EuiContextMenuItem>,
  ];

  const onQuerySearch = () => {
    handleTimeRangePickerRefresh();
  };

  useEffect(() => {
    if (pollingResult && (pollingResult.status === 'SUCCESS' || pollingResult.datarows)) {
      // update page with data
      dispatchOnGettingHis(pollingResult, '');
      // stop polling
      stopPolling();
      setIsQueryRunning(false);
    }
  }, [pollingResult, pollingError]);

  useEffect(() => {
    // set index and olly query assistant question if changed elsewhere
    if (!queryRedux.ollyQueryAssistant) return;
    if (queryRedux.index.length > 0) {
      const reduxIndex = [{ label: queryRedux.index }];
      setSelectedIndex(reduxIndex);
      // sets the editor text and populates sidebar field for a particular index upon initialization
      const indexQuery = `source = ${reduxIndex[0].label}`;
      handleQueryChange(indexQuery);
      getAvailableFields(indexQuery);
    }
    if (queryRedux.ollyQueryAssistant.length > 0) {
      setNlqInput(queryRedux.ollyQueryAssistant);
      // remove index and olly query assistant
      dispatch(
        changeData({
          tabId: props.tabId,
          data: {
            [INDEX]: '',
            [OLLY_QUERY_ASSISTANT]: '',
          },
        })
      );
    }
  }, [queryRedux.index, queryRedux.ollyQueryAssistant]);

  const runChanges = () => {
    batch(() => {
      dispatch(reset({ tabId }));
      dispatch(resetSummary({ tabId }));
      dispatch(changeQuery({ tabId, query: { [RAW_QUERY]: tempQuery } }));
    });
    onQuerySearch(queryLang);
    if (coreRefs.queryAssistEnabled) {
      handleTimePickerChange([QUERY_ASSIST_START_TIME, QUERY_ASSIST_END_TIME]);
    } else {
      handleTimePickerChange([startTime, endTime]);
    }
    setNeedsUpdate(false);
  };

  //  STATE FOR LANG PICKER AND INDEX PICKER
  const [selectedIndex, setSelectedIndex] = useState<EuiComboBoxOptionOption[]>([]);
  const { data: indices, loading: indicesLoading } = useCatIndices();
  const { data: indexPatterns, loading: indexPatternsLoading } = useGetIndexPatterns();
  const indicesAndIndexPatterns =
    indexPatterns && indices
      ? [...indexPatterns, ...indices].filter(
          (v1, index, array) => array.findIndex((v2) => v1.label === v2.label) === index
        )
      : [];
  const loading = indicesLoading || indexPatternsLoading;

  useEffect(() => {
    if (selectedIndex.length || !indicesAndIndexPatterns.length) return;
    // pre-fill selected index with sample logs or other sample data index
    const sampleLogOption = indicesAndIndexPatterns.find(
      (option) => option.label === 'opensearch_dashboards_sample_data_logs'
    );
    if (sampleLogOption) {
      setSelectedIndex([sampleLogOption]);
      return;
    }
    const sampleDataOption = indicesAndIndexPatterns.find((option) =>
      option.label.startsWith('opensearch_dashboards_sample_data_')
    );
    if (sampleDataOption) setSelectedIndex([sampleDataOption]);
  }, [indicesAndIndexPatterns]);

  const onLanguagePopoverClick = () => {
    setLanguagePopoverOpen(!_isLanguagePopoverOpen);
  };

  const languagePopOverButton = (
    <EuiSmallButton iconType="arrowDown" iconSide="right" onClick={onLanguagePopoverClick} color="text">
      {queryLang}
    </EuiSmallButton>
  );

  const redirectToDiscover = () => {
    application!.navigateToUrl('../app/data-explorer/discover');
  };

  return (
    <div className="globalQueryBar">
      <EuiFlexGroup direction="column" gutterSize="s">
        <EuiFlexItem>
          <EuiFlexGroup gutterSize="s" justifyContent="flexEnd" alignItems="center" wrap>
            {appLogEvents && (
              <EuiFlexItem style={{ minWidth: 110 }} grow={false}>
                <EuiToolTip position="top" content={baseQuery}>
                  <EuiBadge className="base-query-popover" color="hollow" style={{ marginTop: 0 }}>
                    Base Query
                  </EuiBadge>
                </EuiToolTip>
              </EuiFlexItem>
            )}
            {!appLogEvents && (
              <>
                <EuiFlexItem key="lang-selector" className="search-area lang-selector" grow={false}>
                  <EuiPopover
                    id="smallContextMenuExample"
                    button={languagePopOverButton}
                    isOpen={_isLanguagePopoverOpen}
                    closePopover={closeLanguagePopover}
                    panelPaddingSize="none"
                    anchorPosition="downLeft"
                  >
                    <EuiContextMenuPanel size="m" items={languagePopOverItems} />
                  </EuiPopover>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiIcon
                    className={`${
                      uiSettingsService.get('theme:darkMode') ? 'ppl-link-dark' : 'ppl-link-light'
                    }`}
                    type="questionInCircle"
                    size="l"
                    onClick={() => showFlyout()}
                    color="#159D8D"
                  />
                </EuiFlexItem>
                {coreRefs.queryAssistEnabled && (
                  <EuiFlexItem>
                    <EuiCompressedComboBox
                      placeholder="Select an index"
                      isClearable={false}
                      prepend={<EuiText>Index</EuiText>}
                      singleSelection={{ asPlainText: true }}
                      isLoading={loading}
                      options={indicesAndIndexPatterns}
                      selectedOptions={selectedIndex}
                      onChange={(index) => {
                        // clear previous state
                        batch(() => {
                          dispatch(reset({ tabId }));
                          dispatch(resetSummary({ tabId }));
                        });
                        // change the query in the editor to be just source=
                        const indexQuery = `source = ${index[0].label}`;
                        handleQueryChange(indexQuery);
                        // get the fields into the sidebar
                        getAvailableFields(indexQuery);
                        setSelectedIndex(index);
                      }}
                    />
                  </EuiFlexItem>
                )}
              </>
            )}
            {!showQueryArea && (
              <EuiFlexItem
                key="search-bar"
                className="search-area"
                grow={5}
                style={{ minWidth: 400 }}
              >
                <Autocomplete
                  key={'autocomplete-search-bar'}
                  query={query}
                  tempQuery={tempQuery}
                  baseQuery={baseQuery}
                  handleQueryChange={handleQueryChange}
                  handleQuerySearch={runChanges}
                  dslService={dslService}
                  getSuggestions={getSuggestions}
                  onItemSelect={onItemSelect}
                  tabId={tabId}
                />
                <EuiBadge
                  className={`ppl-link ${
                    uiSettingsService.get('theme:darkMode') ? 'ppl-link-dark' : 'ppl-link-light'
                  }`}
                  color="hollow"
                  onClick={() => showFlyout()}
                  onClickAriaLabel={'pplLinkShowFlyout'}
                >
                  PPL
                </EuiBadge>
              </EuiFlexItem>
            )}
            <EuiFlexItem grow={false} />
            {!(queryRedux.selectedTimestamp === '' && queryResults?.datarows) && ( // index with no timestamp, dont show timepicker
              <EuiFlexItem className="euiFlexItem--flexGrowZero event-date-picker" grow={false}>
                {!isLiveTailOn && !coreRefs.queryAssistEnabled && (
                  <DatePicker
                    startTime={startTime}
                    endTime={endTime}
                    setStartTime={setStartTime}
                    setEndTime={setEndTime}
                    setIsOutputStale={setIsOutputStale}
                    liveStreamChecked={props.liveStreamChecked}
                    onLiveStreamChange={props.onLiveStreamChange}
                    handleTimePickerChange={(tRange: string[]) => {
                      // modifies run button to look like the update button, if there is a time change, disables timepicker setting update if timepicker is disabled
                      setNeedsUpdate(
                        !showQueryArea && // keeps statement false if using query assistant ui, timepicker shouldn't change run button
                          !(tRange[0] === startTime && tRange[1] === endTime) // checks to see if the time given is different from prev
                      );
                      // keeps the time range change local, to be used when update pressed
                      setStartTime(tRange[0]);
                      setEndTime(tRange[1]);
                    }}
                    handleTimeRangePickerRefresh={() => {
                      onQuerySearch(queryLang);
                    }}
                    isAppAnalytics={isAppAnalytics}
                  />
                )}
              </EuiFlexItem>
            )}
            {!showQueryArea && (
              <EuiFlexItem grow={false}>
                <EuiToolTip position="bottom" content={needsUpdate ? 'Click to apply' : false}>
                  <EuiSmallButton
                    color={needsUpdate ? 'success' : 'primary'}
                    iconType={needsUpdate ? 'kqlFunction' : 'play'}
                    fill
                    onClick={runChanges}
                    data-test-subj="superDatePickerApplyTimeButton" // mimic actual timepicker button
                  >
                    {needsUpdate ? 'Update' : 'Run'}
                  </EuiSmallButton>
                </EuiToolTip>
              </EuiFlexItem>
            )}
            {!showQueryArea && showSaveButton && !showSavePanelOptionsList && (
              <EuiFlexItem className="euiFlexItem--flexGrowZero live-tail">
                <EuiPopover
                  panelPaddingSize="none"
                  button={liveButton}
                  isOpen={isLiveTailPopoverOpen}
                  closePopover={closeLiveTailPopover}
                >
                  <EuiContextMenuPanel items={popoverItems} />
                </EuiPopover>
              </EuiFlexItem>
            )}
            {!showQueryArea && isLiveTailOn && (
              <EuiFlexItem grow={false}>
                <StopLiveButton StopLive={stopLive} dataTestSubj="eventLiveTail__off" />
              </EuiFlexItem>
            )}
            {showSaveButton && searchBarConfigs[selectedSubTabId]?.showSaveButton && (
              <>
                <EuiFlexItem key={'search-save-'} className="euiFlexItem--flexGrowZero">
                  <EuiPopover
                    button={Savebutton}
                    isOpen={isSavePanelOpen}
                    closePopover={() => setIsSavePanelOpen(false)}
                  >
                    <SavePanel
                      selectedOptions={selectedCustomPanelOptions}
                      handleNameChange={setSelectedPanelName}
                      handleOptionChange={setSelectedCustomPanelOptions}
                      savedObjects={savedObjects}
                      isTextFieldInvalid={isPanelTextFieldInvalid}
                      savePanelName={selectedPanelName}
                      showOptionList={
                        showSavePanelOptionsList &&
                        searchBarConfigs[selectedSubTabId]?.showSavePanelOptionsList
                      }
                      curVisId={curVisId}
                      setSubType={setSubType}
                      isSaveAsMetricEnabled={
                        isEqual(curVisId, 'line') && tempQuery.match(PPL_SPAN_REGEX) !== null
                      }
                    />
                    <EuiPopoverFooter>
                      <EuiFlexGroup justifyContent="flexEnd">
                        <EuiFlexItem grow={false}>
                          <EuiButtonEmpty
                            size="s"
                            onClick={() => setIsSavePanelOpen(false)}
                            data-test-subj="eventExplorer__querySaveCancel"
                          >
                            Cancel
                          </EuiButtonEmpty>
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiButton
                            size="s"
                            fill
                            onClick={() => {
                              handleSavingObject();
                              setIsSavePanelOpen(false);
                            }}
                            data-test-subj="eventExplorer__querySaveConfirm"
                          >
                            Save
                          </EuiButton>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiPopoverFooter>
                  </EuiPopover>
                </EuiFlexItem>
              </>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
        {showQueryArea && (
          <>
            <EuiFlexItem>
              <QueryArea
                tabId={tabId}
                handleQueryChange={handleQueryChange}
                handleTimePickerChange={handleTimePickerChange}
                handleTimeRangePickerRefresh={handleTimeRangePickerRefresh}
                runQuery={query}
                tempQuery={tempQuery}
                setNeedsUpdate={setNeedsUpdate}
                selectedIndex={selectedIndex}
                nlqInput={nlqInput}
                setNlqInput={setNlqInput}
                pplService={pplService}
                runChanges={runChanges}
              />
            </EuiFlexItem>
            {(queryAssistantSummarization?.summary?.length > 0 ||
              queryAssistantSummarization?.summaryLoading) && (
              <EuiFlexItem grow={false}>
                <QueryAssistSummarization
                  queryAssistantSummarization={queryAssistantSummarization}
                  setNlqInput={setNlqInput}
                  showFlyout={showFlyout}
                />
              </EuiFlexItem>
            )}
          </>
        )}
      </EuiFlexGroup>
      {flyout}
    </div>
  );
};
