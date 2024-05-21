/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';
import isEmpty from 'lodash/isEmpty';
import { batch as Batch } from 'react-redux';
import { NotificationsStart } from '../../../../../../src/core/public';
import {
  ASYNC_POLLING_INTERVAL,
  DEFAULT_DATA_SOURCE_NAME,
  DEFAULT_DATA_SOURCE_TYPE,
} from '../../../../common/constants/data_sources';
import {
  AGGREGATIONS,
  BREAKDOWNS,
  GROUPBY,
  RAW_QUERY,
  SAVED_OBJECT_ID,
  SAVED_OBJECT_TYPE,
  SAVED_QUERY,
  SAVED_VISUALIZATION,
  SELECTED_DATE_RANGE,
  SELECTED_FIELDS,
  SELECTED_TIMESTAMP,
  TYPE_TAB_MAPPING,
} from '../../../../common/constants/explorer';
import { QueryManager } from '../../../../common/query_manager';
import { statsChunk } from '../../../../common/query_manager/ast/types/stats';
import {
  DirectQueryRequest,
  IField,
  SavedQuery,
  SavedVisualization,
  SelectedDataSource,
} from '../../../../common/types/explorer';
import { getAsyncSessionId, setAsyncSessionId } from '../../../../common/utils/query_session_utils';
import { get as getObjValue } from '../../../../common/utils/shared';
import { getUserConfigFrom } from '../../../../common/utils/visualization_helpers';
import { updateFields as updateFieldsAction } from '../../../components/event_analytics/redux/slices/field_slice';
import { changeQuery as changeQueryAction } from '../../../components/event_analytics/redux/slices/query_slice';
import { updateTabName as updateTabNameAction } from '../../../components/event_analytics/redux/slices/query_tab_slice';
import { update as updateSearchMetaData } from '../../../components/event_analytics/redux/slices/search_meta_data_slice';
import { change as updateVizConfigAction } from '../../../components/event_analytics/redux/slices/viualization_config_slice';
import { PollingConfigurations } from '../../../components/hooks';
import { UsePolling } from '../../../components/hooks/use_polling';
import { coreRefs } from '../../../framework/core_refs';
import { AppDispatch } from '../../../framework/redux/store';
import { SQLService } from '../../requests/sql';
import { ISavedObjectsClient } from '../saved_object_client/client_interface';
import { ObservabilitySavedObject, ObservabilitySavedQuery } from '../saved_object_client/types';
import { SavedObjectLoaderBase } from './loader_base';
import { ISavedObjectLoader } from './loader_interface';

enum DIRECT_DATA_SOURCE_TYPES {
  DEFAULT_INDEX_PATTERNS = 'DEFAULT_INDEX_PATTERNS',
  SPARK = 'spark',
  S3GLUE = 's3glue',
}

interface LoadParams {
  objectId: string;
}

interface LoadContext {
  tabId: string;
  appLogEvents: boolean;
  setStartTime: (startTime: string) => void;
  setEndTime: (endTime: string) => void;
  queryManager: QueryManager;
  getDefaultVisConfig: (
    statsToken: statsChunk
  ) => {
    [AGGREGATIONS]: IField[];
    [GROUPBY]: IField[];
    [BREAKDOWNS]?: IField[];
    span?: any;
  };
  setSelectedPanelName: (savedObjectName: string) => void;
  setCurVisId: (visId: string) => void;
  setTempQuery: (tmpQuery: string) => void;
  setMetricChecked: (metricChecked: boolean) => void;
  setMetricMeasure: (metricMeasure: string) => void;
  setSubType: (type: string) => void;
  setSelectedContentTab: (curTab: string) => void;
  fetchData: () => void;
  dispatchOnGettingHis: (res: unknown, query: string) => void;
}

interface Dispatchers {
  batch: typeof Batch;
  dispatch: AppDispatch;
  changeQuery: typeof changeQueryAction;
  updateFields: typeof updateFieldsAction;
  updateTabName: typeof updateTabNameAction;
  updateVizConfig: typeof updateVizConfigAction;
}

type SavedObjectData = ObservabilitySavedObject;

function isObjectSavedQuery(
  savedObjectData: SavedObjectData
): savedObjectData is ObservabilitySavedQuery {
  return SAVED_QUERY in savedObjectData;
}

function isInnerObjectSavedVisualization(
  objectData: SavedQuery | SavedVisualization
): objectData is SavedVisualization {
  return 'type' in objectData;
}

const parseStringDataSource = (
  dsInSavedObject: string,
  notifications: NotificationsStart
): SelectedDataSource[] => {
  let selectedDataSources: SelectedDataSource[];
  try {
    selectedDataSources = JSON.parse(dsInSavedObject);
  } catch (err: unknown) {
    console.error(err);
    notifications.toasts.addError(err as Error, {
      title: i18n.translate('observability.notification.error.savedDataSourceParsingError', {
        defaultMessage: 'Cannot parse datasources from saved object',
      }),
    });
    return [] as SelectedDataSource[];
  }
  return selectedDataSources;
};

