/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { QueryManager } from 'common/query_manager';
import { History } from 'history';
import Plotly from 'plotly.js-dist';
import {
  CoreSetup,
  CoreStart,
  HttpSetup,
  HttpStart,
  NotificationsStart,
} from '../../../../src/core/public';
import { ChromeBreadcrumb } from '../../../../src/core/public/chrome';
import {
  SavedObjectAttributes,
  SavedObjectsStart,
} from '../../../../src/core/public/saved_objects';
import { DataSourceType } from '../../../../src/plugins/data/public';
import { VIS_CHART_TYPES } from '../../common/constants/shared';
import DSLService from '../../public/services/requests/dsl';
import PPLService from '../../public/services/requests/ppl';
import SavedObjects from '../../public/services/saved_objects/event_analytics/saved_objects';
import TimestampUtils from '../../public/services/timestamp/timestamp';
import {
  AGGREGATIONS,
  AVAILABLE_FIELDS,
  BREAKDOWNS,
  CUSTOM_LABEL,
  FINAL_QUERY,
  GROUPBY,
  INDEX,
  QUERIED_FIELDS,
  RAW_QUERY,
  SELECTED_DATE_RANGE,
  SELECTED_FIELDS,
  SELECTED_TIMESTAMP,
  UNSELECTED_FIELDS,
} from '../constants/explorer';
import { PROMQL_METRIC_SUBTYPE } from '../constants/shared';
export interface IQueryTab {
  id: string;
  name: React.ReactNode | string;
  content: React.ReactNode;
}

export interface IField extends SavedObjectAttributes {
  name: string;
  type: string;
  label?: string;
}

export interface TimeUnit {
  name: string;
  label: string;
  value: string;
}

export interface ExplorerFields {
  availableFields: IField[];
  queriedFields: IField[];
  selectedFields: IField[];
  unselectedFields: IField[];
}

export interface ITabQueryResults {
  [tabId: string]: any;
}

export interface ITabQueries {
  [tabId: string]: IQuery;
}

export interface IQuery {
  [RAW_QUERY]: string;
  [FINAL_QUERY]: string;
  [INDEX]: string;
  [SELECTED_DATE_RANGE]: string[];
  [SELECTED_TIMESTAMP]: string;
}

export interface IExplorerTabFields {
  [tabId: string]: IExplorerFields;
}

export interface IExplorerFields {
  [SELECTED_FIELDS]: IField[];
  [UNSELECTED_FIELDS]: IField[];
  [AVAILABLE_FIELDS]: IField[];
  [QUERIED_FIELDS]: IField[];
}

export interface EmptyTabParams {
  tabIds: string[];
}

export interface ILogExplorerProps {
  pplService: PPLService;
  dslService: DSLService;
  savedObjects: SavedObjects;
  http: HttpStart;
  history: History;
  notifications: NotificationsStart;
  timestampUtils: TimestampUtils;
  setToast: (
    title: string,
    color?: string,
    text?: React.ReactChild | undefined,
    side?: string | undefined
  ) => void;
  savedObjectId: string;
  getExistingEmptyTab: (params: EmptyTabParams) => string;
  queryManager: QueryManager;
}

export interface IExplorerProps {
  pplService: PPLService;
  dslService: DSLService;
  tabId: string;
  savedObjects: SavedObjects;
  timestampUtils: TimestampUtils;
  history: History;
  notifications: NotificationsStart;
  savedObjectId: string;
  curSelectedTabId: React.MutableRefObject<undefined>;
  setToast: (
    title: string,
    color?: string,
    text?: React.ReactChild | undefined,
    side?: string | undefined
  ) => void;
  http: CoreStart['http'];
  tabCreatedTypes?: any;
  searchBarConfigs?: any;
  appId?: string;
  addVisualizationToPanel?: any;
  startTime?: string;
  endTime?: string;
  setStartTime?: any;
  setEndTime?: any;
  appBaseQuery?: string;
  callback?: any;
  callbackInApp?: any;
  queryManager?: QueryManager;
}

export interface SelectedDataSource {
  label: string;
  name: string;
  value: string;
  type: string;
  ds?: DataSourceType;
}

export interface SavedQuery extends SavedObjectAttributes {
  description: string;
  name: string;
  query: string;
  selected_date_range: { start: string; end: string; text: string };
  selected_fields: { text: string; tokens: IField[] };
  selected_timestamp: IField;
  dataSources: string; // list of type SelectedDataSources that is stringified
  queryLang: string;
}

export interface SavedVisualization extends SavedObjectAttributes {
  description: string;
  name: string;
  query: string;
  selected_date_range: { start: string; end: string; text: string };
  selected_fields: { text: string; tokens: [] };
  selected_timestamp: IField;
  type: string;
  subType?: 'metric' | 'visualization' | typeof PROMQL_METRIC_SUBTYPE; // exists if sub type is metric
  user_configs?: string;
  units_of_measure?: string;
  application_id?: string;
  dataSources: string; // list of type SelectedDataSources that is stringified
  queryLang: string;
}

export interface ExplorerDataType {
  jsonData: object[];
  jsonDataAll: object[];
}

export interface Query {
  index: string;
  isLoaded: boolean;
  objectType: string;
  rawQuery: string;
  savedObjectId: string;
  selectedDateRange: string[];
  selectedTimestamp: string;
  tabCreatedType: string;
  finalQuery?: string;
}

export interface ExplorerData {
  explorerData?: ExplorerDataType;
  explorerFields?: IExplorerFields;
  query?: Query;
  http?: HttpSetup;
  pplService?: PPLService;
}

