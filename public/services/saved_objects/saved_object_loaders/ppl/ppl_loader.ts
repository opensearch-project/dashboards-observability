/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { has, isEmpty } from 'lodash';
import { batch as Batch } from 'react-redux';
import { changeQuery as changeQueryAction } from 'public/components/event_analytics/redux/slices/query_slice';
import { updateFields as updateFieldsAction } from 'public/components/event_analytics/redux/slices/field_slice';
import { updateTabName as updateTabNameAction } from 'public/components/event_analytics/redux/slices/query_tab_slice';
import { change as updateVizConfigAction } from 'public/components/event_analytics/redux/slices/viualization_config_slice';
import { ISavedObjectsClient } from '../../saved_object_client/client_interface';
import { SavedObjectLoaderBase } from '../loader_base';
import { ISavedObjectLoader } from '../loader_interface';
import {
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
  AGGREGATIONS,
  BREAKDOWNS,
} from '../../../../../common/constants/explorer';
import { NotificationsStart } from '../../../../../../../src/core/public';
import { QueryManager } from '../../../../../common/query_manager';
import { statsChunk } from '../../../../../common/query_manager/ast/types/stats';
import { IField } from '../../../../../common/types/explorer';
import { AppDispatch } from '../../../../framework/redux/store';
import { SavedObjectsGetResponse } from '../../saved_object_client/types';

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
  ) => { [AGGREGATIONS]: IField[]; [GROUPBY]: IField[]; [BREAKDOWNS]?: IField[]; span?: any };
  setSelectedPanelName: (savedObjectName: string) => void;
  setCurVisId: (visId: string) => void;
  setTempQuery: (tmpQuery: string) => void;
  setMetricChecked: (metricChecked: boolean) => void;
  setMetricMeasure: (metricMeasure: string) => void;
  setSubType: (type: string) => void;
  setSelectedContentTab: (curTab: string) => void;
  fetchData: () => void;
}

interface Dispatchers {
  batch: typeof Batch;
  dispatch: AppDispatch;
  changeQuery: typeof changeQueryAction;
  updateFields: typeof updateFieldsAction;
  updateTabName: typeof updateTabNameAction;
  updateVizConfig: typeof updateVizConfigAction;
}

type SavedObjectData = SavedObjectsGetResponse;

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
    const isSavedQuery = has(savedObjectData, SAVED_QUERY);
    const savedType = isSavedQuery ? SAVED_QUERY : SAVED_VISUALIZATION;
    const objectData = isSavedQuery
      ? savedObjectData.savedQuery
      : savedObjectData.savedVisualization;
    const currQuery = objectData?.query || '';
    const { appLogEvents } = this.loadContext;

    // app analytics specific
    if (appLogEvents && savedObjectData.selected_date_range) {
      this.updateAppAnalyticSelectedDateRange(savedObjectData.selected_date_range);
    }

    // update redux store with this saved object data
    await this.updateReduxState(savedType, objectData, currQuery);

    // update UI state with this saved object data
    await this.updateUIState(savedObjectData);

    // fetch data based on saved object data
    await this.loadDataFromSavedObject();
  }

  async updateReduxState(savedType: string, objectData: SavedObjectData, currQuery: string) {
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
      await this.updateVisualizationConfig(objectData);
    });
  }

  async updateVisualizationConfig(objectData: SavedObjectData) {
    const { dispatch, updateVizConfig } = this.dispatchers;
    const { tabId, queryManager, getDefaultVisConfig } = this.loadContext;
    // fill saved user configs
    if (objectData.type) {
      let visConfig = {};
      const customConfig = objectData.user_configs ? JSON.parse(objectData.user_configs) : {};
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
  }

  async updateUIState(objectData: SavedObjectData) {
    const {
      setSelectedPanelName,
      setCurVisId,
      setTempQuery,
      setMetricChecked,
      setMetricMeasure,
      setSubType,
      setSelectedContentTab,
    } = this.loadContext;
    const isSavedQuery = has(objectData, SAVED_QUERY);
    const savedVisualization = objectData.savedVisualization;
    // update UI state with saved data
    setSelectedPanelName(objectData?.name || '');
    setCurVisId(objectData?.type || 'bar');
    setTempQuery((staleTempQuery) => {
      return objectData?.query || staleTempQuery;
    });
    if (savedVisualization?.sub_type) {
      if (savedVisualization?.sub_type === 'metric') {
        setMetricChecked(true);
        setMetricMeasure(savedVisualization?.units_of_measure);
      }
      setSubType(savedVisualization?.sub_type);
    }
    const tabToBeFocused = isSavedQuery
      ? TYPE_TAB_MAPPING[SAVED_QUERY]
      : TYPE_TAB_MAPPING[SAVED_VISUALIZATION];
    setSelectedContentTab(tabToBeFocused);
  }

  async loadDataFromSavedObject() {
    const { fetchData } = this.loadContext;
    await fetchData();
  }
}
