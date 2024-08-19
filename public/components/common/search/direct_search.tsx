/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './search.scss';

import '@algolia/autocomplete-theme-classic';
import {
  EuiBadge,
  EuiSmallButton,
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
import { i18n } from '@osd/i18n';
import { isEmpty, isEqual } from 'lodash';
import React, { useEffect, useState } from 'react';
import { batch, useDispatch, useSelector } from 'react-redux';
import {
  ASYNC_POLLING_INTERVAL,
  QUERY_LANGUAGE,
  SANITIZE_QUERY_REGEX,
} from '../../../../common/constants/data_sources';
import {
  APP_ANALYTICS_TAB_ID_REGEX,
  RAW_QUERY,
  SELECTED_TIMESTAMP,
} from '../../../../common/constants/explorer';
import {
  PPL_NEWLINE_REGEX,
  PPL_SPAN_REGEX,
  TIMESTAMP_DATETIME_TYPES,
} from '../../../../common/constants/shared';
import {
  DirectQueryLoadingStatus,
  DirectQueryRequest,
  IDefaultTimestampState,
} from '../../../../common/types/explorer';
import { uiSettingsService } from '../../../../common/utils';
import { getAsyncSessionId, setAsyncSessionId } from '../../../../common/utils/query_session_utils';
import { get as getObjValue } from '../../../../common/utils/shared';
import { coreRefs } from '../../../framework/core_refs';
import { SQLService } from '../../../services/requests/sql';
import { SavePanel } from '../../event_analytics/explorer/save_panel';
import { useFetchEvents } from '../../event_analytics/hooks';
import { reset as resetResults } from '../../event_analytics/redux/slices/query_result_slice';
import { changeQuery } from '../../event_analytics/redux/slices/query_slice';
import {
  selectSearchMetaData,
  update as updateSearchMetaData,
} from '../../event_analytics/redux/slices/search_meta_data_slice';
import { formatError } from '../../event_analytics/utils';
import { usePolling } from '../../hooks/use_polling';
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
    dslService,
    selectedPanelName,
    selectedCustomPanelOptions,
    setSelectedPanelName,
    setSelectedCustomPanelOptions,
    handleSavingObject,
    isPanelTextFieldInvalid,
    savedObjects,
    showSavePanelOptionsList,
    showSaveButton = true,
    selectedSubTabId,
    searchBarConfigs = {},
    getSuggestions,
    onItemSelect,
    tabId = '',
    baseQuery = '',
    curVisId,
    setSubType,
    setIsQueryRunning,
  } = props;

  const explorerSearchMetadata = useSelector(selectSearchMetaData)[tabId] || {};
  const dispatch = useDispatch();
  const appLogEvents = tabId.match(APP_ANALYTICS_TAB_ID_REGEX);
  const [isSavePanelOpen, setIsSavePanelOpen] = useState(false);
  const [isFlyoutVisible, setIsFlyoutVisible] = useState(false);
  const [isLanguagePopoverOpen, setLanguagePopoverOpen] = useState(false);
  const [queryLang, setQueryLang] = useState(explorerSearchMetadata.lang || QUERY_LANGUAGE.SQL);
  const sqlService = new SQLService(coreRefs.http);

  const {
    data: pollingResult,
    loading: _pollingLoading,
    error: pollingError,
    startPolling,
    stopPolling,
  } = usePolling<any, any>((params) => {
    return sqlService.fetchWithJobId(params);
  }, ASYNC_POLLING_INTERVAL);

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

  const handleQueryLanguageChange = (lang: QUERY_LANGUAGE) => {
    dispatch(updateSearchMetaData({ tabId, data: { lang } }));
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
    <EuiContextMenuItem
      key={QUERY_LANGUAGE.SQL}
      onClick={() => handleQueryLanguageChange(QUERY_LANGUAGE.SQL)}
    >
      SQL
    </EuiContextMenuItem>,
    <EuiContextMenuItem
      key={QUERY_LANGUAGE.PPL}
      onClick={() => handleQueryLanguageChange(QUERY_LANGUAGE.PPL)}
    >
      PPL
    </EuiContextMenuItem>,
  ];

  const languagePopOverButton = (
    <EuiSmallButton
      iconType="arrowDown"
      iconSide="right"
      onClick={onLanguagePopoverClick}
      color="text"
      isDisabled={explorerSearchMetadata.isPolling}
    >
      {queryLang}
    </EuiSmallButton>
  );

  const stopPollingWithStatus = (status: DirectQueryLoadingStatus | undefined) => {
    stopPolling();
    setIsQueryRunning(false);
    dispatch(
      updateSearchMetaData({
        tabId,
        data: {
          isPolling: false,
          status,
        },
      })
    );
  };

  const onQuerySearch = (lang: string) => {
    setIsQueryRunning(true);
    batch(() => {
      dispatch(resetResults({ tabId })); // reset results
      dispatch(
        changeQuery({ tabId, query: { [RAW_QUERY]: tempQuery.replaceAll(PPL_NEWLINE_REGEX, '') } })
      );
      dispatch(
        updateSearchMetaData({
          tabId,
          data: { isPolling: true, lang, status: DirectQueryLoadingStatus.SCHEDULED },
        })
      );
    });
    const sessionId = getAsyncSessionId(explorerSearchMetadata.datasources[0].label);
    const requestQuery = tempQuery || query;
    const requestPayload = {
      lang: lang.toLowerCase(),
      query: requestQuery.replaceAll(SANITIZE_QUERY_REGEX, ' '),
      datasource: explorerSearchMetadata.datasources[0].label,
    } as DirectQueryRequest;

    if (sessionId) {
      requestPayload.sessionId = sessionId;
    }

    sqlService
      .fetch(requestPayload)
      .then((result) => {
        setAsyncSessionId(
          explorerSearchMetadata.datasources[0].label,
          getObjValue(result, 'sessionId', null)
        );
        if (result.queryId) {
          dispatch(updateSearchMetaData({ tabId, data: { queryId: result.queryId } }));
          startPolling({
            queryId: result.queryId,
          });
        } else {
          console.log('no query id found in response');
        }
      })
      .catch((e) => {
        stopPollingWithStatus(DirectQueryLoadingStatus.FAILED);
        const formattedError = formatError(
          '',
          'The query failed to execute and the operation could not be complete.',
          e.body.message
        );
        coreRefs.core?.notifications.toasts.addError(formattedError, {
          title: 'Query Failed',
        });
        console.error(e);
      });
  };

  const getDirectQueryTimestamp = (schema: Array<{ name: string; type: string }>) => {
    const timestamp: IDefaultTimestampState = {
      hasSchemaConflict: false, // schema conflict bool used for OS index w/ different mappings, not needed here
      default_timestamp: '',
      message: i18n.translate(`discover.events.directQuery.noTimeStampFoundMessage`, {
        defaultMessage: 'Index does not contain a valid time field.',
      }),
    };

    for (let i = 0; i < schema.length; i++) {
      const fieldMapping = schema[i];
      if (!isEmpty(fieldMapping)) {
        const fieldName = fieldMapping.name;
        const fieldType = fieldMapping.type;
        const isValidTimeType = TIMESTAMP_DATETIME_TYPES.some((dateTimeType) =>
          isEqual(fieldType, dateTimeType)
        );
        if (isValidTimeType && isEmpty(timestamp.default_timestamp)) {
          timestamp.default_timestamp = fieldName;
          timestamp.message = '';
          break;
        }
      }
    }
    return timestamp;
  };

  useEffect(() => {
    // cancel direct query
    if (!pollingResult) return;
    const { status: anyCaseStatus, datarows, error } = pollingResult;
    const status = anyCaseStatus?.toLowerCase();

    if (status === DirectQueryLoadingStatus.SUCCESS || datarows) {
      stopPollingWithStatus(status);
      // find the timestamp from results
      const derivedTimestamp = getDirectQueryTimestamp(pollingResult.schema);
      dispatch(
        changeQuery({
          tabId,
          query: {
            [SELECTED_TIMESTAMP]: derivedTimestamp.default_timestamp,
          },
        })
      );
      // update page with data
      dispatchOnGettingHis(pollingResult, '');
    } else if (status === DirectQueryLoadingStatus.FAILED) {
      stopPollingWithStatus(status);
      // send in a toast with error message
      const formattedError = formatError(
        '',
        'The query failed to execute and the operation could not be complete.',
        error
      );
      coreRefs.core?.notifications.toasts.addError(formattedError, {
        title: 'Query Failed',
      });
    } else {
      dispatch(
        updateSearchMetaData({
          tabId,
          data: { status },
        })
      );
    }
  }, [pollingResult, pollingError]);

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  useEffect(() => {
    if (!explorerSearchMetadata.isPolling) {
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
            isSuggestionDisabled={true}
            isDisabled={explorerSearchMetadata.isPolling}
            ignoreShiftEnter={true}
          />
          {queryLang === QUERY_LANGUAGE.PPL && (
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
          <EuiSmallButton
            color="success"
            onClick={() => {
              onQuerySearch(queryLang);
            }}
            fill
            isDisabled={explorerSearchMetadata.isPolling}
          >
            Search
          </EuiSmallButton>
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
