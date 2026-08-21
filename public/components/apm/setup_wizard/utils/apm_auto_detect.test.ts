/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  detectApmData,
  detectApmDataAcrossDataSources,
  fieldNamesSatisfy,
} from './apm_auto_detect';
import {
  APM_LOGS_INDEX_PATTERN,
  APM_SERVICE_MAP_INDEX_PATTERN,
  APM_TRACES_INDEX_PATTERN,
} from '../../common/constants';
import { SavedObjectsClientContract } from '../../../../../../../src/core/public';
import { IndexPatternsContract } from '../../../../../../../src/plugins/data/public';

const traceFields = [
  { name: 'traceId', type: 'string' },
  { name: 'spanId', type: 'string' },
  { name: 'serviceName', type: 'string' },
  { name: 'endTime', type: 'date', aggregatable: true },
  { name: 'startTime', type: 'date', aggregatable: true },
];

const logFields = [
  { name: 'traceId', type: 'string' },
  { name: 'spanId', type: 'string' },
  { name: 'time', type: 'date', aggregatable: true },
];

// The v2 service map maps objects; getFieldsForWildcard returns their leaves as
// dotted paths (no bare `sourceNode` field), so detection must match by prefix.
const serviceMapFields = [
  { name: 'sourceNode.type', type: 'string' },
  { name: 'sourceNode.keyAttributes.name', type: 'string' },
  { name: 'targetNode.type', type: 'string' },
  { name: 'targetNode.keyAttributes.name', type: 'string' },
  { name: 'sourceOperation.name', type: 'string' },
  { name: 'targetOperation.name', type: 'string' },
  { name: 'nodeConnectionHash', type: 'string' },
  { name: 'timestamp', type: 'date', aggregatable: true },
];

/**
 * Builds an IndexPatternsContract stub whose getFieldsForWildcard returns the
 * fields configured per pattern (or throws when the pattern is marked missing).
 */
function makeIndexPatterns(
  byPattern: Record<
    string,
    Array<{ name: string; type?: string; aggregatable?: boolean }> | 'missing'
  >
): IndexPatternsContract {
  return {
    getFieldsForWildcard: jest.fn(async ({ pattern }: { pattern: string }) => {
      const entry = byPattern[pattern];
      if (!entry || entry === 'missing') {
        throw new Error(`no index matching ${pattern}`);
      }
      return entry;
    }),
  } as unknown as IndexPatternsContract;
}

describe('fieldNamesSatisfy', () => {
  it('matches when every required field is present exactly', () => {
    expect(
      fieldNamesSatisfy(
        ['traceId', 'spanId', 'serviceName', 'endTime'],
        ['traceId', 'spanId', 'serviceName']
      )
    ).toBe(true);
  });

  it('matches a required object field via its nested leaf paths', () => {
    // v2 service map: no bare `sourceNode`, only dotted leaves.
    expect(
      fieldNamesSatisfy(
        ['sourceNode.keyAttributes.name', 'targetNode.type', 'timestamp'],
        ['sourceNode', 'targetNode', 'timestamp']
      )
    ).toBe(true);
  });

  it('fails when a required field is absent', () => {
    expect(fieldNamesSatisfy(['traceId', 'endTime'], ['traceId', 'spanId'])).toBe(false);
  });

  it('does not treat a prefix collision as a match', () => {
    // `spanId` must not be satisfied by an unrelated `spanIdentifier` field.
    expect(fieldNamesSatisfy(['spanIdentifier'], ['spanId'])).toBe(false);
  });

  it('returns true for an empty requirement list', () => {
    expect(fieldNamesSatisfy(['anything'], [])).toBe(true);
  });
});

