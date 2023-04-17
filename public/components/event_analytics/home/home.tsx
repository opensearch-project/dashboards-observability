/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiLink,
  EuiOverlayMask,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageContentHeader,
  EuiPageContentHeaderSection,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiPopover,
  EuiSpacer,
  EuiText,
  EuiTitle,
  htmlIdGenerator,
} from '@elastic/eui';
import React, { ReactElement, useEffect, useRef, useState } from 'react';
import { batch, connect, useDispatch } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { HttpStart } from '../../../../../../src/core/public';
import { CUSTOM_PANELS_API_PREFIX } from '../../../../common/constants/custom_panels';
import {
  EVENT_ANALYTICS_DOCUMENTATION_URL,
  NEW_TAB,
  RAW_QUERY,
  REDIRECT_TAB,
  SELECTED_DATE_RANGE,
  TAB_CREATED_TYPE,
  TAB_ID_TXT_PFX,
} from '../../../../common/constants/explorer';
import {
  EVENT_ANALYTICS,
  OBSERVABILITY_BASE,
  SAVED_OBJECTS,
} from '../../../../common/constants/shared';
import {
  EmptyTabParams,
  ExplorerData as IExplorerData,
  IQuery,
} from '../../../../common/types/explorer';
import { getOSDSavedObjectsClient } from '../../../../common/utils';
import SavedObjects from '../../../services/saved_objects/event_analytics/saved_objects';
import { OSDSavedVisualizationClient } from '../../../services/saved_objects/saved_object_client/osd_saved_objects/saved_visualization';
import { PPLSavedQueryClient } from '../../../services/saved_objects/saved_object_client/ppl';
import { SavedObjectsActions } from '../../../services/saved_objects/saved_object_client/saved_objects_actions';
import { ObservabilitySavedObject } from '../../../services/saved_objects/saved_object_client/types';
import { getSampleDataModal } from '../../common/helpers/add_sample_modal';
import { DeleteModal } from '../../common/helpers/delete_modal';
import { onItemSelect, parseGetSuggestions } from '../../common/search/autocomplete_logic';
import { Search } from '../../common/search/search';
import { init as initFields } from '../redux/slices/field_slice';
import { init as initPatterns } from '../redux/slices/patterns_slice';
import { init as initQueryResult, selectQueryResult } from '../redux/slices/query_result_slice';
import { changeQuery, init as initQuery, selectQueries } from '../redux/slices/query_slice';
import { addTab, selectQueryTabs, setSelectedQueryTab } from '../redux/slices/query_tab_slice';
import { SavedQueryTable } from './saved_objects_table';

interface IHomeProps {
  pplService: any;
  dslService: any;
  savedObjects: SavedObjects;
  setToast: (
    title: string,
    color?: string,
    text?: React.ReactChild | undefined,
    side?: string | undefined
  ) => void;
  getExistingEmptyTab: (params: EmptyTabParams) => string;
  http: HttpStart;
  queries: IQuery;
  explorerData: IExplorerData;
  tabsState: any;
}

