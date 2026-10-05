/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  buildDependencySpanCondition,
  flattenDependencyAttributes,
  getQueryDependencyAttributes,
  getQueryDependencySpans,
  getQueryNodeType,
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
    const SYSTEM = (v: string) =>
      `attributes.db.system.name = '${v}' or attributes.db_system_name = '${v}' or attributes.db_system = '${v}'`;
    const HOST_CMP = (h: string) =>
      `attributes.server.address = '${h}' or attributes.net.peer.name = '${h}' or attributes.network.peer.address = '${h}'`;
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
      ]
        .flat()
        .join(' ');
      expect(conditions).not.toMatch(/attributes\.db\.system =/);
      expect(conditions).not.toMatch(/attributes\.messaging\.destination =/);
    });

    it('never wraps a comparison in parentheses, which the OpenSearch 2.x PPL grammar rejects', () => {
      const all = [
        buildDependencySpanCondition('database', 'redis:valkey-cart'),
        buildDependencySpanCondition('database', 'postgresql:otel', { 'db.namespace': 'otel' }),
        buildDependencySpanCondition('database', 'postgresql'),
        buildDependencySpanCondition('messaging', 'kafka:orders'),
        buildDependencySpanCondition('external', 'llm:8000'),
      ].flat();
      // A grouping parenthesis opens a stage or follows a space; function calls (isnull) do not.
      all.forEach((stage) => expect(stage).not.toMatch(/(^|\s)\(/));
      expect(getQueryDependencySpans('spans', ["attributes.x = 'y'"])).not.toMatch(/where \(/);
    });

    describe('with the span index mapping', () => {
      const mapped = (...fields: string[]) => new Set(fields.map((f) => `attributes.${f}`));

      // Older instrumentation: `db.system` / `messaging.destination` are keywords, so their
      // `.name` children cannot exist and referencing them makes PPL reject the query.
      const LEGACY_MAPPING = mapped(
        'db.system',
        'server.address',
        'messaging.destination',
        'messaging.system'
      );

      it('queries the legacy keys, and only them, where they are mapped as keywords', () => {
        expect(
          buildDependencySpanCondition(
            'database',
            'redis:valkey-cart',
            {},
            {
              mappedFields: LEGACY_MAPPING,
            }
          )
        ).toEqual(["attributes.db.system = 'redis'", "attributes.server.address = 'valkey-cart'"]);
        expect(
          buildDependencySpanCondition(
            'messaging',
            'kafka:orders',
            {},
            {
              mappedFields: LEGACY_MAPPING,
            }
          )
        ).toEqual([
          "attributes.messaging.destination = 'orders'",
          "attributes.messaging.system = 'kafka'",
        ]);
      });

      it('never references an unmapped key, which would turn the filter into a script', () => {
        // The OTel demo mapping: flattened db_system_name, no db.system.name or db.namespace.
        const demo = mapped('db_system_name', 'db_system', 'server.address', 'net.peer.name');
        const stages = buildDependencySpanCondition(
          'database',
          'postgresql',
          {},
          {
            mappedFields: demo,
          }
        );
        expect(stages).toEqual([
          "attributes.db_system_name = 'postgresql' or attributes.db_system = 'postgresql'",
          'isnull(attributes.server.address) and isnull(attributes.net.peer.name)',
        ]);
        const joined = (stages || []).join(' ');
        expect(joined).not.toContain('db.system.name');
        expect(joined).not.toContain('network.peer.address');
        expect(joined).not.toContain('db.namespace');
      });

      it('returns null when none of the identifying keys is mapped', () => {
        const hostsOnly = mapped('server.address');
        expect(
          buildDependencySpanCondition('database', 'postgresql', {}, { mappedFields: hostsOnly })
        ).toBeNull();
        expect(
          buildDependencySpanCondition('messaging', 'kafka:orders', {}, { mappedFields: hostsOnly })
        ).toBeNull();
        // External keeps whichever of host / peer.service is mapped.
        expect(
          buildDependencySpanCondition(
            'external',
            'api.openai.com',
            {},
            {
              mappedFields: hostsOnly,
            }
          )
        ).toEqual(["attributes.server.address = 'api.openai.com'"]);
        expect(
          buildDependencySpanCondition(
            'external',
            'api.openai.com',
            {},
            {
              mappedFields: mapped('db.namespace'),
            }
          )
        ).toBeNull();
      });
    });

    it('database {system}:{host} matches system and host from dependencyAttributes', () => {
      expect(
        buildDependencySpanCondition('database', 'redis:valkey-cart', {
          'db.system.name': 'redis',
          'server.address': 'valkey-cart',
          'server.port': '6379',
        })
      ).toEqual([SYSTEM('redis'), HOST_CMP('valkey-cart')]);
    });

    it('database {system}:{namespace} requires no host and the namespace', () => {
      expect(
        buildDependencySpanCondition('database', 'postgresql:otel', {
          'db.system.name': 'postgresql',
          'db.namespace': 'otel',
        })
      ).toEqual([
        SYSTEM('postgresql'),
        NO_HOST,
        "attributes.db.namespace = 'otel' or attributes.db.name = 'otel'",
      ]);
    });

    it('database {system} alone excludes spans that carry a host or namespace', () => {
      expect(
        buildDependencySpanCondition('database', 'postgresql', { 'db.system.name': 'postgresql' })
      ).toEqual([SYSTEM('postgresql'), NO_HOST, NO_NAMESPACE]);
    });

    it('database without attributes parses {system}:{host|namespace} from the name', () => {
      expect(buildDependencySpanCondition('Database', 'redis:valkey-cart')).toEqual([
        SYSTEM('redis'),
        `${HOST_CMP(
          'valkey-cart'
        )} or attributes.db.namespace = 'valkey-cart' or attributes.db.name = 'valkey-cart'`,
      ]);
      expect(buildDependencySpanCondition('database', 'postgresql')).toEqual([
        SYSTEM('postgresql'),
        NO_HOST,
        NO_NAMESPACE,
      ]);
    });

    it('database legacy {host}:{port} name matches the host', () => {
      expect(buildDependencySpanCondition('database', 'valkey-cart:6379')).toEqual([
        HOST_CMP('valkey-cart'),
      ]);
      expect(
        buildDependencySpanCondition('database', 'valkey-cart:6379', {
          'server.address': 'valkey-cart',
        })
      ).toEqual([HOST_CMP('valkey-cart')]);
    });

    it('messaging matches destination and system (attributes first, then the name)', () => {
      const expected = [
        "attributes.messaging.destination.name = 'orders'",
        "attributes.messaging.system = 'kafka'",
      ];
      expect(
        buildDependencySpanCondition('messaging', 'kafka:orders', {
          'messaging.system': 'kafka',
          'messaging.destination.name': 'orders',
        })
      ).toEqual(expected);
      expect(buildDependencySpanCondition('messaging', 'kafka:orders')).toEqual(expected);
      expect(buildDependencySpanCondition('messaging', 'orders')).toEqual([
        "attributes.messaging.destination.name = 'orders'",
      ]);
    });

    it('external matches the host or peer.service', () => {
      expect(
        buildDependencySpanCondition('external', 'api.openai.com', {
          'server.address': 'api.openai.com',
          'server.port': '443',
        })
      ).toEqual([`${HOST_CMP('api.openai.com')} or attributes.peer.service = 'api.openai.com'`]);
      expect(buildDependencySpanCondition('external', 'llm:8000')).toEqual([
        `${HOST_CMP('llm')} or attributes.peer.service = 'llm:8000'`,
      ]);
      expect(
        buildDependencySpanCondition('external', 'payments', { 'peer.service': 'payments-api' })
      ).toEqual([`${HOST_CMP('payments')} or attributes.peer.service = 'payments-api'`]);
    });

    it('escapes attribute values', () => {
      expect(buildDependencySpanCondition('messaging', "kafka:o'rders")).toEqual([
        "attributes.messaging.destination.name = 'o\\'rders'",
        "attributes.messaging.system = 'kafka'",
      ]);
    });
  });

  describe('getQueryDependencySpans', () => {
    const KINDS =
      " | where kind = 'SPAN_KIND_CLIENT' or kind = 'SPAN_KIND_PRODUCER' or kind = 'SPAN_KIND_CONSUMER'";
    const COLUMNS = ' | fields spanId, serviceName, name, durationInNanos, status.code, startTime';

    it('bounds the span query by startTime, keeps outbound spans only, and caps rows', () => {
      expect(
        getQueryDependencySpans(
          'spans',
          ["attributes.x = 'y'", 'isnull(attributes.z)'],
          start,
          end,
          10
        )
      ).toBe(
        "source=spans | where startTime >= '2026-09-27 20:00:00.000' and startTime <= '2026-09-27 20:15:00.000'" +
          KINDS +
          " | where attributes.x = 'y' | where isnull(attributes.z) | sort - startTime | head 10" +
          COLUMNS
      );
    });

    it('omits the time filter when no range is given', () => {
      expect(getQueryDependencySpans('spans', ["attributes.x = 'y'"])).toBe(
        'source=spans' +
          KINDS +
          " | where attributes.x = 'y' | sort - startTime | head 50" +
          COLUMNS
      );
    });

    it('never matches SERVER spans, whose server.address is their own listener', () => {
      expect(getQueryDependencySpans('spans', ["attributes.x = 'y'"])).not.toContain(
        'SPAN_KIND_SERVER'
      );
    });
  });

  describe('getQueryNodeType', () => {
    it('reads the node type from a document where it is the target', () => {
      expect(getQueryNodeType('svcmap', "o'rders", 'generic:default')).toBe(
        "source=svcmap | where targetNode.keyAttributes.name = 'o\\'rders'" +
          " and targetNode.keyAttributes.environment = 'generic:default' | head 1 | fields targetNode.type"
      );
      expect(getQueryNodeType('svcmap', 'checkout')).toBe(
        "source=svcmap | where targetNode.keyAttributes.name = 'checkout' | head 1 | fields targetNode.type"
      );
    });
  });
});
