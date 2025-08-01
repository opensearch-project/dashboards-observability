/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ShortDate } from '@elastic/eui';
import { DurationRange } from '@elastic/eui/src/components/date_picker/types';
import differenceWith from 'lodash/differenceWith';
import forEach from 'lodash/forEach';
import isEmpty from 'lodash/isEmpty';
import isEqual from 'lodash/isEqual';
import min from 'lodash/min';
import { Moment } from 'moment-timezone';
import React from 'react';
import { Layout } from 'react-grid-layout';
import { INDEX_DOCUMENT_NAME_PATTERN } from '../../../../common/constants/metrics';
import {
  OBSERVABILITY_BASE,
  OTEL_METRIC_SUBTYPE,
  PPL_INDEX_REGEX,
  PPL_METRIC_SUBTYPE,
  PPL_WHERE_CLAUSE_REGEX,
} from '../../../../common/constants/shared';
import { QueryManager } from '../../../../common/query_manager';
import {
  SavedVisualizationType,
  VisualizationType,
  VizContainerError,
} from '../../../../common/types/custom_panels';
import { SavedVisualization } from '../../../../common/types/explorer';
import { MetricType } from '../../../../common/types/metrics';
import { getOSDHttp, removeBacktick } from '../../../../common/utils';
import { getVizContainerProps } from '../../../components/visualizations/charts/helpers';
import PPLService from '../../../services/requests/ppl';
import { SavedObjectsActions } from '../../../services/saved_objects/saved_object_client/saved_objects_actions';
import { ObservabilitySavedVisualization } from '../../../services/saved_objects/saved_object_client/types';
import { convertDateTime, updateCatalogVisualizationQuery } from '../../common/query_utils';
import { getDefaultVisConfig } from '../../event_analytics/utils';
import { Visualization } from '../../visualizations/visualization';

/*
 * "Utils" This file contains different reused functions in operational panels
 *
 * checkIndexExists - Function to test if query string includes an index
 * checkWhereClauseExists - Function to test if query string includes where clause
 * createCatalogVisualizationMetaData - create Visualization metaData from visualization, query details
 * displayVisualization - Function to render the visualzation based of its type
 * fetchVisualizationById - Fetch visualization from SavedObject store by id
 * getQueryResponse - Get response of PPL query to load visualizations
 * isDateValid - Function to check date validity
 * isNameValid - Validates string to length > 0 and < 50
 * isPPLFilterValid - Validate if the panel PPL query doesn't contain any Index/Time/Field filters
 * mergeLayoutAndVisualizations - Function to merge current panel layout into the visualizations list
 * onTimeChange - Function to store recently used time filters and set start and end time.
 * parseSavedVisualizations - Transform SavedObject visualization into mapped record object
 * prepareMetricsData - Create visualization schema metadata from jsonData scheama list
 * prependRecentlyUsedRange - Maintain MRU list of datePicker selected ranges
 * processMetricsData - validate and transform jsonData schema into visualization schema metadata
 * renderCatalogVisualization - Query OS for visualization Data from PromQL metric schema
 * renderSavedVisualization - Query OS for visualization Data from PPL metric schema
 */

// Name validation 0>Name<=50
export const isNameValid = (name: string) => {
  return !(name.length >= 50 || name.length === 0);
};

// Merges new layout into visualizations
export const mergeLayoutAndVisualizations = (
  layout: Layout[],
  newVisualizationList: VisualizationType[],
  setPanelVisualizations: (value: React.SetStateAction<VisualizationType[]>) => void
) => {
  const newPanelVisualizations: VisualizationType[] = [];

  for (let i = 0; i < newVisualizationList.length; i++) {
    for (let j = 0; j < layout.length; j++) {
      if (newVisualizationList[i].id === layout[j].i) {
        newPanelVisualizations.push({
          ...newVisualizationList[i],
          x: layout[j].x,
          y: layout[j].y,
          w: layout[j].w,
          h: layout[j].h,
        });
      }
    }
  }
  setPanelVisualizations(newPanelVisualizations);
};

/* Update Span interval for a Query
 * Input query -> source = opensearch_dashboards_sample_data_logs | stats avg(bytes) by span(timestamp,1d)
 * spanParam -> 1M
 *
 * Updates the span command interval
 * Returns -> source = opensearch_dashboards_sample_data_logs | stats avg(bytes) by span(timestamp,1M)
 */
