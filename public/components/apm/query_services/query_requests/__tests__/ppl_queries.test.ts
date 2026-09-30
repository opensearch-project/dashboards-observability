/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  buildDependencySpanCondition,
  flattenDependencyAttributes,
  getQueryDependencyAttributes,
  getQueryDependencySpans,
  getQueryGetServiceMap,
  getQueryListServices,
} from '../ppl_queries';

describe('ppl_queries', () => {
  const start = new Date('2026-09-27T20:00:00.000Z');
  const end = new Date('2026-09-27T20:15:00.000Z');

  describe('service map projections', () => {
    it('projects the node type alongside keyAttributes for list and map queries', () => {
      [
        getQueryListServices('svcmap', start, end),
        getQueryGetServiceMap('svcmap', start, end),
      ].forEach((q) => {
        expect(q).toContain('sourceNode.type');
        expect(q).toContain('targetNode.type');
        // dependencyAttributes are fetched on demand, never in the catalog/map query.
        expect(q).not.toContain('dependencyAttributes');
      });
    });
  });

  describe('getQueryDependencyAttributes', () => {
    it('selects the latest node document by name and environment within the range', () => {
      expect(
        getQueryDependencyAttributes('svcmap', 'redis:valkey-cart', 'generic:default', start, end)
      ).toBe(
        "source=svcmap | where timestamp >= '2026-09-27 20:00:00.000' and timestamp <= '2026-09-27 20:15:00.000'" +
          " | where targetNode.keyAttributes.name = 'redis:valkey-cart' and targetNode.keyAttributes.environment = 'generic:default'" +
          ' | sort - timestamp | head 1 | fields targetNode.dependencyAttributes'
      );
    });

    it('escapes quotes and backslashes in the name', () => {
      const q = getQueryDependencyAttributes('svcmap', "a'b\\c", 'env');
      expect(q).toContain("targetNode.keyAttributes.name = 'a\\'b\\\\c'");
    });
  });

  describe('flattenDependencyAttributes', () => {
    it('flattens the nested PPL struct into dotted keys', () => {
      expect(
        flattenDependencyAttributes({
          server: { address: 'valkey-cart', port: '6379' },
          db: { system: { name: 'redis' } },
        })
      ).toEqual({
        'server.address': 'valkey-cart',
        'server.port': '6379',
        'db.system.name': 'redis',
      });
    });

    it('keeps already-dotted keys and stringifies numbers', () => {
      expect(flattenDependencyAttributes({ 'server.port': 5432 })).toEqual({
        'server.port': '5432',
      });
    });

    it('parses a JSON-serialized struct', () => {
      expect(
        flattenDependencyAttributes('{"server":{"address":"valkey-cart"},"db.system.name":"redis"}')
      ).toEqual({ 'server.address': 'valkey-cart', 'db.system.name': 'redis' });
    });

    it('returns an empty map for missing or non-object values (older documents)', () => {
      expect(flattenDependencyAttributes(undefined)).toEqual({});
      expect(flattenDependencyAttributes(null)).toEqual({});
      expect(flattenDependencyAttributes('x')).toEqual({});
      expect(flattenDependencyAttributes('not json')).toEqual({});
      expect(flattenDependencyAttributes([1])).toEqual({});
    });
  });

  describe('buildDependencySpanCondition', () => {
    const SYSTEM = (s: string) =>
      `(attributes.db.system.name = '${s}' or attributes.db_system_name = '${s}' or attributes.db_system = '${s}')`;
    const HOST = (h: string) =>
      `(attributes.server.address = '${h}' or attributes.net.peer.name = '${h}' or attributes.network.peer.address = '${h}')`;
    const NO_HOST =
      'isnull(attributes.server.address) and isnull(attributes.net.peer.name) and isnull(attributes.network.peer.address)';
    const NO_NAMESPACE = 'isnull(attributes.db.namespace) and isnull(attributes.db.name)';

    it('returns null without a name', () => {
      expect(buildDependencySpanCondition('database', '')).toBeNull();
    });

    it('never compares a path that can be an object in the span mapping', () => {
      // PPL fails the whole query on STRUCT = STRING; `db.system` is an object wherever
      // `db.system.name` is mapped, and `messaging.destination` likewise.
      const conditions = [
        buildDependencySpanCondition('database', 'postgresql'),
        buildDependencySpanCondition('database', 'postgresql', { 'db.system.name': 'postgresql' }),
        buildDependencySpanCondition('messaging', 'kafka:orders'),
      ].join(' ');
      expect(conditions).not.toMatch(/attributes\.db\.system =/);
      expect(conditions).not.toMatch(/attributes\.messaging\.destination =/);
    });

    it('adds the legacy keys only when asked (callers try them only if nothing matched)', () => {
      expect(
        buildDependencySpanCondition(
          'database',
          'redis:valkey-cart',
          {},
          { includeLegacyKeys: true }
        )
      ).toContain("attributes.db.system = 'redis'");
      const messaging = buildDependencySpanCondition(
        'messaging',
        'kafka:orders',
        {},
        { includeLegacyKeys: true }
      );
      expect(messaging).toBe(
        "(attributes.messaging.destination.name = 'orders' or attributes.messaging.destination = 'orders') and (attributes.messaging.system = 'kafka')"
      );
      expect(messaging).not.toContain('db.system');
    });

    it('database {system}:{host} matches system and host from dependencyAttributes', () => {
      expect(
        buildDependencySpanCondition('database', 'redis:valkey-cart', {
          'db.system.name': 'redis',
          'server.address': 'valkey-cart',
          'server.port': '6379',
        })
      ).toBe(`${SYSTEM('redis')} and ${HOST('valkey-cart')}`);
    });

    it('database {system}:{namespace} requires no host and the namespace', () => {
      expect(
        buildDependencySpanCondition('database', 'postgresql:otel', {
          'db.system.name': 'postgresql',
          'db.namespace': 'otel',
        })
      ).toBe(
        `${SYSTEM(
          'postgresql'
        )} and ${NO_HOST} and (attributes.db.namespace = 'otel' or attributes.db.name = 'otel')`
      );
    });

    it('database {system} alone excludes spans that carry a host or namespace', () => {
      expect(
        buildDependencySpanCondition('database', 'postgresql', { 'db.system.name': 'postgresql' })
      ).toBe(`${SYSTEM('postgresql')} and ${NO_HOST} and ${NO_NAMESPACE}`);
    });

    it('database without attributes parses {system}:{host|namespace} from the name', () => {
      expect(buildDependencySpanCondition('Database', 'redis:valkey-cart')).toBe(
        `${SYSTEM(
          'redis'
        )} and (attributes.server.address = 'valkey-cart' or attributes.net.peer.name = 'valkey-cart' or attributes.network.peer.address = 'valkey-cart' or attributes.db.namespace = 'valkey-cart' or attributes.db.name = 'valkey-cart')`
      );
      expect(buildDependencySpanCondition('database', 'postgresql')).toBe(
        `${SYSTEM('postgresql')} and ${NO_HOST} and ${NO_NAMESPACE}`
      );
    });

    it('database legacy {host}:{port} name matches the host', () => {
      expect(buildDependencySpanCondition('database', 'valkey-cart:6379')).toBe(
        HOST('valkey-cart')
      );
      expect(
        buildDependencySpanCondition('database', 'valkey-cart:6379', {
          'server.address': 'valkey-cart',
        })
      ).toBe(HOST('valkey-cart'));
    });

    it('messaging matches destination and system (attributes first, then the name)', () => {
      const expected =
        "(attributes.messaging.destination.name = 'orders') and (attributes.messaging.system = 'kafka')";
      expect(
        buildDependencySpanCondition('messaging', 'kafka:orders', {
          'messaging.system': 'kafka',
          'messaging.destination.name': 'orders',
        })
      ).toBe(expected);
      expect(buildDependencySpanCondition('messaging', 'kafka:orders')).toBe(expected);
      expect(buildDependencySpanCondition('messaging', 'orders')).toBe(
        "(attributes.messaging.destination.name = 'orders')"
      );
    });

    it('external matches the host or peer.service', () => {
      expect(
        buildDependencySpanCondition('external', 'api.openai.com', {
          'server.address': 'api.openai.com',
          'server.port': '443',
        })
      ).toBe(`(${HOST('api.openai.com')} or (attributes.peer.service = 'api.openai.com'))`);
      expect(buildDependencySpanCondition('external', 'llm:8000')).toBe(
        `(${HOST('llm')} or (attributes.peer.service = 'llm:8000'))`
      );
      expect(
        buildDependencySpanCondition('external', 'payments', { 'peer.service': 'payments-api' })
      ).toBe(`(${HOST('payments')} or (attributes.peer.service = 'payments-api'))`);
    });

    it('escapes attribute values', () => {
      expect(buildDependencySpanCondition('messaging', "kafka:o'rders")).toBe(
        "(attributes.messaging.destination.name = 'o\\'rders') and (attributes.messaging.system = 'kafka')"
      );
    });
  });

  describe('getQueryDependencySpans', () => {
    const KINDS =
      " | where (kind = 'SPAN_KIND_CLIENT' or kind = 'SPAN_KIND_PRODUCER' or kind = 'SPAN_KIND_CONSUMER')";

    it('bounds the span query by startTime, keeps outbound spans only, and caps rows', () => {
      expect(getQueryDependencySpans('spans', "(attributes.x = 'y')", start, end, 10)).toBe(
        "source=spans | where startTime >= '2026-09-27 20:00:00.000' and startTime <= '2026-09-27 20:15:00.000'" +
          KINDS +
          " | where (attributes.x = 'y') | sort - startTime | head 10"
      );
    });

    it('omits the time filter when no range is given', () => {
      expect(getQueryDependencySpans('spans', "(attributes.x = 'y')")).toBe(
        'source=spans' + KINDS + " | where (attributes.x = 'y') | sort - startTime | head 50"
      );
    });

    it('never matches SERVER spans, whose server.address is their own listener', () => {
      expect(getQueryDependencySpans('spans', "(attributes.x = 'y')")).not.toContain(
        'SPAN_KIND_SERVER'
      );
    });
  });
});
