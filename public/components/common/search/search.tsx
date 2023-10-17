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
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiPopoverFooter,
  EuiToolTip,
} from '@elastic/eui';
import { isEqual } from 'lodash';
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { APP_ANALYTICS_TAB_ID_REGEX, RAW_QUERY } from '../../../../common/constants/explorer';
import { PPL_SPAN_REGEX } from '../../../../common/constants/shared';
import { uiSettingsService } from '../../../../common/utils';
import { useFetchEvents } from '../../../components/event_analytics/hooks';
import { changeQuery } from '../../../components/event_analytics/redux/slices/query_slice';
import { usePolling } from '../../../components/hooks/use_polling';
import { coreRefs } from '../../../framework/core_refs';
import { SQLService } from '../../../services/requests/sql';
import { SavePanel } from '../../event_analytics/explorer/save_panel';
import {
  selectSearchMetaData,
  update as updateSearchMetaData,
} from '../../event_analytics/redux/slices/search_meta_data_slice';
import { PPLReferenceFlyout } from '../helpers';
import { LiveTailButton, StopLiveButton } from '../live_tail/live_tail_button';
import { Autocomplete } from './autocomplete';
import { DatePicker } from './date_picker';
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

  const explorerSearchMetadata = useSelector(selectSearchMetaData)[tabId];
  const dispatch = useDispatch();
  const appLogEvents = tabId.match(APP_ANALYTICS_TAB_ID_REGEX);
  const [isSavePanelOpen, setIsSavePanelOpen] = useState(false);
  const [isLanguagePopoverOpen, setLanguagePopoverOpen] = useState(false);
  const [isFlyoutVisible, setIsFlyoutVisible] = useState(false);
  const [queryLang, setQueryLang] = useState('PPL');
  const [jobId, setJobId] = useState('');
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
  const { getLiveTail, getEvents, getAvailableFields, dispatchOnGettingHis } = useFetchEvents({
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
    if (lang === 'DQL') {
      return application!.navigateToUrl(
        `../app/data-explorer/discover#?_a=(discover:(columns:!(_source),isDirty:!f,sort:!()),metadata:(indexPattern:'${explorerSearchMetadata.datasources[0].value}',view:discover))&_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-15m,to:now))&_q=(filters:!(),query:(language:kuery,query:''))`
      );
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

  const languagePopOverItems = [
    <EuiContextMenuItem key="PPL" onClick={() => handleQueryLanguageChange('PPL')}>
      PPL
    </EuiContextMenuItem>,
    <EuiContextMenuItem key="DQL" onClick={() => handleQueryLanguageChange('DQL')}>
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

  useEffect(() => {
    if (explorerSearchMetadata.datasources?.[0]?.type === 'DEFAULT_INDEX_PATTERNS') {
      const queryWithSelectedSource = `source = ${explorerSearchMetadata.datasources[0].label}`;
      handleQueryChange(queryWithSelectedSource);
      dispatch(
        changeQuery({
          tabId,
          query: {
            [RAW_QUERY]: queryWithSelectedSource,
          },
        })
      );
    }
  }, [explorerSearchMetadata.datasources]);

  return (
    <div className="globalQueryBar">
      <EuiFlexGroup gutterSize="s" justifyContent="flexStart" alignItems="flexStart" wrap>
        {appLogEvents && (
          <EuiFlexItem style={{ minWidth: 110 }} grow={false}>
            <EuiToolTip position="top" content={baseQuery}>
              <EuiBadge className="base-query-popover" color="hollow">
                Base Query
              </EuiBadge>
            </EuiToolTip>
          </EuiFlexItem>
        )}
        {!appLogEvents && (
          <EuiFlexItem key="lang-selector" className="search-area lang-selector" grow={false}>
            <EuiPopover
              id="smallContextMenuExample"
              button={languagePopOverButton}
              isOpen={isLanguagePopoverOpen}
              closePopover={closeLanguagePopover}
              panelPaddingSize="none"
              anchorPosition="downLeft"
            >
              <EuiContextMenuPanel size="s" items={languagePopOverItems} />
            </EuiPopover>
          </EuiFlexItem>
        )}
        <EuiFlexItem key="search-bar" className="search-area" grow={5} style={{ minWidth: 400 }}>
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