const updateQuerySpanInterval = (
  query: string,
  timestampField: string,
  span: number | string = '1',
  resolution: string = 'h'
) => {
  return query.replace(
    new RegExp(`span\\(\\s*${timestampField}\\s*,(.*?)\\)`),
    `span(${timestampField},${span}${resolution})`
  );
};

/* Builds Final Query by adding time and query filters(From panel UI) to the original visualization query
 * -> Final Query is as follows:
 * -> finalQuery = indexPartOfQuery + timeQueryFilter + panelFilterQuery + filterPartOfQuery
 * -> finalQuery = source=opensearch_dashboards_sample_data_flights
 *                  + | where utc_time > ‘2021-07-01 00:00:00’ and utc_time < ‘2021-07-02 00:00:00’
 *                  + | where Carrier='OpenSearch-Air'
 *                  + | stats sum(FlightDelayMin) as delays by Carrier
 *
 */
const queryAccumulator = (
  originalQuery: string,
  timestampField: string,
  startTime: string,
  endTime: string,
  panelFilterQuery: string
) => {
  const indexMatchArray = originalQuery.match(PPL_INDEX_REGEX);
  if (indexMatchArray == null) {
    throw Error('index not found in Query');
  }
  const indexPartOfQuery = indexMatchArray[0];
  const filterPartOfQuery = originalQuery.replace(PPL_INDEX_REGEX, '');
  const timeQueryFilter = ` | where ${timestampField} >= '${convertDateTime(
    startTime
  )}' and ${timestampField} <= '${convertDateTime(endTime, false)}'`;
  const pplFilterQuery = panelFilterQuery === '' ? '' : ` | ${panelFilterQuery}`;

  return indexPartOfQuery + timeQueryFilter + pplFilterQuery + filterPartOfQuery;
};

// Fetched Saved Visualization By Id
export const fetchVisualizationById = async (
  savedVisualizationId: string,
  setIsError: (error: VizContainerError) => void
) => {
  let savedVisualization = {} as SavedVisualization;

  await SavedObjectsActions.get({ objectId: savedVisualizationId })
    .then((res) => {
      const visualization = (res.observabilityObjectList[0] as ObservabilitySavedVisualization)
        .savedVisualization;
      savedVisualization = {
        ...visualization,
        id: res.observabilityObjectList[0].objectId,
        timeField: visualization.selected_timestamp.name,
      };
    })
    .catch((err) => {
      setIsError({
        errorMessage: `Could not locate saved visualization id: ${savedVisualizationId}`,
      });
      console.error('Issue in fetching the saved Visualization by Id', err);
    });
  return savedVisualization;
};

// Get PPL Query Response
export const getQueryResponse = async (
  pplService: PPLService,
  query: string,
  type: string,
  startTime: string,
  endTime: string,
  filterQuery = '',
  timestampField = 'timestamp',
  metricVisualization = false,
  dataSourceMDSId?: string
) => {
  const finalQuery = metricVisualization
    ? query
    : queryAccumulator(query, timestampField, startTime, endTime, filterQuery);

  const res = await pplService.fetch({ query: finalQuery, format: 'jdbc' }, dataSourceMDSId);

  if (res === undefined) throw new Error('Please check the validity of PPL Filter');

  return res;
};

