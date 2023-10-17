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
import { isEqual, lowerCase } from 'lodash';
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { APP_ANALYTICS_TAB_ID_REGEX } from '../../../../common/constants/explorer';
import { PPL_SPAN_REGEX } from '../../../../common/constants/shared';
import { uiSettingsService } from '../../../../common/utils';
import { useFetchEvents } from '../../../components/event_analytics/hooks';
import { usePolling } from '../../../components/hooks/use_polling';
import { coreRefs } from '../../../framework/core_refs';
import { SQLService } from '../../../services/requests/sql';
import { SavePanel } from '../../event_analytics/explorer/save_panel';
import {
  selectSearchMetaData,
  update as updateSearchMetaData,
} from '../../event_analytics/redux/slices/search_meta_data_slice';
import { PPLReferenceFlyout } from '../helpers';
import { Autocomplete } from './autocomplete';
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

export const DirectSearch = (props: any) => {
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
  const [isFlyoutVisible, setIsFlyoutVisible] = useState(false);
  const [isLanguagePopoverOpen, setLanguagePopoverOpen] = useState(false);
  const [queryLang, setQueryLang] = useState('SQL');
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
    <EuiContextMenuItem key="SQL" onClick={() => handleQueryLanguageChange('SQL')}>
      SQL
    </EuiContextMenuItem>,
    <EuiContextMenuItem key="PPL" onClick={() => handleQueryLanguageChange('PPL')}>
      PPL
    </EuiContextMenuItem>,
  ];

  const languagePopOverButton = (
    <EuiButton
      iconType="arrowDown"
      iconSide="right"
      onClick={onLanguagePopoverClick}
      color="text"
      isDisabled={explorerSearchMetadata.isPolling}
    >
      {queryLang}
    </EuiButton>
  );

  const onQuerySearch = (lang) => {
    setIsQueryRunning(true);
    dispatch(
      updateSearchMetaData({
        tabId,
        data: {
          isPolling: true,
        },
      })
    );
    sqlService
      .fetch({
        lang: lowerCase(lang),
        query: tempQuery || query,
        datasource: explorerSearchMetadata.datasources[0].name,
      })
      .then((result) => {
        if (result.queryId) {
          setJobId(result.queryId);
          startPolling({
            queryId: result.queryId,
          });
        } else {
          console.log('no query id found in response');
        }
      })
      .catch((e) => {
        setIsQueryRunning(false);
        console.error(e);
      })
      .finally(() => {});
  };

  useEffect(() => {
    // cancel direct query
    if (pollingResult && (pollingResult.status === 'SUCCESS' || pollingResult.datarows)) {
      // stop polling
      stopPolling();
      setIsQueryRunning(false);
      dispatch(
        updateSearchMetaData({
          tabId,
          data: {
            isPolling: false,
          },
        })
      );
      // update page with data
      dispatchOnGettingHis(pollingResult, '');
    }
  }, [pollingResult, pollingError]);

  useEffect(() => {
    if (explorerSearchMetadata.isPolling === false) {
      stopPolling();
      setIsQueryRunning(false);
    }
  }, [explorerSearchMetadata.isPolling]);

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
            isSuggestionDisabled={queryLang === 'SQL'}
            isDisabled={explorerSearchMetadata.isPolling}
          />
          {queryLang === 'PPL' && (
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
          )}
        </EuiFlexItem>
        <EuiFlexItem grow={false} />
        <EuiFlexItem className="euiFlexItem--flexGrowZero event-date-picker" grow={false}>
          <EuiButton
            color="success"
            onClick={() => {
              onQuerySearch(queryLang);
            }}
            fill
            isDisabled={explorerSearchMetadata.isPolling}
          >
            Search
          </EuiButton>
        </EuiFlexItem>

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
