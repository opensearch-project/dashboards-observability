/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Adapted from src/plugins/explore/public/utils/create_auto_datasets.ts and
 * generalized for APM. Reuses the same create-or-reuse DataView helper for
 * traces, correlated logs, and the v2 service map, and creates the
 * trace-to-logs correlation saved object.
 */

import { SavedObjectsClientContract } from '../../../../../../../src/core/public';
import { CORRELATION_TYPE_PREFIXES } from '../../../../../../../src/plugins/data/common';
import {
  DataViewsContract,
  DuplicateDataViewError,
  IndexPatternSpec,
} from '../../../../../../../src/plugins/data/public';
import { APM_LOGS_SCHEMA_MAPPINGS, APM_SERVICE_MAP_TIME_FIELD } from '../constants';
import { ApmDetectionResult } from '../types';

export interface CreateApmDatasetsResult {
  traceDatasetId: string | null;
  logDatasetId: string | null;
  serviceMapDatasetId: string | null;
  correlationId: string | null;
}

// Pre-fetch the field list ourselves before saving the index pattern, so the
// saved object lands with a populated field list regardless of whether
// refreshFields silently fails.
async function fetchFieldsForPattern(
  dataViews: DataViewsContract,
  pattern: string,
  dataSourceId?: string
) {
  try {
    const fields = await dataViews.getFieldsForWildcard({ pattern, dataSourceId });
    if (!Array.isArray(fields) || fields.length === 0) {
      console.warn(`No fields returned for pattern "${pattern}" (dataSource: ${dataSourceId})`);
      return undefined;
    }
    return dataViews.fieldArrayToMap(fields);
  } catch (error) {
    console.warn(`Failed to fetch fields for pattern "${pattern}":`, error);
    return undefined;
  }
}

/**
 * Force-refresh an existing index pattern's field list from the cluster and
 * persist it. Used both after create/reuse and by the wizard's "Refresh fields"
 * action for a DataView whose stored fields are stale.
 *
 * By default this is best-effort (errors swallowed); pass `throwOnError` when
 * the caller wants to surface a failure (e.g. show a toast).
 */
export async function refreshAndPersistFields(
  dataViews: DataViewsContract,
  id: string,
  throwOnError = false
): Promise<void> {
  try {
    dataViews.clearCache(id);
    const view = await dataViews.get(id);
    await dataViews.refreshFields(view);
    await dataViews.updateSavedObject(view);
    dataViews.clearCache(id);
  } catch (error) {
    if (throwOnError) {
      throw error;
    }
    // best-effort otherwise
  }
}

/**
 * Create a DataView from a spec, or reuse an existing one with the same title
 * (scoped to the same data source). Idempotent: safe to call repeatedly.
 */
export async function createOrReuseDataView(
  savedObjectsClient: SavedObjectsClientContract,
  dataViews: DataViewsContract,
  spec: IndexPatternSpec,
  effectiveDataSourceId?: string
): Promise<string | null> {
  const existing = await savedObjectsClient.find({
    type: 'index-pattern',
    searchFields: ['title'],
    search: spec.title as string,
    hasReference: effectiveDataSourceId
      ? { type: 'data-source', id: effectiveDataSourceId }
      : undefined,
  });

  if (existing.total > 0) {
    const existingId = existing.savedObjects[0].id;
    await refreshAndPersistFields(dataViews, existingId);
    return existingId;
  }

  const fields = await fetchFieldsForPattern(
    dataViews,
    spec.title as string,
    effectiveDataSourceId
  );

  let createdId: string | null = null;
  try {
    // Skip createAndSave so it doesn't silently flip the workspace's default index pattern.
    const dataView = await dataViews.create({ ...spec, fields }, /* skipFetchFields */ true);
    await dataViews.createSavedObject(dataView);
    createdId = dataView.id ?? null;
  } catch (error) {
    if (error instanceof DuplicateDataViewError) {
      const dupe = await savedObjectsClient.find({
        type: 'index-pattern',
        searchFields: ['title'],
        search: spec.title as string,
        hasReference: effectiveDataSourceId
          ? { type: 'data-source', id: effectiveDataSourceId }
          : undefined,
      });
      createdId = dupe.savedObjects[0]?.id ?? null;
    } else {
      throw error;
    }
  }

  if (createdId) {
    await refreshAndPersistFields(dataViews, createdId);
  }
  return createdId;
}

/**
 * Create the APM trace dataset (and, when detected, the correlated log dataset
 * plus the trace-to-logs correlation) for a single detected data source.
 * Mirrors the explore plugin's one-step trace onboarding.
 */
