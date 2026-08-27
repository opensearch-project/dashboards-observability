/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createApmServiceMapDataset,
  createApmTraceDatasets,
  createOrReuseDataView,
  refreshAndPersistFields,
} from './apm_auto_create';
import { ApmDetectionResult } from '../types';
import {
  APM_SERVICE_MAP_INDEX_PATTERN,
  APM_TRACES_INDEX_PATTERN,
  APM_LOGS_INDEX_PATTERN,
} from '../../common/constants';
import { SavedObjectsClientContract } from '../../../../../../../src/core/public';
import { DataViewsContract } from '../../../../../../../src/plugins/data/public';

function makeDataViews(overrides: Partial<Record<string, jest.Mock>> = {}): DataViewsContract {
  return {
    getFieldsForWildcard: jest.fn(async () => [{ name: 'traceId' }]),
    fieldArrayToMap: jest.fn((fields) => fields),
    create: jest.fn(async (spec) => ({ id: 'new-view-id', ...spec })),
    createSavedObject: jest.fn(async () => undefined),
    get: jest.fn(async (id) => ({ id })),
    refreshFields: jest.fn(async () => undefined),
    updateSavedObject: jest.fn(async () => undefined),
    clearCache: jest.fn(),
    ...overrides,
  } as unknown as DataViewsContract;
}

function makeSavedObjects(
  overrides: Partial<Record<string, jest.Mock>> = {}
): SavedObjectsClientContract {
  return {
    find: jest.fn(async () => ({ total: 0, savedObjects: [] })),
    create: jest.fn(async () => ({ id: 'correlation-id' })),
    ...overrides,
  } as unknown as SavedObjectsClientContract;
}

const fullDetection: ApmDetectionResult = {
  dataSourceId: undefined,
  dataSourceTitle: 'Local Cluster',
  tracesDetected: true,
  tracePattern: APM_TRACES_INDEX_PATTERN,
  traceTimeField: 'endTime',
  logsDetected: true,
  logPattern: APM_LOGS_INDEX_PATTERN,
  logTimeField: 'time',
  serviceMapDetected: true,
  serviceMapPattern: APM_SERVICE_MAP_INDEX_PATTERN,
  serviceMapTimeField: 'timestamp',
};

describe('createOrReuseDataView', () => {
  it('reuses an existing DataView with the same title instead of creating', async () => {
    const dataViews = makeDataViews();
    const savedObjects = makeSavedObjects({
      find: jest.fn(async () => ({ total: 1, savedObjects: [{ id: 'existing-id' }] })),
    });

    const id = await createOrReuseDataView(savedObjects, dataViews, {
      title: APM_TRACES_INDEX_PATTERN,
    });

    expect(id).toBe('existing-id');
    expect(dataViews.create).not.toHaveBeenCalled();
    // Existing view still gets a field refresh.
    expect(dataViews.refreshFields).toHaveBeenCalled();
  });

  it('creates and persists a new DataView when none exists', async () => {
    const dataViews = makeDataViews();
    const savedObjects = makeSavedObjects();

    const id = await createOrReuseDataView(savedObjects, dataViews, {
      title: APM_SERVICE_MAP_INDEX_PATTERN,
      timeFieldName: 'timestamp',
    });

    expect(id).toBe('new-view-id');
    expect(dataViews.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: APM_SERVICE_MAP_INDEX_PATTERN }),
      true
    );
    expect(dataViews.createSavedObject).toHaveBeenCalled();
  });
});

