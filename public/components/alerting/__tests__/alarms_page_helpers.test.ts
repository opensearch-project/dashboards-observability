/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ALERT_MANAGER_END_TIME_KEY,
  ALERT_MANAGER_START_TIME_KEY,
  DEFAULT_END_TIME,
  DEFAULT_START_TIME,
  extractPplValidationError,
  extractServerErrorMessage,
  formStateToRule,
  isAlertingConfigMissingError,
  loadPersistedEndTime,
  loadPersistedSelection,
  loadPersistedStartTime,
  persistSelection,
  persistTimeRange,
  resolveDatasourceTokens,
} from '../alarms_page_helpers';
import type { Datasource } from '../../../../common/types/alerting';
import type { MonitorFormState } from '../create_monitor';

describe('alarms_page_helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  describe('loadPersistedSelection / persistSelection', () => {
    it('round-trips a string array', () => {
      persistSelection('test-key', ['a', 'b', 'c']);
      expect(loadPersistedSelection('test-key')).toEqual(['a', 'b', 'c']);
    });

    it('returns [] when the storage entry is missing', () => {
      expect(loadPersistedSelection('absent-key')).toEqual([]);
    });

    it('returns [] when the stored value is non-JSON', () => {
      window.localStorage.setItem('bad-key', '{not-json');
      expect(loadPersistedSelection('bad-key')).toEqual([]);
    });

    it('filters non-string entries silently', () => {
      window.localStorage.setItem('mixed', JSON.stringify(['a', 1, null, 'b']));
      expect(loadPersistedSelection('mixed')).toEqual(['a', 'b']);
    });

    it('returns [] when the stored value is not an array', () => {
      window.localStorage.setItem('shape', JSON.stringify({ wrong: 'shape' }));
      expect(loadPersistedSelection('shape')).toEqual([]);
    });
  });

  describe('time-range persistence', () => {
    it('falls back to defaults when sessionStorage is empty', () => {
      expect(loadPersistedStartTime()).toBe(DEFAULT_START_TIME);
      expect(loadPersistedEndTime()).toBe(DEFAULT_END_TIME);
    });

    it('reads back what persistTimeRange wrote', () => {
      persistTimeRange('now-7d', 'now-1h');
      expect(window.sessionStorage.getItem(ALERT_MANAGER_START_TIME_KEY)).toBe('now-7d');
      expect(window.sessionStorage.getItem(ALERT_MANAGER_END_TIME_KEY)).toBe('now-1h');
      expect(loadPersistedStartTime()).toBe('now-7d');
      expect(loadPersistedEndTime()).toBe('now-1h');
    });
  });

  describe('resolveDatasourceTokens', () => {
    const ds: Datasource[] = [
      {
        id: 'ds-1',
        name: 'Local Cluster',
        type: 'opensearch',
        url: 'local',
        enabled: true,
        mdsId: 'mds-local',
      },
      {
        id: 'ds-2',
        name: 'prom-prod',
        type: 'prometheus',
        url: 'ds-2',
        enabled: true,
        directQueryName: 'prom_prod',
      },
    ];

    it('matches by id, name, mdsId, and directQueryName, case-insensitively', () => {
      expect(resolveDatasourceTokens(['DS-1', 'prom_prod', 'mds-LOCAL'], ds)).toEqual([
        'ds-1',
        'ds-2',
      ]);
    });

    it('drops unknown tokens silently and dedupes', () => {
      expect(resolveDatasourceTokens(['typo', 'Local Cluster', 'local cluster'], ds)).toEqual([
        'ds-1',
      ]);
    });

    it('preserves input order', () => {
      expect(resolveDatasourceTokens(['prom-prod', 'Local Cluster'], ds)).toEqual(['ds-2', 'ds-1']);
    });

    it('skips non-string entries', () => {
      expect(resolveDatasourceTokens((['ds-1', 5, null] as unknown) as string[], ds)).toEqual([
        'ds-1',
      ]);
    });
  });

  describe('isAlertingConfigMissingError', () => {
    it('matches the index-not-found / IndexNotFoundException variants', () => {
      expect(
        isAlertingConfigMissingError(
          'index_not_found_exception: no such index [.opendistro-alerting-config]'
        )
      ).toBe(true);
      expect(
        isAlertingConfigMissingError('IndexNotFoundException: .opendistro-alerting-config gone')
      ).toBe(true);
    });

    it('matches the alerting_exception variant', () => {
      expect(
        isAlertingConfigMissingError(
          'alerting_exception: .opendistro-alerting-config not configured'
        )
      ).toBe(true);
    });

    it('does not match unrelated errors', () => {
      expect(isAlertingConfigMissingError('connect ECONNREFUSED')).toBe(false);
      expect(isAlertingConfigMissingError(undefined)).toBe(false);
      expect(isAlertingConfigMissingError('')).toBe(false);
    });
  });

  describe('formStateToRule', () => {
    function osForm(): MonitorFormState {
      return ({
        datasourceType: 'opensearch',
        datasourceId: 'ds-os',
        name: 'mon-1',
        enabled: true,
        severity: 'high',
        query: 'source = logs-* | stats count() as cnt',
        threshold: { operator: '>', value: 10, unit: '' },
        labels: [{ key: 'team', value: 'platform' }],
        annotations: [{ key: 'description', value: 'a desc' }],
        evaluationInterval: '1m',
        pendingPeriod: '5m',
        indices: ['logs-*', 'metrics-*'],
        timeField: '@timestamp',
        monitorType: 'ppl_monitor',
        pplTriggers: [],
        schedule: { interval: 1, unit: 'MINUTES' },
      } as unknown) as MonitorFormState;
    }

    it('writes the picked indices into a label and the description', () => {
      const rule = formStateToRule(osForm(), 'ds-fallback');
      expect(rule.labels.indices).toBe('logs-*, metrics-*');
      expect(rule.description).toContain('logs-*, metrics-*');
      expect(rule.monitorType).toBe('ppl');
    });

    it('falls back to fallbackDsId when the form omits datasourceId', () => {
      const f = osForm() as { datasourceId: string };
      f.datasourceId = '';
      const rule = formStateToRule((f as unknown) as MonitorFormState, 'ds-fallback');
      expect(rule.datasourceId).toBe('ds-fallback');
    });

    it('emits prometheus shape when datasourceType is prometheus', () => {
      const promForm = ({
        datasourceType: 'prometheus',
        datasourceId: 'ds-prom',
        name: 'cpu',
        enabled: true,
        severity: 'medium',
        query: 'rate(cpu[5m])',
        threshold: { operator: '>', value: 80, unit: '%', forDuration: '5m' },
        evaluationInterval: '1m',
        pendingPeriod: '5m',
        firingPeriod: '10m',
        labels: [{ key: 'env', value: 'prod' }],
        annotations: [{ key: 'description', value: 'cpu hot' }],
      } as unknown) as MonitorFormState;
      const rule = formStateToRule(promForm, 'ds-fallback');
      expect(rule.datasourceType).toBe('prometheus');
      expect(rule.monitorType).toBe('metric');
      expect(rule.firingPeriod).toBe('10m');
    });
  });

  describe('extractServerErrorMessage', () => {
    it('prefers `body.message` over `Error.message`', () => {
      // Shape mirrors OSD core's IHttpFetchError: HTTP status text on the
      // outer Error.message, actionable detail on body.message.
      const err = Object.assign(new Error('Bad Request'), {
        body: {
          statusCode: 400,
          error: 'Bad Request',
          message: 'alerting_exception: PPL Query validation failed: ...',
        },
      });
      expect(extractServerErrorMessage(err)).toBe(
        'alerting_exception: PPL Query validation failed: ...'
      );
    });

    it('falls back to `body.error` when `body.message` is missing', () => {
      const err = Object.assign(new Error('Bad Request'), {
        body: { statusCode: 400, error: 'Validation failed' },
      });
      expect(extractServerErrorMessage(err)).toBe('Validation failed');
    });

    it('falls back to `Error.message` when no body is present', () => {
      expect(extractServerErrorMessage(new Error('boom'))).toBe('boom');
    });

    it('handles plain strings and unknown shapes', () => {
      expect(extractServerErrorMessage('a string')).toBe('a string');
      expect(extractServerErrorMessage(null)).toBe('Unknown error');
      expect(extractServerErrorMessage(undefined)).toBe('Unknown error');
      expect(extractServerErrorMessage(42)).toBe('42');
    });

    it('ignores empty `body.message` and falls through', () => {
      const err = Object.assign(new Error('Bad Request'), {
        body: { message: '', error: 'Something else' },
      });
      expect(extractServerErrorMessage(err)).toBe('Something else');
    });
  });

  describe('extractPplValidationError', () => {
    it('extracts the validation message from a PPL parse error', () => {
      const msg =
        'alerting_exception: [alerting_exception] Reason: PPL Query validation failed: ' +
        '[INVALID_KEYWORD] is not a valid term at this part of the query: ' +
        "'...e = logs-otel-v1* | INVALID_KEYWORD' <-- HERE. Expecting one of 56 possible tokens.";
      expect(extractPplValidationError(msg)).toBe(
        'PPL Query validation failed: [INVALID_KEYWORD] is not a valid term at this part of the query: ' +
          "'...e = logs-otel-v1* | INVALID_KEYWORD' <-- HERE. Expecting one of 56 possible tokens."
      );
    });

    it('returns null when the message is not a PPL validation error', () => {
      expect(extractPplValidationError('Bad Request')).toBeNull();
      expect(extractPplValidationError('alerting_exception: monitor not found')).toBeNull();
    });

    it('returns null for empty input', () => {
      expect(extractPplValidationError('')).toBeNull();
    });
  });
});