export async function createApmTraceDatasets(
  savedObjectsClient: SavedObjectsClientContract,
  dataViews: DataViewsContract,
  detection: ApmDetectionResult,
  dataSourceId?: string
): Promise<CreateApmDatasetsResult> {
  const result: CreateApmDatasetsResult = {
    traceDatasetId: null,
    logDatasetId: null,
    serviceMapDatasetId: null,
    correlationId: null,
  };

  const effectiveDataSourceId = detection.dataSourceId || dataSourceId;
  const dataSourceSuffix = detection.dataSourceTitle ? ` - ${detection.dataSourceTitle}` : '';
  const dataSourceRef = effectiveDataSourceId
    ? { id: effectiveDataSourceId, type: 'data-source', name: 'dataSource' }
    : undefined;

  if (detection.tracesDetected && detection.tracePattern && detection.traceTimeField) {
    try {
      result.traceDatasetId = await createOrReuseDataView(
        savedObjectsClient,
        dataViews,
        {
          title: detection.tracePattern,
          displayName: `Trace Dataset${dataSourceSuffix}`,
          timeFieldName: detection.traceTimeField,
          signalType: 'traces',
          // @ts-expect-error TS2322 IndexPatternSpec types dataSourceRef as SavedObjectReference
          // which incorrectly requires `version`; runtime only uses id/type/name.
          dataSourceRef,
        },
        effectiveDataSourceId
      );
    } catch (createError) {
      console.warn('Failed to create trace dataset:', createError);
    }
  }

  if (detection.logsDetected && detection.logPattern && detection.logTimeField) {
    try {
      result.logDatasetId = await createOrReuseDataView(
        savedObjectsClient,
        dataViews,
        {
          title: detection.logPattern,
          displayName: `Log Dataset${dataSourceSuffix}`,
          timeFieldName: detection.logTimeField,
          signalType: 'logs',
          schemaMappings: { ...APM_LOGS_SCHEMA_MAPPINGS },
          // @ts-expect-error TS2322 see note above on trace dataset.
          dataSourceRef,
        },
        effectiveDataSourceId
      );
    } catch (createError) {
      console.warn('Failed to create log dataset:', createError);
    }
  }

  if (result.traceDatasetId && result.logDatasetId) {
    try {
      const correlationResponse = await savedObjectsClient.create(
        'correlations',
        {
          title: `trace-to-logs_${detection.tracePattern}`,
          correlationType: `${CORRELATION_TYPE_PREFIXES.TRACE_TO_LOGS}${detection.tracePattern}`,
          version: '1.0.0',
          entities: [
            { tracesDataset: { id: 'references[0].id' } },
            { logsDataset: { id: 'references[1].id' } },
          ],
        },
        {
          references: [
            { name: 'entities[0].index', type: 'index-pattern', id: result.traceDatasetId },
            { name: 'entities[1].index', type: 'index-pattern', id: result.logDatasetId },
          ],
        }
      );
      result.correlationId = correlationResponse.id;
    } catch (error) {
      console.warn('Failed to create correlation:', error);
    }
  }

  return result;
}

/**
 * Create the APM v2 service-map dataset for a detected data source. The service
 * map is a plain index-pattern (no signalType, no schemaMappings), keyed on the
 * `timestamp` time field — matching the working DataView.
 */
export async function createApmServiceMapDataset(
  savedObjectsClient: SavedObjectsClientContract,
  dataViews: DataViewsContract,
  detection: ApmDetectionResult,
  dataSourceId?: string
): Promise<string | null> {
  if (!detection.serviceMapDetected || !detection.serviceMapPattern) {
    return null;
  }

  const effectiveDataSourceId = detection.dataSourceId || dataSourceId;
  const dataSourceSuffix = detection.dataSourceTitle ? ` - ${detection.dataSourceTitle}` : '';
  const dataSourceRef = effectiveDataSourceId
    ? { id: effectiveDataSourceId, type: 'data-source', name: 'dataSource' }
    : undefined;

  try {
    return await createOrReuseDataView(
      savedObjectsClient,
      dataViews,
      {
        title: detection.serviceMapPattern,
        displayName: `Service Map Dataset${dataSourceSuffix}`,
        timeFieldName: detection.serviceMapTimeField || APM_SERVICE_MAP_TIME_FIELD,
        // @ts-expect-error TS2322 see note on trace dataset dataSourceRef typing.
        dataSourceRef,
      },
      effectiveDataSourceId
    );
  } catch (createError) {
    console.warn('Failed to create service map dataset:', createError);
    return null;
  }
}