const EventAnalyticsHome = (props: IHomeProps) => {
  const {
    pplService,
    dslService,
    savedObjects,
    setToast,
    getExistingEmptyTab,
    http,
    queries,
    explorerData,
    tabsState,
  } = props;
  const history = useHistory();
  const dispatch = useDispatch();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDateRange, setSelectedDateRange] = useState<string[]>(['now-15m', 'now']);
  const [savedHistories, setSavedHistories] = useState<any[]>([]);
  const [selectedHistories, setSelectedHistories] = useState<any[]>([]);
  const [isActionsPopoverOpen, setIsActionsPopoverOpen] = useState(false);
  const [isTableLoading, setIsTableLoading] = useState(false);
  const [modalLayout, setModalLayout] = useState(<EuiOverlayMask />);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const selectedDateRangeRef = useRef();
  selectedDateRangeRef.current = selectedDateRange;

  const closeModal = () => {
    setIsModalVisible(false);
  };

  const showModal = () => {
    setIsModalVisible(true);
  };

  const fetchHistories = async () => {
    const observabilityObjects = await SavedObjectsActions.getBulk({
      objectType: ['savedQuery', 'savedVisualization'],
      sortOrder: 'desc',
      fromIndex: 0,
    });
    const nonAppObjects = observabilityObjects.observabilityObjectList.filter(
      (object: ObservabilitySavedObject) =>
        (object.savedVisualization && !object.savedVisualization.application_id) ||
        object.savedQuery
    );
    setSavedHistories(nonAppObjects);
  };

  const deleteHistoryList = async () => {
    const objectIdsToDelete = selectedHistories.map((hstry) => hstry.data.objectId);
    await SavedObjectsActions.deleteBulk({ objectIdList: objectIdsToDelete })
      .then(async () => {
        setSavedHistories((staleHistories) => {
          return staleHistories.filter((his) => {
            return !objectIdsToDelete.includes(his.objectId);
          });
        });
        setToast(`Histories has been successfully deleted.`, 'success');
      })
      .catch((error) => {
        setToast(`Cannot delete Histories, error: ${error.message}`, 'danger');
      })
      .finally(() => {
        closeModal();
      });
  };

  const addNewTab = async () => {
    // get a new tabId
    const tabId = htmlIdGenerator(TAB_ID_TXT_PFX)();

    // create a new tab
    await batch(() => {
      dispatch(initQuery({ tabId }));
      dispatch(initQueryResult({ tabId }));
      dispatch(initFields({ tabId }));
      dispatch(addTab({ tabId }));
      dispatch(initPatterns({ tabId }));
    });

    return tabId;
  };

  useEffect(() => {
    fetchHistories();
  }, []);

  const dispatchInitialData = (tabId: string) => {
    batch(() => {
      dispatch(
        changeQuery({
          tabId,
          query: {
            [RAW_QUERY]: searchQuery,
            [SELECTED_DATE_RANGE]: selectedDateRangeRef.current,
            [TAB_CREATED_TYPE]: NEW_TAB,
          },
        })
      );
      dispatch(setSelectedQueryTab({ tabId }));
    });
  };

  const handleQuerySearch = async () => {
    const emptyTabId = getExistingEmptyTab({
      tabIds: tabsState.queryTabIds,
      queries,
      explorerData,
    });
    const newTabId = emptyTabId ? emptyTabId : await addNewTab();

    // update this new tab with data
    await dispatchInitialData(newTabId);

    // redirect to explorer
    history.push('/');
  };

  const handleQueryChange = async (query: string) => setSearchQuery(query);

  const handleTimePickerChange = async (timeRange: string[]) => setSelectedDateRange(timeRange);

  const handleHistoryClick = async (objectId: string) => {
    const emptyTabId = getExistingEmptyTab({
      tabIds: tabsState.queryTabIds,
      queries,
      explorerData,
    });
    const newTabId = emptyTabId ? emptyTabId : await addNewTab();
    batch(() => {
      dispatch(
        changeQuery({
          tabId: newTabId,
          query: {
            [TAB_CREATED_TYPE]: REDIRECT_TAB,
          },
        })
      );
      dispatch(setSelectedQueryTab({ tabId: newTabId }));
    });
    // redirect to explorer
    history.push(`/${objectId}`);
  };

  const addSampledata = async () => {
    setModalLayout(
      getSampleDataModal(closeModal, async () => {
        closeModal();
        await addSampleEvents();
      })
    );
    showModal();
  };

  const addSampleEvents = async () => {
    try {
      setIsTableLoading(true);
      const flights = await http
        .get('../api/saved_objects/_find', {
          query: {
            type: 'index-pattern',
            search_fields: 'title',
            search: 'opensearch_dashboards_sample_data_flights',
          },
        })
        .then((resp: any) => resp.total === 0);
      const logs = await http
        .get('../api/saved_objects/_find', {
          query: {
            type: 'index-pattern',
            search_fields: 'title',
            search: 'opensearch_dashboards_sample_data_logs',
          },
        })
        .then((resp: any) => resp.total === 0);
      if (flights || logs) setToast('Adding sample data. This can take some time.');
      await Promise.all([
        flights ? http.post('../api/sample_data/flights') : Promise.resolve(),
        logs ? http.post('../api/sample_data/logs') : Promise.resolve(),
      ]);

      await http
        .get(
          `${OBSERVABILITY_BASE}${EVENT_ANALYTICS}${SAVED_OBJECTS}/addSampleSavedObjects/event_analytics`
        )
        .then(async (resp: any) => {
          await http.post(`${CUSTOM_PANELS_API_PREFIX}/panels/addSamplePanels`, {
            body: JSON.stringify({
              savedVisualizationIds: [...resp?.savedVizIds],
            }),
          });

          // wait for sample data to flush to index
          await new Promise((resolve) => setTimeout(resolve, 1000));

          const res = await SavedObjectsActions.getBulk({
            objectType: ['savedQuery', 'savedVisualization'],
            sortOrder: 'desc',
            fromIndex: 0,
          });
          setSavedHistories((staleHistoryList) => {
            return [...res.observabilityObjectList, ...staleHistoryList];
          });
        });
      setToast(`Sample events added successfully.`);
    } catch (error: any) {
      setToast(`Cannot add sample events data, error: ${error}`, 'danger');
    } finally {
      setIsTableLoading(false);
    }
  };

  const popoverButton = (
    <EuiButton
      iconType="arrowDown"
      iconSide="right"
      onClick={() => setIsActionsPopoverOpen(!isActionsPopoverOpen)}
      data-test-subj="eventHomeAction"
    >
      Actions
    </EuiButton>
  );

  const deleteHistory = () => {
    const customPanelString = `${selectedHistories.length > 1 ? 'histories' : 'history'}`;
    setModalLayout(
      <DeleteModal
        onConfirm={deleteHistoryList}
        onCancel={closeModal}
        title={`Delete ${selectedHistories.length} ${customPanelString}`}
        message={`Are you sure you want to delete the selected ${selectedHistories.length} ${customPanelString}?`}
      />
    );
    showModal();
  };

  const popoverItems: ReactElement[] = [
    <EuiContextMenuItem
      key="delete"
      disabled={savedHistories.length === 0 || selectedHistories.length === 0}
      onClick={() => {
        setIsActionsPopoverOpen(false);
        deleteHistory();
      }}
      data-test-subj="eventHomeAction__delete"
    >
      Delete
    </EuiContextMenuItem>,
    <EuiContextMenuItem
      key="redirect"
      onClick={() => {
        setIsActionsPopoverOpen(false);
        history.push(`/`);
      }}
      data-test-subj="eventHomeAction__explorer"
    >
      Event Explorer
    </EuiContextMenuItem>,
    <EuiContextMenuItem
      key="addSample"
      onClick={() => {
        setIsActionsPopoverOpen(false);
        addSampledata();
      }}
      data-test-subj="eventHomeAction__addSamples"
    >
      Add samples
    </EuiContextMenuItem>,
  ];

  return (
    <>
      <EuiPage>
        <EuiPageBody>
          <EuiPageHeader>
            <EuiPageHeaderSection>
              <EuiTitle data-test-subj="eventHomePageTitle" size="l">
                <h1>Event analytics</h1>
              </EuiTitle>
            </EuiPageHeaderSection>
          </EuiPageHeader>
          <EuiPageContent className="event-home">
            <EuiFlexGroup gutterSize="s">
              <EuiFlexItem>
                <Search
                  query={queries[RAW_QUERY]}
                  tempQuery={searchQuery}
                  handleQueryChange={handleQueryChange}
                  handleQuerySearch={handleQuerySearch}
                  handleTimePickerChange={handleTimePickerChange}
                  handleTimeRangePickerRefresh={handleQuerySearch}
                  pplService={pplService}
                  dslService={dslService}
                  startTime={selectedDateRange[0]}
                  endTime={selectedDateRange[1]}
                  setStartTime={() => {}}
                  setEndTime={() => {}}
                  showSaveButton={false}
                  runButtonText="New Query"
                  getSuggestions={parseGetSuggestions}
                  onItemSelect={onItemSelect}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="m" />
          </EuiPageContent>
          <EuiSpacer size="m" />
          <EuiPageContent className="event-home">
            <EuiPageContentHeader>
              <EuiPageContentHeaderSection>
                <EuiTitle size="s">
                  <h3>
                    Queries and Visualizations
                    <span className="panel-header-count"> ({savedHistories.length})</span>
                  </h3>
                </EuiTitle>
                <EuiSpacer size="s" />
                <EuiText size="s" color="subdued">
                  Use Events Analytics to monitor, correlate, analyze and visualize machine
                  generated data through Piped Processing Language. Save frequently searched queries
                  and visualizations for quick access{' '}
                  <EuiLink external={true} href={EVENT_ANALYTICS_DOCUMENTATION_URL} target="blank">
                    Learn more
                  </EuiLink>
                </EuiText>
              </EuiPageContentHeaderSection>
              <EuiPageContentHeaderSection>
                <EuiFlexGroup gutterSize="s">
                  <EuiFlexItem>
                    <EuiPopover
                      panelPaddingSize="none"
                      button={popoverButton}
                      isOpen={isActionsPopoverOpen}
                      closePopover={() => setIsActionsPopoverOpen(false)}
                    >
                      <EuiContextMenuPanel items={popoverItems} />
                    </EuiPopover>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiPageContentHeaderSection>
            </EuiPageContentHeader>
            <EuiHorizontalRule margin="m" />
            <EuiFlexGroup>
              <EuiFlexItem grow={true}>
                {savedHistories.length > 0 ? (
                  <SavedQueryTable
                    savedHistories={savedHistories}
                    handleHistoryClick={handleHistoryClick}
                    isTableLoading={isTableLoading}
                    handleSelectHistory={setSelectedHistories}
                    selectedHistories={selectedHistories}
                  />
                ) : (
                  <>
                    <EuiSpacer size="xxl" />
                    <EuiText textAlign="center">
                      <h2>No Queries or Visualizations</h2>
                      <EuiSpacer size="m" />
                      <EuiText color="subdued">
                        Use events analytics to create and save frequently searched
                        <br />
                        queries and visualizations, using PPL.
                      </EuiText>
                    </EuiText>
                    <EuiSpacer size="m" />
                    <EuiFlexGroup justifyContent="center">
                      <EuiFlexItem grow={false}>
                        <EuiButton
                          fullWidth={false}
                          onClick={() => history.push(`/`)}
                          data-test-subj="actionEventExplorer"
                        >
                          Event Explorer
                        </EuiButton>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiButton
                          fullWidth={false}
                          onClick={() => addSampledata()}
                          data-test-subj="actionAddSamples"
                        >
                          Add samples
                        </EuiButton>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                    <EuiSpacer size="xxl" />
                  </>
                )}
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPageContent>
        </EuiPageBody>
      </EuiPage>
      {isModalVisible && modalLayout}
    </>
  );
};

const mapStateToProps = (state) => {
  return {
    queries: selectQueries(state),
    explorerData: selectQueryResult(state),
    tabsState: selectQueryTabs(state),
  };
};

export const Home = connect(mapStateToProps)(EventAnalyticsHome);
