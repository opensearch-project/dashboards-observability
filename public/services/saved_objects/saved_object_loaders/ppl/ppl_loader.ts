/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import isEmpty from 'lodash/isEmpty';
import { batch as Batch } from 'react-redux';
import { updateFields as updateFieldsAction } from '../../../../components/event_analytics/redux/slices/field_slice';
import { changeQuery as changeQueryAction } from '../../../../components/event_analytics/redux/slices/query_slice';
import { updateTabName as updateTabNameAction } from '../../../../components/event_analytics/redux/slices/query_tab_slice';
import { change as updateVizConfigAction } from '../../../../components/event_analytics/redux/slices/viualization_config_slice';
import { update as updateSearchMetaData } from '../../../../components/event_analytics/redux/slices/search_meta_data_slice';
import { NotificationsStart } from '../../../../../../../src/core/public';
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
} from '../../../../../common/constants/explorer';
import { QueryManager } from '../../../../../common/query_manager';
import { statsChunk } from '../../../../../common/query_manager/ast/types/stats';
import { IField, SavedQuery, SavedVisualization } from '../../../../../common/types/explorer';
import { getUserConfigFrom } from '../../../../common/utils/helpers';
import { AppDispatch } from '../../../../framework/redux/store';
import { ISavedObjectsClient } from '../../saved_object_client/client_interface';
import { ObservabilitySavedObject, ObservabilitySavedQuery } from '../../saved_object_client/types';
import { SavedObjectLoaderBase } from '../loader_base';
import { ISavedObjectLoader } from '../loader_interface';

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
  dataSources: SelectedDataSource[];
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

export class PPLSavedObjectLoader extends SavedObjectLoaderBase implements ISavedObjectLoader {
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
    await this.loadDataFromSavedObject();
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
            [SELECTED_TIMESTAMP]: objectData?.selected_timestamp?.name || 'timestamp',
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
            datasources: [JSON.parse(objectData.data_sources)],
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

  async loadDataFromSavedObject() {
    const { fetchData } = this.loadContext;
    await fetchData();
  }
}