export class ExplorerSavedObjectLoader extends SavedObjectLoaderBase implements ISavedObjectLoader {
  private pollingInstance: UsePolling<any, any> | undefined;

  constructor(
    protected readonly savedObjectClient: ISavedObjectsClient,
    protected readonly notifications: NotificationsStart,
    protected readonly dispatchers: Dispatchers,
    protected readonly loadParams: LoadParams,
    protected readonly loadContext: LoadContext
  ) {
    super();
  }

  async load() {
    await this.getSavedObjectById(this.loadParams.objectId);
  }

  async getSavedObjectById(objectId: string) {
    try {
      const res = await this.savedObjectClient.get({
        objectId,
      });
      await this.processSavedData(res.observabilityObjectList[0]);
    } catch (error) {
      this.notifications.toasts.addError(error, {
        title: `Cannot get saved data for object id: ${objectId}`,
      });
    }
  }

  updateAppAnalyticSelectedDateRange(selectedDateRange: { start: string; end: string }) {
    const { setStartTime, setEndTime } = this.loadContext;
    setStartTime(selectedDateRange.start);
    setEndTime(selectedDateRange.end);
  }

  async processSavedData(savedObjectData: SavedObjectData) {
    const savedType = isObjectSavedQuery(savedObjectData) ? SAVED_QUERY : SAVED_VISUALIZATION;
    const objectData = isObjectSavedQuery(savedObjectData)
      ? savedObjectData.savedQuery
      : savedObjectData.savedVisualization;
    const currQuery = objectData?.query || '';
    const { appLogEvents } = this.loadContext;

    // app analytics specific
    if (appLogEvents && objectData.selected_date_range) {
      this.updateAppAnalyticSelectedDateRange(objectData.selected_date_range);
    }

    // update redux store with this saved object data
    await this.updateReduxState(savedType, objectData, currQuery);

    // update UI state with this saved object data
    await this.updateUIState(objectData);

    // fetch data based on saved object data
    const { tabId } = this.loadContext;
    await this.loadDataFromSavedObject(objectData, tabId);
  }

  async updateReduxState(
    savedType: typeof SAVED_QUERY | typeof SAVED_VISUALIZATION,
    objectData: SavedQuery | SavedVisualization,
    currQuery: string
  ) {
    const { batch, dispatch, changeQuery, updateFields, updateTabName } = this.dispatchers;
    const { tabId } = this.loadContext;
    const { objectId } = this.loadParams;
    batch(async () => {
      await dispatch(
        changeQuery({
          tabId,
          query: {
            [RAW_QUERY]: currQuery,
            [SELECTED_TIMESTAMP]: objectData?.selected_timestamp?.name,
            [SAVED_OBJECT_ID]: objectId,
            [SAVED_OBJECT_TYPE]: savedType,
            [SELECTED_DATE_RANGE]:
              objectData?.selected_date_range?.start && objectData?.selected_date_range?.end
                ? [objectData.selected_date_range.start, objectData.selected_date_range.end]
                : ['now-15m', 'now'],
          },
        })
      );
      await dispatch(
        updateFields({
          tabId,
          data: {
            [SELECTED_FIELDS]: [...objectData?.selected_fields?.tokens],
          },
        })
      );
      await dispatch(
        updateTabName({
          tabId,
          tabName: objectData.name,
        })
      );
      await dispatch(
        updateSearchMetaData({
          tabId,
          data: {
            datasources: JSON.parse(objectData.data_sources),
            lang: objectData.query_lang,
          },
        })
      );
      if (isInnerObjectSavedVisualization(objectData)) {
        await this.updateVisualizationConfig(objectData);
      }
    });
  }

  async updateVisualizationConfig(objectData: SavedVisualization) {
    const { dispatch, updateVizConfig } = this.dispatchers;
    const { tabId, queryManager, getDefaultVisConfig } = this.loadContext;
    // fill saved user configs
    let visConfig = {};
    const customConfig = getUserConfigFrom(objectData);
    if (!isEmpty(customConfig.dataConfig) && !isEmpty(customConfig.dataConfig?.series)) {
      visConfig = { ...customConfig };
    } else {
      const statsTokens = queryManager.queryParser().parse(objectData.query).getStats();
      visConfig = { dataConfig: { ...getDefaultVisConfig(statsTokens) } };
    }
    await dispatch(
      updateVizConfig({
        tabId,
        vizId: objectData?.type,
        data: visConfig,
      })
    );
  }