// Fetches savedVisualization by Id and runs getQueryResponse
export const renderSavedVisualization = async ({
  pplService,
  startTime,
  endTime,
  filterQuery,
  span = '1',
  resolution = 'h',
  setVisualizationTitle,
  setVisualizationType,
  setVisualizationData,
  setVisualizationMetaData,
  setIsLoading,
  setIsError,
  visualization,
  dataSourceMDSId,
}: {
  pplService: PPLService;
  startTime: string;
  endTime: string;
  filterQuery: string;
  span?: number | string;
  resolution?: string;
  setVisualizationTitle: React.Dispatch<React.SetStateAction<string>>;
  setVisualizationType: React.Dispatch<React.SetStateAction<string>>;
  setVisualizationData: React.Dispatch<React.SetStateAction<Plotly.Data[]>>;
  setVisualizationMetaData: React.Dispatch<React.SetStateAction<undefined>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setIsError: React.Dispatch<React.SetStateAction<VizContainerError>>;
  visualization: SavedVisualizationType;
  dataSourceMDSId?: string;
}) => {
  setIsLoading(true);
  setIsError({} as VizContainerError);

  if (isEmpty(visualization)) {
    setIsLoading(false);
    return;
  }

  if (visualization.name) {
    setVisualizationTitle(visualization.name);
  }

  if (visualization.type) {
    setVisualizationType(visualization.type);
  }

  const updatedVisualizationQuery =
    span !== undefined
      ? updateQuerySpanInterval(visualization.query, visualization.timeField, span, resolution)
      : visualization.query;

  setVisualizationMetaData({ ...visualization, query: updatedVisualizationQuery });

  try {
    const queryData = await getQueryResponse(
      pplService,
      updatedVisualizationQuery,
      visualization.type,
      startTime,
      endTime,
      filterQuery,
      visualization.timeField,
      false,
      dataSourceMDSId
    );
    setVisualizationData(queryData);
  } catch (error) {
    setIsError({ error });
  }
  setIsLoading(false);
};

const dynamicLayoutFromQueryData = (queryData) => {
  const labelCount = queryData.jsonData.length;
  const legendLines = min([labelCount, 10]);

  const height = 230 + legendLines * 30;
  const y = -0.35 + -0.15 * legendLines;
  return {
    height,
    legend: { orientation: 'h', x: 0, y },
  };
};

const createCatalogVisualizationMetaData = ({
  catalogSource,
  query,
  type,
  subType,
  metricType,
  timeField,
  queryData,
}: {
  catalogSource: string;
  query: string;
  type: string;
  subType: string;
  metricType: string;
  timeField: string;
  queryData: object;
}) => {
  return {
    name: catalogSource,
    description: '',
    query,
    type,
    subType,
    metricType,
    selected_date_range: {
      start: 'now/y',
      end: 'now',
      text: '',
    },
    selected_timestamp: {
      name: timeField,
      type: 'timestamp',
    },
    selected_fields: {
      text: '',
      tokens: [],
    },
    userConfigs: {
      layout: dynamicLayoutFromQueryData(queryData),
    },
  };
};

// Creates a catalogVisualization for a runtime catalog based PPL query and runs getQueryResponse
export const renderCatalogVisualization = async ({
  pplService,
  catalogSource,
  startTime,
  endTime,
  filterQuery,
  span,
  resolution,
  setVisualizationTitle,
  setVisualizationType,
  setVisualizationData,
  setVisualizationMetaData,
  setIsLoading,
  setIsError,
  visualization,
  dataSourceMDSId,
}: {
  pplService: PPLService;
  catalogSource: string;
  startTime: string;
  endTime: string;
  filterQuery: string;
  span?: number | string;
  resolution?: string;
  setVisualizationTitle: React.Dispatch<React.SetStateAction<string>>;
  setVisualizationType: React.Dispatch<React.SetStateAction<string>>;
  setVisualizationData: React.Dispatch<React.SetStateAction<Plotly.Data[]>>;
  setVisualizationMetaData: React.Dispatch<React.SetStateAction<undefined>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setIsError: React.Dispatch<React.SetStateAction<VizContainerError>>;
  queryMetaData?: MetricType;
  visualization: SavedVisualizationType;
  dataSourceMDSId?: string;
}) => {
  setIsLoading(true);
  setIsError({} as VizContainerError);

  const visualizationType = 'line';
  const visualizationTimeField = '@timestamp';

  const visualizationQuery = updateCatalogVisualizationQuery({
    ...visualization.queryMetaData,
    start: startTime,
    end: endTime,
    span,
    resolution,
  });

  setVisualizationTitle(visualization.name);
  setVisualizationType(visualizationType);

  try {
    const queryData = await getQueryResponse(
      pplService,
      visualizationQuery,
      visualizationType,
      startTime,
      endTime,
      filterQuery,
      visualizationTimeField,
      true,
      dataSourceMDSId
    );
    setVisualizationData(queryData);

    const visualizationMetaData = createCatalogVisualizationMetaData({
      catalogSource,
      query: visualizationQuery,
      type: visualizationType,
      subType: visualization.subType,
      metricType: visualization.metricType,
      timeField: visualizationTimeField,
      queryData,
    });

    setVisualizationMetaData(visualizationMetaData);
  } catch (error) {
    setIsError({ error });
  }

  setIsLoading(false);
};