describe('detectApmData', () => {
  it('detects traces, logs and service map when all fields are present', async () => {
    const indexPatterns = makeIndexPatterns({
      [APM_TRACES_INDEX_PATTERN]: traceFields,
      [APM_LOGS_INDEX_PATTERN]: logFields,
      [APM_SERVICE_MAP_INDEX_PATTERN]: serviceMapFields,
    });

    const result = await detectApmData(indexPatterns);

    expect(result.tracesDetected).toBe(true);
    expect(result.tracePattern).toBe(APM_TRACES_INDEX_PATTERN);
    // endTime is preferred over startTime.
    expect(result.traceTimeField).toBe('endTime');
    expect(result.logsDetected).toBe(true);
    expect(result.logTimeField).toBe('time');
    expect(result.serviceMapDetected).toBe(true);
    expect(result.serviceMapPattern).toBe(APM_SERVICE_MAP_INDEX_PATTERN);
    expect(result.serviceMapTimeField).toBe('timestamp');
  });

  it('does not detect traces when required fields are missing', async () => {
    const indexPatterns = makeIndexPatterns({
      // spanId + serviceName absent → not a valid trace index.
      [APM_TRACES_INDEX_PATTERN]: [
        { name: 'traceId', type: 'string' },
        { name: 'endTime', type: 'date', aggregatable: true },
      ],
    });

    const result = await detectApmData(indexPatterns);

    expect(result.tracesDetected).toBe(false);
    expect(result.tracePattern).toBeNull();
  });

  it('does not detect traces when no valid time field exists', async () => {
    const indexPatterns = makeIndexPatterns({
      [APM_TRACES_INDEX_PATTERN]: [
        { name: 'traceId', type: 'string' },
        { name: 'spanId', type: 'string' },
        { name: 'serviceName', type: 'string' },
        // endTime present but not aggregatable → filtered out by isValidTimeField.
        { name: 'endTime', type: 'date', aggregatable: false },
      ],
    });

    const result = await detectApmData(indexPatterns);

    expect(result.tracesDetected).toBe(false);
  });

  it('detects service map independently of traces', async () => {
    const indexPatterns = makeIndexPatterns({
      [APM_TRACES_INDEX_PATTERN]: 'missing',
      [APM_LOGS_INDEX_PATTERN]: 'missing',
      [APM_SERVICE_MAP_INDEX_PATTERN]: serviceMapFields,
    });

    const result = await detectApmData(indexPatterns);

    expect(result.tracesDetected).toBe(false);
    expect(result.logsDetected).toBe(false);
    expect(result.serviceMapDetected).toBe(true);
  });

  it('returns all-false when nothing matches', async () => {
    const indexPatterns = makeIndexPatterns({});

    const result = await detectApmData(indexPatterns);

    expect(result.tracesDetected).toBe(false);
    expect(result.logsDetected).toBe(false);
    expect(result.serviceMapDetected).toBe(false);
  });
});

describe('detectApmDataAcrossDataSources', () => {
  it('returns a result for each data source (matched or not) and no synthetic local cluster', async () => {
    const savedObjects = {
      find: jest.fn(async () => ({
        savedObjects: [
          { id: 'ds-1', attributes: { title: 'Cluster A' } },
          { id: 'ds-2', attributes: { title: 'Cluster B' } },
        ],
      })),
    } as unknown as SavedObjectsClientContract;

    // Only ds-1 has traces; ds-2 has nothing.
    const indexPatterns = {
      getFieldsForWildcard: jest.fn(async ({ pattern, dataSourceId }) => {
        if (dataSourceId === 'ds-1' && pattern === APM_TRACES_INDEX_PATTERN) {
          return traceFields;
        }
        throw new Error('no match');
      }),
    } as unknown as IndexPatternsContract;

    const results = await detectApmDataAcrossDataSources(savedObjects, indexPatterns);

    // Registered data sources exist, so the synthetic "Local Cluster" is hidden.
    expect(results).toHaveLength(2);
    expect(results.some((r) => r.dataSourceId === undefined)).toBe(false);

    const ds1 = results.find((r) => r.dataSourceId === 'ds-1');
    expect(ds1?.dataSourceTitle).toBe('Cluster A');
    expect(ds1?.tracesDetected).toBe(true);

    const ds2 = results.find((r) => r.dataSourceId === 'ds-2');
    expect(ds2?.dataSourceTitle).toBe('Cluster B');
    expect(ds2?.tracesDetected).toBe(false);
    expect(ds2?.serviceMapDetected).toBe(false);
  });

  it('still returns the local cluster when there are no data sources', async () => {
    const savedObjects = {
      find: jest.fn(async () => ({ savedObjects: [] })),
    } as unknown as SavedObjectsClientContract;

    const indexPatterns = {
      getFieldsForWildcard: jest.fn(async ({ pattern, dataSourceId }) => {
        if (dataSourceId === undefined && pattern === APM_SERVICE_MAP_INDEX_PATTERN) {
          return serviceMapFields;
        }
        throw new Error('no match');
      }),
    } as unknown as IndexPatternsContract;

    const results = await detectApmDataAcrossDataSources(savedObjects, indexPatterns);

    expect(results).toHaveLength(1);
    expect(results[0].dataSourceId).toBeUndefined();
    expect(results[0].dataSourceTitle).toBe('Local Cluster');
    expect(results[0].serviceMapDetected).toBe(true);
  });

  it('returns only the local cluster when data source lookup fails', async () => {
    const savedObjects = {
      find: jest.fn(async () => {
        throw new Error('boom');
      }),
    } as unknown as SavedObjectsClientContract;

    const indexPatterns = {
      getFieldsForWildcard: jest.fn(async () => {
        throw new Error('no match');
      }),
    } as unknown as IndexPatternsContract;

    const results = await detectApmDataAcrossDataSources(savedObjects, indexPatterns);

    expect(results).toHaveLength(1);
    expect(results[0].dataSourceId).toBeUndefined();
    expect(results[0].dataSourceTitle).toBe('Local Cluster');
  });
});
