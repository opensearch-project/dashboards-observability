/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './search.scss';

import React, { useState, useEffect } from 'react';
import { isEqual } from 'lodash';
import {
  EuiFlexGroup,
  EuiButton,
  EuiFlexItem,
  EuiPopover,
  EuiButtonEmpty,
  EuiPopoverFooter,
  EuiBadge,
  EuiContextMenuPanel,
  EuiToolTip,
  EuiCallOut,
  EuiComboBox,
} from '@elastic/eui';
import { DatePicker } from './date_picker';
import '@algolia/autocomplete-theme-classic';
import { Autocomplete } from './autocomplete';
import { SavePanel } from '../../event_analytics/explorer/save_panel';
import { PPLReferenceFlyout } from '../helpers';
import { uiSettingsService } from '../../../../common/utils';
import { APP_ANALYTICS_TAB_ID_REGEX } from '../../../../common/constants/explorer';
import { LiveTailButton, StopLiveButton } from '../live_tail/live_tail_button';
import { PPL_SPAN_REGEX } from '../../../../common/constants/shared';
import { DataSourceSelectable } from '../../../../../../src/plugins/data/public';
import { coreRefs } from '../../../framework/core_refs';
import { SQLDataFetcher } from '../../../services/data_fetchers/sql/sql_data_fetcher';
import { useFetchEvents } from '../../../components/event_analytics/hooks';
import SQLService from '../../../services/requests/sql';
import PPLService from '../../../services/requests/ppl';
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
    setupDeps,
  } = props;

  const { dataSources } = setupDeps.data;
  const [activeDataSources, setActiveDataSources] = useState([]);
  const appLogEvents = tabId.match(APP_ANALYTICS_TAB_ID_REGEX);
  const [isSavePanelOpen, setIsSavePanelOpen] = useState(false);
  const [isFlyoutVisible, setIsFlyoutVisible] = useState(false);
  const [queryLang, setQueryLang] = useState([{ label: 'SQL' }]);
  const requestParams = { tabId };
  const { getLiveTail, getEvents, getAvailableFields } = useFetchEvents({
    pplService: new SQLService(coreRefs.http),
    requestParams,
  });
  const sqlDataFetcher = new SQLDataFetcher(coreRefs.http);

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

  const handleSourceChange = (selectedSource) => {
    console.log('selectedSource: ', selectedSource);
  };

  const handleQueryLanguageChange = (lang) => {
    if (lang[0].label === 'DQL') {
      window.location.href = '/app/data-explorer/discover';
      return;
    }
    setQueryLang(lang);
  };

  const onQuerySearch = (lang) => {
    if (lang[0].label === 'DQL') return;
    if (lang[0].label === 'PPL') return handleTimeRangePickerRefresh();
    // SQL
    sqlDataFetcher.search(tempQuery, getEvents);
  };

  useEffect(() => {
    const sourceList = Object.values(dataSources.dataSourceService.getDataSources());
    setActiveDataSources([...sourceList]);
  }, [dataSources]);

  return (
    <div className="globalQueryBar">
      <EuiFlexGroup gutterSize="s" justifyContent="flexStart" alignItems="flexStart">
        {appLogEvents && (
          <EuiFlexItem style={{ minWidth: 110 }} grow={false}>
            <EuiToolTip position="top" content={baseQuery}>
              <EuiBadge className="base-query-popover" color="hollow">
                Base Query
              </EuiBadge>
            </EuiToolTip>
          </EuiFlexItem>
        )}
        <EuiFlexItem key="source-selector" className="search-area">
          <DataSourceSelectable
            dataSources={activeDataSources}
            onSourceChange={handleSourceChange}
          />
        </EuiFlexItem>
        <EuiFlexItem key="lang-selector" className="search-area">
          <EuiComboBox
            placeholder="No language selected yet"
            options={[{ label: 'SQL' }, { label: 'PPL' }, { label: 'DQL' }]}
            selectedOptions={queryLang}
            onChange={handleQueryLanguageChange}
            singleSelection={true}
          />
        </EuiFlexItem>
        <EuiFlexItem key="search-bar" className="search-area">
          <Autocomplete
            key={'autocomplete-search-bar'}
            query={query}
            tempQuery={tempQuery}
            baseQuery={baseQuery}
            handleQueryChange={handleQueryChange}
            handleQuerySearch={() => {
              console.log('query search...');
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
              handleTimePickerChange={(timeRange: string[]) => handleTimePickerChange(timeRange)}
              handleTimeRangePickerRefresh={() => {
                onQuerySearch(queryLang);
              }}
            />
          )}
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
      {flyout}
    </div>
  );
};