const createOtelVisualizationMetaData = (
  documentName: string,
  visualizationType: string,
  startTime: string,
  endTime: string,
  queryData: object
) => {
  return {
    name: documentName,
    description: '',
    query: '',
    type: visualizationType,
    subType: PPL_METRIC_SUBTYPE,
    metricType: OTEL_METRIC_SUBTYPE,
    selected_date_range: {
      start: startTime,
      end: endTime,
      text: '',
    },
    selected_fields: {
      text: '',
      tokens: [],
    },
    userConfigs: {
      layout: dynamicLayoutFromQueryData(queryData),
    },
  };
};

export const fetchAggregatedBinCount = async (
  minimumBound: string,
  maximumBound: string,
  startTime: string,
  endTime: string,
  documentName: string,
  selectedOtelIndex: string,
  setIsError: React.Dispatch<React.SetStateAction<VizContainerError>>,
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
  dataSourceMDSId: string
) => {
  const http = getOSDHttp();
  try {
    const response = await http.post(`${OBSERVABILITY_BASE}/metrics/otel/aggregatedBinCount`, {
      body: JSON.stringify({
        min: minimumBound,
        max: maximumBound,
        startTime,
        endTime,
        documentName,
        index: selectedOtelIndex,
        dataSourceMDSId: dataSourceMDSId ?? '',
      }),
    });
    return response;
  } catch (error) {
    const errorMessage = JSON.parse(error.body.message);
    setIsError({
      errorMessage: errorMessage.error.reason || 'Issue in fetching bucket count',
      errorDetails: errorMessage.error.details,
    });
    console.error(error.body);
  } finally {
    setIsLoading(false);
  }
};