export interface IVisualizationContainerPropsData {
  appData?: { fromApp: boolean };
  rawVizData?: any;
  query?: IQuery;
  indexFields?: IField[];
  userConfigs?: any;
  defaultAxes?: {
    xaxis: IField[];
    yaxis: IField[];
  };
  explorer?: ExplorerData;
}

export interface IVisualizationContainerPropsVis {
  vis: IVisualizationTypeDefination;
}

export interface IConfigPanelTab {
  id: string;
  name: string;
  mapTo: string;
  editor: React.ReactNode;
  sections: IConfigPanelOptions[];
  props?: any;
}

export interface IConfigPanelOptions {
  id: string;
  name: string;
  mapTo: string;
  editor: React.ReactNode;
  schemas: IConfigPanelOptionSection[];
}

export interface IConfigPanelOptionSection {
  name: string;
  component: null;
  mapTo: string;
  props?: any;
  isSingleSelection?: boolean;
  defaultState?: boolean | string;
  eleType?: string;
}

export interface IVisualizationTypeDefination {
  name: string;
  type: string;
  id: string;
  label: string;
  fulllabel: string;
  category: string;
  icon: React.ReactNode;
  editorconfig: {
    panelTabs: IConfigPanelTab;
  };
  visconfig: {
    layout: Partial<Plotly.Layout>;
    config: Partial<Plotly.Config>;
  };
  component: React.ReactNode;
}

export interface IVisualizationContainerProps {
  data: IVisualizationContainerPropsData;
  vis: IVisualizationContainerPropsVis;
}

export interface IDefaultTimestampState {
  hasSchemaConflict: boolean;
  default_timestamp: string;
  message: string;
}

export interface LiveTailProps {
  isLiveTailOn: boolean;
  setIsLiveTailPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  liveTailName: string;
  isLiveTailPopoverOpen: boolean;
  dataTestSubj: string;
}

export interface PatternTableData {
  count: number;
  pattern: string;
  sampleLog: string;
  anomalyCount?: number;
}

export interface ConfigListEntry {
  label: string;
  aggregation: string;
  [CUSTOM_LABEL]: string;
  name: string;
  side: string;
  type: string;
  alias?: string;
}

export interface HistogramConfigList {
  bucketSize: string;
  bucketOffset: string;
}

export interface DimensionSpan {
  time_field: IField[];
  interval: number;
  unit: TimeUnit[];
}

export interface ConfigList {
  [GROUPBY]?: ConfigListEntry[] | HistogramConfigList[];
  [AGGREGATIONS]?: ConfigListEntry[];
  [BREAKDOWNS]?: ConfigListEntry[] | HistogramConfigList[];
  span?: DimensionSpan;
  isVertical?: boolean;
}

export interface Breadcrumbs {
  text: string;
  href: string;
}

export interface EventAnalyticsProps {
  chrome: CoreSetup;
  parentBreadcrumbs: ChromeBreadcrumb[];
  pplService: any;
  dslService: any;
  savedObjects: SavedObjectsStart;
  timestampUtils: TimestampUtils;
  http: HttpStart;
  notifications: NotificationsStart;
  queryManager: QueryManager;
  setBreadcrumbs: (newBreadcrumbs: ChromeBreadcrumb[]) => void;
}

export interface DataConfigPanelProps {
  fieldOptionList: IField[];
  visualizations: IVisualizationContainerProps;
  queryManager?: QueryManager;
}

export interface GetTooltipHoverInfoType {
  tooltipMode: string;
  tooltipText: string;
}

export interface SelectedConfigItem {
  index: number;
  name: string;
}

export interface ParentUnitType {
  name: string;
  label: string;
  type: string;
}

export interface TreemapParentsProps {
  selectedAxis: ParentUnitType[];
  setSelectedParentItem: (item: { isClicked: boolean; index: number }) => void;
  handleUpdateParentFields: (arr: ParentUnitType[]) => void;
}

export interface DataConfigPanelFieldProps {
  list: ConfigListEntry[];
  dimensionSpan: DimensionSpan;
  sectionName: string;
  visType: VIS_CHART_TYPES;
  addButtonText: string;
  handleServiceAdd: (name: string) => void;
  handleServiceRemove: (index: number, name: string) => void;
  handleServiceEdit: (arrIndex: number, sectionName: string, isTimeStamp: boolean) => void;
}

export interface VisMeta {
  visId: string;
}

export interface VisualizationState {
  queryState: Query;
  visData: any;
  visConfMetadata: ConfigList;
  visMeta: VisMeta;
}

export interface VisSpecificMetaData {
  x_coordinate: string;
  y_coordinate: string;
}

export type MOMENT_UNIT_OF_TIME =
  | 'years'
  | 'y'
  | 'quarters'
  | 'Q'
  | 'months'
  | 'M'
  | 'weeks'
  | 'w'
  | 'days'
  | 'd'
  | 'hours'
  | 'h'
  | 'minutes'
  | 'm'
  | 'seconds'
  | 's'
  | 'milliseconds'
  | 'ms';

export interface GridSortingColumn {
  id: string;
  direction: 'asc' | 'desc';
}

export enum DirectQueryLoadingStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  RUNNING = 'running',
  SCHEDULED = 'scheduled',
  CANCELED = 'canceled',
  WAITING = 'waiting',
  INITIAL = 'initial',
}

export interface DirectQueryRequest {
  query: string;
  lang: string;
  datasource: string;
  sessionId?: string;
}
