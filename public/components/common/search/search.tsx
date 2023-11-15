/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './search.scss';

import '@algolia/autocomplete-theme-classic';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiComboBox,
  EuiComboBoxOptionOption,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPopover,
  EuiPopoverFooter,
  EuiSuperSelect,
  EuiSuperSelectOption,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { isEqual } from 'lodash';
import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { APP_ANALYTICS_TAB_ID_REGEX } from '../../../../common/constants/explorer';
import { PPL_SPAN_REGEX } from '../../../../common/constants/shared';
import { uiSettingsService } from '../../../../common/utils';
import { useFetchEvents } from '../../../components/event_analytics/hooks';
import { usePolling } from '../../../components/hooks/use_polling';
import { coreRefs } from '../../../framework/core_refs';
import { SQLService } from '../../../services/requests/sql';
import { SavePanel } from '../../event_analytics/explorer/save_panel';
import { update as updateSearchMetaData } from '../../event_analytics/redux/slices/search_meta_data_slice';
import { PPLReferenceFlyout } from '../helpers';
import { LiveTailButton, StopLiveButton } from '../live_tail/live_tail_button';
import { Autocomplete } from './autocomplete';
import { DatePicker } from './date_picker';
import { QUERY_LANGUAGE } from '../../../../common/constants/data_sources';
import { QueryArea } from './query_area';
import './search.scss';
import { useCatIndices, useGetIndexPatterns } from '../../event_analytics/explorer/llm/input';
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
  setStartTime: () => void;
  setEndTime: () => void;
  setTimeRange: () => void;
  setIsOutputStale: () => void;
  handleTimePickerChange: (timeRange: string[]) => any;
  handleTimeRangePickerRefresh: () => any;
}