export const fetchSampleOTDocument = async (
  selectedOtelIndex: string,
  documentName: string,
  dataSourceMDSId: string
) => {
  const http = getOSDHttp();
  try {
    const response = await http.get(
      `${OBSERVABILITY_BASE}/metrics/otel/${selectedOtelIndex}/${documentName}/${
        dataSourceMDSId ?? ''
      }`
    );
    return response;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

export const extractIndexAndDocumentName = (metricString: string): [string, string] | null => {
  const match = metricString.match(INDEX_DOCUMENT_NAME_PATTERN);

  if (match) {
    const index = match[1];
    const documentName = match[2];
    return [index, documentName];
  } else {
    return null;
  }
};

export const renderOpenTelemetryVisualization = async ({
  startTime,
  endTime,
  setVisualizationTitle,
  setVisualizationType,
  setVisualizationData,
  setVisualizationMetaData,
  setIsLoading,
  setIsError,
  visualization,
  setToast,
  dataSourceMDSId,
}: {
  startTime: string;
  endTime: string;
  setVisualizationTitle: React.Dispatch<React.SetStateAction<string>>;
  setVisualizationType: React.Dispatch<React.SetStateAction<string>>;
  setVisualizationData: React.Dispatch<React.SetStateAction<Plotly.Data[]>>;
  setVisualizationMetaData: React.Dispatch<React.SetStateAction<undefined>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setIsError: React.Dispatch<React.SetStateAction<VizContainerError>>;
  visualization: any;
  setToast: (
    title: string,
    color?: string,
    text?: React.ReactChild | undefined,
    side?: string | undefined
  ) => void;
  dataSourceMDSId?: string;
}) => {
  setIsLoading(true);
  setIsError({} as VizContainerError);

  const visualizationType = 'bar';
  let index = visualization?.index;
  let documentName = visualization?.name;

  if (index === undefined) {
    const indexAndDocumentName = extractIndexAndDocumentName(visualization.name);
    index = indexAndDocumentName[0];
    documentName = indexAndDocumentName[1];
    if (documentName === undefined)
      setToast('Document name is undefined', 'danger', undefined, 'right');
  }

  const fetchSampleDocument = await fetchSampleOTDocument(index, documentName, dataSourceMDSId);
  const source = fetchSampleDocument.hits[0]._source;

  setVisualizationType(visualizationType);
  setVisualizationTitle(source.name);

  const dataBinsPromises = source.buckets.map(async (bucket: any) => {
    try {
      const formattedStartTime = convertDateTime(startTime, false, false, OTEL_METRIC_SUBTYPE);
      const formattedEndTime = convertDateTime(endTime, false, false, OTEL_METRIC_SUBTYPE);
      const fetchingAggregatedBinCount = await fetchAggregatedBinCount(
        bucket.min.toString(),
        bucket.max.toString(),
        formattedStartTime,
        formattedEndTime,
        documentName,
        index,
        setIsError,
        setIsLoading,
        dataSourceMDSId
      );

      return {
        xAxis: bucket.min + ' - ' + bucket.max,
        'count()': fetchingAggregatedBinCount?.nested_buckets?.bucket_range?.bucket_count?.value,
      };
    } catch (error) {
      console.error('Error processing bucket:', error);
      return null;
    }
  });
  const jsonData = await Promise.all(dataBinsPromises);
  const formatedJsonData = { jsonData };

  const visualizationMetaData = createOtelVisualizationMetaData(
    documentName,
    visualizationType,
    startTime,
    endTime,
    formatedJsonData
  );
  setVisualizationData(formatedJsonData);
  setVisualizationMetaData(visualizationMetaData);
};

// Function to store recently used time filters and set start and end time.
export const prependRecentlyUsedRange = (
  start: ShortDate,
  end: ShortDate,
  recentlyUsedRanges: DurationRange[]
) => {
  const deduplicatedRanges = rejectRecentRange(recentlyUsedRanges, { start, end });

  return [{ start, end }, ...deduplicatedRanges];
};

const rejectRecentRange = (rangeList, toReject) => {
  return rangeList.filter((r) => !(r.start === toReject.start && r.end === toReject.end));
};
/**
 * Convert an ObservabilitySavedVisualization into SavedVisualizationType,
 * which is used in panels.
 */
export const parseSavedVisualizations = (
  visualization: ObservabilitySavedVisualization
): SavedVisualizationType => {
  return {
    id: visualization.objectId,
    name: visualization.savedVisualization.name,
    query: visualization.savedVisualization.query,
    type: visualization.savedVisualization.type,
    timeField: visualization.savedVisualization.selected_timestamp.name,
    selected_date_range: visualization.savedVisualization.selected_date_range,
    selected_fields: visualization.savedVisualization.selected_fields,
    userConfigs: visualization.savedVisualization.userConfigs || {},
    subType: visualization.savedVisualization.hasOwnProperty('subType')
      ? visualization.savedVisualization.subType
      : '',
    metricType: visualization.savedVisualization.hasOwnProperty('metricType')
      ? visualization.savedVisualization.metricType
      : '',
    units_of_measure: visualization.savedVisualization.hasOwnProperty('units_of_measure')
      ? visualization.savedVisualization.units_of_measure
      : '',
    ...(visualization.savedVisualization.application_id
      ? { application_id: visualization.savedVisualization.application_id }
      : {}),
  };
};

// Function to check date validity
export const isDateValid = (
  start: string | Moment | undefined,
  end: string | Moment | undefined,
  setToast: (
    title: string,
    color?: string,
    text?: React.ReactChild | undefined,
    side?: string | undefined
  ) => void,
  side?: string | undefined
) => {
  if (end! < start!) {
    setToast('Time range entered is invalid', 'danger', undefined, side);
    return false;
  } else return true;
};

// Check for time filter in query
const checkIndexExists = (query: string) => {
  return PPL_INDEX_REGEX.test(query);
};

// Check if the filter query starts with a where clause
const checkWhereClauseExists = (query: string) => {
  return PPL_WHERE_CLAUSE_REGEX.test(query);
};

// Check PPL Query in Panel UI
// Validate if the query doesn't contain any Index
export const isPPLFilterValid = (
  query: string,
  setToast: (
    title: string,
    color?: string,
    text?: React.ReactChild | undefined,
    side?: string | undefined
  ) => void
) => {
  if (checkIndexExists(query)) {
    setToast('Please remove index from PPL Filter', 'danger', undefined);
    return false;
  }
  if (query && !checkWhereClauseExists(query)) {
    setToast('PPL filters should start with a where clause', 'danger', undefined);
    return false;
  }
  return true;
};

export const processMetricsData = (schema: any) => {
  if (isEmpty(schema)) return {};
  if (
    schema.length === 3 &&
    schema.every((schemaField) => ['@labels', '@value', '@timestamp'].includes(schemaField.name))
  ) {
    return prepareMetricsData(schema);
  }
  return {};
};

export const prepareMetricsData = (schema: any) => {
  const metricBreakdown: any[] = [];
  const metricSeries: any[] = [];
  const metricDimension: any[] = [];

  forEach(schema, (field) => {
    if (field.name === '@timestamp')
      metricDimension.push({ name: '@timestamp', label: '@timestamp' });
    if (field.name === '@labels') metricBreakdown.push({ name: '@labels', customLabel: '@labels' });
    if (field.name === '@value') metricSeries.push({ name: '@value', label: '@value' });
  });

  return {
    breakdowns: metricBreakdown,
    series: metricSeries,
    dimensions: metricDimension,
    span: {},
  };
};

export const constructOtelMetricsMetaData = () => {
  const otelMetricSeries: any[] = [];
  const otelMetricDimension: any[] = [];

  otelMetricDimension.push({ name: 'xAxis', label: 'xAxis', customLabel: '' });
  otelMetricSeries.push({ name: '', label: '', aggregation: 'count', customLabel: '' });

  return {
    series: otelMetricSeries,
    dimensions: otelMetricDimension,
    span: {},
  };
};

export const parseMetadataUserConfig = (
  userConfigs?: string | SavedObjectAttributes
): SavedObjectAttributes => {
  if (userConfigs === undefined || userConfigs === '') {
    return {};
  } else if (typeof userConfigs === 'string') {
    return JSON.parse(userConfigs);
  } else {
    return userConfigs;
  }
};

// Renders visualization in the vizualization container component
export const displayVisualization = (metaData: any, data: any, type: string) => {
  if (metaData === undefined || isEmpty(metaData)) {
    return <></>;
  }

  metaData.userConfigs = parseMetadataUserConfig(metaData.userConfigs);
  const dataConfig = { ...(metaData.userConfigs?.dataConfig || {}) };
  const hasBreakdowns = !isEmpty(dataConfig.breakdowns);
  const realTimeParsedStats = {
    ...getDefaultVisConfig(new QueryManager().queryParser().parse(metaData.query).getStats()),
  };
  let finalDimensions = [...(realTimeParsedStats.dimensions || [])];
  const breakdowns = [...(dataConfig.breakdowns || [])];

  // filter out breakdowns from dimnesions
  if (hasBreakdowns) {
    finalDimensions = differenceWith(finalDimensions, breakdowns, (dimn, brkdwn) =>
      isEqual(removeBacktick(dimn.name), removeBacktick(brkdwn.name))
    );
  }

  let finalDataConfig = {
    ...dataConfig,
    ...realTimeParsedStats,
    dimensions: finalDimensions,
    breakdowns,
  };

  // add metric specific overriding
  finalDataConfig = { ...finalDataConfig, ...processMetricsData(data.schema) };

  // add otel metric specific overriding
  if (metaData?.metricType === OTEL_METRIC_SUBTYPE) {
    finalDataConfig = { ...finalDataConfig, ...constructOtelMetricsMetaData() };
  }

  const mixedUserConfigs = {
    availabilityConfig: {
      ...(metaData.userConfigs?.availabilityConfig || {}),
    },
    dataConfig: {
      ...finalDataConfig,
    },
    layout: {
      ...(metaData.userConfigs?.layout || {}),
    },
  };

  return (
    <Visualization
      visualizations={getVizContainerProps({
        vizId: type,
        rawVizData: data,
        query: { rawQuery: metaData.query },
        indexFields: {},
        userConfigs: mixedUserConfigs,
        explorer: { explorerData: data, explorerFields: data.schema },
      })}
    />
  );
};

export const onTimeChange = (
  start: ShortDate,
  end: ShortDate,
  recentlyUsedRanges: DurationRange[]
) => {
  const updatedRanges = recentlyUsedRanges.filter((recentlyUsedRange) => {
    const isDuplicate = recentlyUsedRange.start === start && recentlyUsedRange.end === end;
    return !isDuplicate;
  });
  updatedRanges.unshift({ start, end });
  return { start, end, updatedRanges };
};