  async updateUIState(objectData: SavedQuery | SavedVisualization) {
    const {
      setSelectedPanelName,
      setCurVisId,
      setTempQuery,
      setMetricChecked,
      setMetricMeasure,
      setSubType,
      setSelectedContentTab,
    } = this.loadContext;
    // update UI state with saved data
    setSelectedPanelName(objectData?.name || '');
    setCurVisId(objectData?.type || 'bar');
    setTempQuery((staleTempQuery) => {
      return objectData?.query || staleTempQuery;
    });
    if (isInnerObjectSavedVisualization(objectData)) {
      if (objectData.subType === 'metric') {
        setMetricChecked(true);
        setMetricMeasure(objectData.units_of_measure || '');
      }
      setSubType(objectData.subType);
    }
    const tabToBeFocused = isInnerObjectSavedVisualization(objectData)
      ? TYPE_TAB_MAPPING[SAVED_VISUALIZATION]
      : TYPE_TAB_MAPPING[SAVED_QUERY];
    setSelectedContentTab(tabToBeFocused);
  }

  handleDirectQuerySuccess = (pollingResult, _configurations: PollingConfigurations) => {
    const { tabId, dispatchOnGettingHis } = this.loadContext;
    const { dispatch } = this.dispatchers;
    if (pollingResult && pollingResult.status === 'SUCCESS') {
      // stop polling
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
      return true;
    }
    dispatch(
      updateSearchMetaData({
        tabId,
        data: { status: pollingResult.status },
      })
    );
    return false;
  };

  handleDirectQueryError = (error: Error) => {
    console.error(error);
    return true;
  };

  loadWODataSource = ({ tabId }: { tabId: string }) => {
    const { dispatch, batch } = this.dispatchers;
    const { fetchData } = this.loadContext;

    // default datasource
    batch(() => {
      dispatch(
        updateSearchMetaData({
          tabId,
          data: {
            datasources: [
              {
                name: DEFAULT_DATA_SOURCE_NAME,
                type: DEFAULT_DATA_SOURCE_TYPE,
                label: DEFAULT_DATA_SOURCE_NAME,
                value: DEFAULT_DATA_SOURCE_NAME,
              },
            ],
          },
        })
      );
      fetchData();
    });
  };

  loadDefaultIndexPattern = () => {
    const { fetchData } = this.loadContext;
    fetchData();
  };

  loadSparkGlue = ({ objectData, dataSources, tabId }) => {
    const { dispatch } = this.dispatchers;
    const sqlService = new SQLService(coreRefs.http);
    const sessionId = getAsyncSessionId(dataSources[0].label);
    const requestPayload = {
      lang: objectData.query_lang.toLowerCase(),
      query: objectData.query,
      datasource: dataSources[0].label,
    } as DirectQueryRequest;

    if (sessionId) {
      requestPayload.sessionId = sessionId;
    }

    // Create an instance of UsePolling
    const polling = new UsePolling<any, any>(
      (params) => {
        return sqlService.fetchWithJobId(params);
      },
      ASYNC_POLLING_INTERVAL,
      this.handleDirectQuerySuccess,
      this.handleDirectQueryError,
      { tabId }
    );

    // Update your references from the destructured hook to direct properties of the polling instance
    const startPolling = polling.startPolling.bind(polling); // bind to ensure correct 'this' context

    this.pollingInstance = polling;

    dispatch(
      updateSearchMetaData({
        tabId,
        data: {
          isPolling: true,
        },
      })
    );

    sqlService
      .fetch(requestPayload)
      .then((result) => {
        setAsyncSessionId(dataSources[0].label, getObjValue(result, 'sessionId', null));
        if (result.queryId) {
          dispatch(updateSearchMetaData({ tabId, data: { queryId: result.queryId } }));
          startPolling({ queryId: result.queryId });
        } else {
          console.log('no query id found in response');
        }
      })
      .catch((e) => {
        console.error(e);
      });
  };

  async loadDataFromSavedObject(objectData, tabId: string) {
    const dataSources = parseStringDataSource(objectData.data_sources, this.notifications);

    // backward compatibility for saved object that doesn't contain datasource
    if (dataSources.length === 0) {
      this.loadWODataSource({ tabId });
      return;
    }

    // saved object contains data source information
    if (dataSources[0].type) {
      switch (dataSources[0].type) {
        case DIRECT_DATA_SOURCE_TYPES.DEFAULT_INDEX_PATTERNS:
          this.loadDefaultIndexPattern();
          return;
        case DIRECT_DATA_SOURCE_TYPES.SPARK:
        case DIRECT_DATA_SOURCE_TYPES.S3GLUE:
          this.loadSparkGlue({
            objectData,
            dataSources,
            tabId,
          });
          return;
        default:
          return;
      }
    }
  }

  getPollingInstance() {
    return this.pollingInstance;
  }
}
