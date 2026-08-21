/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Detects APM data per data source: traces (otel-v1-apm-span*), correlated logs
 * (logs-otel-v1*), and the v2 service map (otel-v2-apm-service-map*). Every
 * detection requires both the naming convention AND that the required fields
 * exist.
 */

import { SavedObjectsClientContract } from '../../../../../../../src/core/public';
import {
  DatasetField,
  isValidTimeField,
  pickTimeField,
} from '../../../../../../../src/plugins/data/common';
import { IndexPatternsContract } from '../../../../../../../src/plugins/data/public';
import {
  APM_LOGS_INDEX_PATTERN,
  APM_LOGS_REQUIRED_FIELDS,
  APM_LOGS_TIME_FIELD,
  APM_SERVICE_MAP_INDEX_PATTERN,
  APM_SERVICE_MAP_REQUIRED_FIELDS,
  APM_SERVICE_MAP_TIME_FIELD,
  APM_TRACES_INDEX_PATTERN,
  APM_TRACES_REQUIRED_FIELDS,
  APM_TRACES_TIME_FIELD_CANDIDATES,
} from '../../common/constants';
import { ApmDetectionResult } from '../types';

/** Minimal shape of a field returned by getFieldsForWildcard that we rely on. */
interface WildcardField {
  name: string;
  type?: string;
  aggregatable?: boolean;
}

const emptyResult = (dataSourceId?: string): ApmDetectionResult => ({
  dataSourceId,
  tracesDetected: false,
  tracePattern: null,
  traceTimeField: null,
  logsDetected: false,
  logPattern: null,
  logTimeField: null,
  serviceMapDetected: false,
  serviceMapPattern: null,
  serviceMapTimeField: null,
});

/**
 * Whether a set of field names satisfies all required fields. A requirement is
 * met by an exact match OR by a nested child field: the v2 service map maps
 * objects (e.g. `sourceNode`) whose leaves come back as dotted paths
 * (`sourceNode.keyAttributes.name`), so exact-name matching alone would miss them.
 */
export const fieldNamesSatisfy = (fieldNames: string[], required: readonly string[]): boolean => {
  const nameSet = new Set(fieldNames);
  return required.every(
    (name) => nameSet.has(name) || fieldNames.some((n) => n.startsWith(`${name}.`))
  );
};

const hasAllFields = (fields: WildcardField[], required: readonly string[]): boolean =>
  fieldNamesSatisfy(
    fields.map((f) => f.name),
    required
  );

/**
 * Detect APM data for a single data source following OpenTelemetry conventions.
 * Probes traces (otel-v1-apm-span*), correlated logs (logs-otel-v1*) and the v2
 * service map (otel-v2-apm-service-map*), validating required fields for each.
 */
export async function detectApmData(
  indexPatternsService: IndexPatternsContract,
  dataSourceId?: string
): Promise<ApmDetectionResult> {
  const result = emptyResult(dataSourceId);

  // Traces: otel-v1-apm-span*
  try {
    const traceFields = (await indexPatternsService.getFieldsForWildcard({
      pattern: APM_TRACES_INDEX_PATTERN,
      dataSourceId,
    })) as WildcardField[];

    if (hasAllFields(traceFields, APM_TRACES_REQUIRED_FIELDS)) {
      const validDateFieldNames = traceFields
        .filter((f) => isValidTimeField({ type: '', ...f } as DatasetField))
        .map((f) => f.name);
      const traceTimeField = pickTimeField(validDateFieldNames, [
        ...APM_TRACES_TIME_FIELD_CANDIDATES,
      ]);

      if (traceTimeField) {
        result.tracesDetected = true;
        result.tracePattern = APM_TRACES_INDEX_PATTERN;
        result.traceTimeField = traceTimeField;
      }
    }
  } catch {
    // No matching indices; leave traces undetected.
  }

  // Correlated logs: logs-otel-v1*
  try {
    const logFields = (await indexPatternsService.getFieldsForWildcard({
      pattern: APM_LOGS_INDEX_PATTERN,
      dataSourceId,
    })) as WildcardField[];

    if (hasAllFields(logFields, APM_LOGS_REQUIRED_FIELDS)) {
      result.logsDetected = true;
      result.logPattern = APM_LOGS_INDEX_PATTERN;
      result.logTimeField = APM_LOGS_TIME_FIELD;
    }
  } catch {
    // No matching indices; leave logs undetected.
  }

  // Service map (v2): otel-v2-apm-service-map*
  try {
    const serviceMapFields = (await indexPatternsService.getFieldsForWildcard({
      pattern: APM_SERVICE_MAP_INDEX_PATTERN,
      dataSourceId,
    })) as WildcardField[];

    if (hasAllFields(serviceMapFields, APM_SERVICE_MAP_REQUIRED_FIELDS)) {
      result.serviceMapDetected = true;
      result.serviceMapPattern = APM_SERVICE_MAP_INDEX_PATTERN;
      result.serviceMapTimeField = APM_SERVICE_MAP_TIME_FIELD;
    }
  } catch {
    // No matching indices; leave service map undetected.
  }

  return result;
}

/** Max data sources probed for the picker; keeps the preview bounded. */
export const MAX_PROBED_DATA_SOURCES = 50;
/** How many data sources to probe concurrently (each probe = 3 field_caps). */
export const PROBE_CONCURRENCY = 6;

/** Run an async mapper over items in fixed-size concurrent chunks. */
export async function mapInChunks<T, R>(
  items: T[],
  size: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);

    out.push(...(await Promise.all(chunk.map(mapper))));
  }
  return out;
}

/**
 * Detect APM data for every OpenSearch data source (plus the local cluster),
 * returning one result per source regardless of whether anything was detected.
 * Callers use this to populate a data-source picker — each source is selectable
 * and each page independently checks the selected source's signals.
 *
 * Bounded to {@link MAX_PROBED_DATA_SOURCES} sources and probed in concurrent
 * chunks so a large fleet doesn't fire hundreds of requests at once.
 */
export async function detectApmDataAcrossDataSources(
  savedObjectsClient: SavedObjectsClientContract,
  indexPatternsService: IndexPatternsContract
): Promise<ApmDetectionResult[]> {
  const registered: Array<{ id?: string; title: string }> = [];

  try {
    const dataSourcesResp = await savedObjectsClient.find<{ title: string }>({
      type: 'data-source',
      perPage: MAX_PROBED_DATA_SOURCES,
    });
    for (const dataSource of dataSourcesResp.savedObjects) {
      registered.push({ id: dataSource.id, title: dataSource.attributes.title });
    }
  } catch {
    // Fetching data sources failed; fall back to just the local cluster.
  }

  // Only offer the synthetic "Local Cluster" entry when there are no registered
  // data sources — otherwise a `local_cluster` data source already covers it and
  // showing both is a confusing duplicate.
  const candidates: Array<{ id?: string; title: string }> =
    registered.length > 0 ? registered : [{ id: undefined, title: 'Local Cluster' }];

  return mapInChunks(candidates, PROBE_CONCURRENCY, async (candidate) => {
    try {
      const detection = await detectApmData(indexPatternsService, candidate.id);
      return { ...detection, dataSourceId: candidate.id, dataSourceTitle: candidate.title };
    } catch {
      return { ...emptyResult(candidate.id), dataSourceTitle: candidate.title };
    }
  });
}