describe('createApmTraceDatasets', () => {
  it('creates trace + log datasets and the trace-to-logs correlation', async () => {
    const dataViews = makeDataViews({
      create: jest
        .fn()
        .mockResolvedValueOnce({ id: 'trace-id' })
        .mockResolvedValueOnce({ id: 'log-id' }),
    });
    const savedObjects = makeSavedObjects();

    const result = await createApmTraceDatasets(savedObjects, dataViews, fullDetection);

    expect(result.traceDatasetId).toBe('trace-id');
    expect(result.logDatasetId).toBe('log-id');
    expect(result.correlationId).toBe('correlation-id');
    expect(result.correlatedLogsFailed).toBe(false);
    expect(savedObjects.create).toHaveBeenCalledWith(
      'correlations',
      expect.objectContaining({
        correlationType: expect.stringContaining('trace-to-logs-'),
      }),
      expect.objectContaining({
        references: expect.arrayContaining([
          expect.objectContaining({ id: 'trace-id' }),
          expect.objectContaining({ id: 'log-id' }),
        ]),
      })
    );
  });

  it('marks the trace DataView with signalType traces', async () => {
    const create = jest.fn(async (spec) => ({ id: 'trace-id', ...spec }));
    const dataViews = makeDataViews({ create });
    const savedObjects = makeSavedObjects();

    await createApmTraceDatasets(savedObjects, dataViews, {
      ...fullDetection,
      logsDetected: false,
      logPattern: null,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ signalType: 'traces', timeFieldName: 'endTime' }),
      true
    );
  });

  it('skips correlation creation when logs are not detected', async () => {
    const dataViews = makeDataViews({ create: jest.fn(async () => ({ id: 'trace-id' })) });
    const savedObjects = makeSavedObjects();

    const result = await createApmTraceDatasets(savedObjects, dataViews, {
      ...fullDetection,
      logsDetected: false,
      logPattern: null,
    });

    expect(result.logDatasetId).toBeNull();
    expect(result.correlationId).toBeNull();
    expect(result.correlatedLogsFailed).toBe(false);
    expect(savedObjects.create).not.toHaveBeenCalled();
  });

  it('flags correlatedLogsFailed when the correlated log dataset fails to create', async () => {
    const dataViews = makeDataViews({
      create: jest
        .fn()
        .mockResolvedValueOnce({ id: 'trace-id' })
        .mockRejectedValueOnce(new Error('log boom')),
    });
    const savedObjects = makeSavedObjects();

    const result = await createApmTraceDatasets(savedObjects, dataViews, fullDetection);

    // Trace creation still succeeds; the correlated-logs failure is surfaced,
    // not swallowed, and the correlation is not attempted.
    expect(result.traceDatasetId).toBe('trace-id');
    expect(result.logDatasetId).toBeNull();
    expect(result.correlationId).toBeNull();
    expect(result.correlatedLogsFailed).toBe(true);
    expect(savedObjects.create).not.toHaveBeenCalled();
  });

  it('flags correlatedLogsFailed when the correlation fails to create', async () => {
    const dataViews = makeDataViews({
      create: jest
        .fn()
        .mockResolvedValueOnce({ id: 'trace-id' })
        .mockResolvedValueOnce({ id: 'log-id' }),
    });
    const savedObjects = makeSavedObjects({
      create: jest.fn(async () => {
        throw new Error('correlation boom');
      }),
    });

    const result = await createApmTraceDatasets(savedObjects, dataViews, fullDetection);

    expect(result.traceDatasetId).toBe('trace-id');
    expect(result.logDatasetId).toBe('log-id');
    expect(result.correlationId).toBeNull();
    expect(result.correlatedLogsFailed).toBe(true);
  });
});

describe('createApmServiceMapDataset', () => {
  it('creates a plain service-map DataView (no signalType, timestamp time field)', async () => {
    const create = jest.fn(async (spec) => ({ id: 'sm-id', ...spec }));
    const dataViews = makeDataViews({ create });
    const savedObjects = makeSavedObjects();

    const id = await createApmServiceMapDataset(savedObjects, dataViews, fullDetection);

    expect(id).toBe('sm-id');
    const [spec] = create.mock.calls[0];
    expect(spec.title).toBe(APM_SERVICE_MAP_INDEX_PATTERN);
    expect(spec.timeFieldName).toBe('timestamp');
    expect(spec.signalType).toBeUndefined();
    expect(spec.schemaMappings).toBeUndefined();
  });

  it('returns null when service map was not detected', async () => {
    const dataViews = makeDataViews();
    const savedObjects = makeSavedObjects();

    const id = await createApmServiceMapDataset(savedObjects, dataViews, {
      ...fullDetection,
      serviceMapDetected: false,
      serviceMapPattern: null,
    });

    expect(id).toBeNull();
    expect(dataViews.create).not.toHaveBeenCalled();
  });
});

describe('refreshAndPersistFields', () => {
  it('refreshes and persists the DataView field list, clearing the cache', async () => {
    const dataViews = makeDataViews();

    await refreshAndPersistFields(dataViews, 'view-1');

    expect(dataViews.get).toHaveBeenCalledWith('view-1');
    expect(dataViews.refreshFields).toHaveBeenCalled();
    expect(dataViews.updateSavedObject).toHaveBeenCalled();
    expect(dataViews.clearCache).toHaveBeenCalledWith('view-1');
  });

  it('swallows errors by default (best-effort)', async () => {
    const dataViews = makeDataViews({
      get: jest.fn(async () => {
        throw new Error('boom');
      }),
    });

    await expect(refreshAndPersistFields(dataViews, 'view-1')).resolves.toBeUndefined();
  });

  it('rethrows when throwOnError is set', async () => {
    const dataViews = makeDataViews({
      refreshFields: jest.fn(async () => {
        throw new Error('boom');
      }),
    });

    await expect(refreshAndPersistFields(dataViews, 'view-1', true)).rejects.toThrow('boom');
  });
});