export const Search = (props: any) => {
  const {
    query,
    tempQuery,
    handleQueryChange,
    handleQuerySearch,
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
  } = props;

  const dispatch = useDispatch();
  const appLogEvents = tabId.match(APP_ANALYTICS_TAB_ID_REGEX);
  const [isSavePanelOpen, setIsSavePanelOpen] = useState(false);
  const [isLanguagePopoverOpen, setLanguagePopoverOpen] = useState(false);
  const [isFlyoutVisible, setIsFlyoutVisible] = useState(false);
  const [isQueryBarVisible, setIsQueryBarVisible] = useState(!coreRefs.assistantEnabled);
  const [queryLang, setQueryLang] = useState(QUERY_LANGUAGE.PPL);
  const [timeRange, setTimeRange] = useState(['now-5y', 'now']); // default time range
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [fillRun, setFillRun] = useState(false);
  const sqlService = new SQLService(coreRefs.http);
  const { application } = coreRefs;

  const {
    data: pollingResult,
    loading: pollingLoading,
    error: pollingError,
    startPolling,
    stopPolling,
  } = usePolling<any, any>((params) => {
    return sqlService.fetchWithJobId(params);
  }, 5000);

  const requestParams = { tabId };
  const { dispatchOnGettingHis } = useFetchEvents({
    pplService: new SQLService(coreRefs.http),
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
    <EuiButton
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
    </EuiButton>
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
      application!.navigateToUrl('../app/data-explorer/discover');
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

  const onLanguagePopoverClick = () => {
    setLanguagePopoverOpen(!isLanguagePopoverOpen);
  };

  const closeLanguagePopover = () => {
    setLanguagePopoverOpen(false);
  };

  const languageOptions: EuiSuperSelectOption<QUERY_LANGUAGE>[] = [
    { value: QUERY_LANGUAGE.PPL, inputDisplay: <EuiText>PPL</EuiText> },
    { value: QUERY_LANGUAGE.DQL, inputDisplay: <EuiText>DQL</EuiText> },
  ];

  const languagePopOverItems = [
    <EuiContextMenuItem
      key={QUERY_LANGUAGE.PPL}
      onClick={() => handleQueryLanguageChange(QUERY_LANGUAGE.PPL)}
    >
      PPL
    </EuiContextMenuItem>,
    <EuiContextMenuItem
      key={QUERY_LANGUAGE.DQL}
      onClick={() => handleQueryLanguageChange(QUERY_LANGUAGE.DQL)}
    >
      DQL
    </EuiContextMenuItem>,
  ];

  const languagePopOverButton = (
    <EuiButton iconType="arrowDown" iconSide="right" onClick={onLanguagePopoverClick} color="text">
      {queryLang}
    </EuiButton>
  );

  const onQuerySearch = (lang) => {
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

  const runChanges = () => {
    onQuerySearch(queryLang);
    handleTimePickerChange(timeRange);
    setNeedsUpdate(false);
  };

  //  STATE FOR LANG PICKER AND INDEX PICKER
  const [selectedIndex, setSelectedIndex] = useState<EuiComboBoxOptionOption[]>([
    { label: 'opensearch_dashboards_sample_data_logs' },
  ]);
  const { data: indices, loading: indicesLoading } = useCatIndices();
  const { data: indexPatterns, loading: indexPatternsLoading } = useGetIndexPatterns();
  const data =
    indexPatterns && indices
      ? [...indexPatterns, ...indices].filter(
          (v1, index, array) => array.findIndex((v2) => v1.label === v2.label) === index
        )
      : undefined;
  const loading = indicesLoading || indexPatternsLoading;

  return (
    <div className="globalQueryBar">
      <EuiFlexGroup direction="column" gutterSize="s">
        <EuiFlexItem>
          <EuiFlexGroup gutterSize="s" justifyContent="flexEnd" alignItems="center" wrap>
            {appLogEvents ? (
              <>
                <EuiFlexItem style={{ minWidth: 110 }} grow={false}>
                  <EuiToolTip position="top" content={baseQuery}>
                    <EuiBadge className="base-query-popover" color="hollow">
                      Base Query
                    </EuiBadge>
                  </EuiToolTip>
                </EuiFlexItem>
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
                    handleQuerySearch={() => {
                      onQuerySearch(queryLang);
                    }}
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
              </>
            ) : (
              <>
                <EuiFlexItem key="lang-selector" className="search-area lang-selector" grow={false}>
                  <EuiSuperSelect
                    options={languageOptions}
                    valueOfSelected={queryLang}
                    onChange={(lang: QUERY_LANGUAGE) => {
                      handleQueryLanguageChange(lang);
                      setQueryLang(lang);
                    }}
                  />
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
                    // onClickAriaLabel={'pplLinkShowFlyout'}
                  />
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiComboBox
                    placeholder="Select an index"
                    isClearable={true}
                    prepend={<EuiText>Index</EuiText>}
                    singleSelection={true}
                    isLoading={loading}
                    options={data}
                    selectedOptions={selectedIndex}
                    onChange={(index) => setSelectedIndex(index)}
                  />
                </EuiFlexItem>
              </>
            )}
            <EuiFlexItem grow={false} />
            <EuiFlexItem className="euiFlexItem--flexGrowZero event-date-picker" grow={false}>
              {!isLiveTailOn && (
                <DatePicker
                  startTime={startTime}
                  endTime={endTime}
                  setStartTime={setStartTime}
                  setEndTime={setEndTime}
                  setIsOutputStale={setIsOutputStale}
                  liveStreamChecked={props.liveStreamChecked}
                  onLiveStreamChange={props.onLiveStreamChange}
                  handleTimePickerChange={(tRange: string[]) => {
                    // modifies run button to look like the update button, if there is a time change
                    setNeedsUpdate(!(tRange[0] === startTime && tRange[1] === endTime));
                    // keeps the time range change local, to be used when update pressed
                    setTimeRange(tRange);
                  }}
                  handleTimeRangePickerRefresh={() => {
                    onQuerySearch(queryLang);
                  }}
                />
              )}
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiToolTip position="bottom" content={needsUpdate ? 'Click to apply' : false}>
                <EuiButton
                  color={needsUpdate ? 'success' : 'primary'}
                  iconType={needsUpdate ? 'kqlFunction' : 'play'}
                  fill={fillRun}
                  onClick={runChanges}
                >
                  {needsUpdate ? 'Update' : 'Run'}
                </EuiButton>
              </EuiToolTip>
            </EuiFlexItem>
            {showSaveButton && !showSavePanelOptionsList && (
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
            {isLiveTailOn && (
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
        {!appLogEvents && (
          <EuiFlexItem>
            <QueryArea
              tabId={tabId}
              handleQueryChange={handleQueryChange}
              handleTimeRangePickerRefresh={handleTimeRangePickerRefresh}
              runQuery={query}
              tempQuery={tempQuery}
              setNeedsUpdate={setNeedsUpdate}
              setFillRun={setFillRun}
              selectedIndex={selectedIndex}
            />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      {flyout}
    </div>
  );
};
