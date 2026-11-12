/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildScopeFilters, environmentMatcher, MAX_SCOPED_FILTER_CHARS } from '../scope_filters';

const svc = (serviceName: string, environment = 'eks:prod/default') => ({
  serviceName,
  environment,
  type: 'service',
});
const dep = (serviceName: string, environment = 'eks:prod/default') => ({
  serviceName,
  environment,
  type: 'database',
});

describe('environmentMatcher', () => {
  it('matches the exact environment values', () => {
    expect(environmentMatcher('environment', ['dev', 'fvt'])).toBe('environment=~"dev|fvt"');
  });

  it('keeps values sharing a platform prefix distinct', () => {
    expect(environmentMatcher('remoteEnvironment', ['eks:prod/default', 'generic:default'])).toBe(
      'remoteEnvironment=~"eks:prod/default|generic:default"'
    );
  });

  it('escapes regex metacharacters in a value', () => {
    expect(environmentMatcher('environment', ['a.b'])).toBe('environment=~"a\\\\.b"');
  });
});

describe('buildScopeFilters', () => {
  const catalog = [svc('a'), svc('b'), dep('redis')];

  it('is unbounded when nothing is filtered out', () => {
    const f = buildScopeFilters({ catalog, scope: catalog });
    expect(f).toMatchObject({ bounded: false, fellBack: false, serviceFilter: '' });
    expect(f.runDependencies).toBe(true);
  });

  it('bounds a short scope with name lists', () => {
    const f = buildScopeFilters({ catalog, scope: [svc('a'), dep('redis')] });
    expect(f).toMatchObject({
      bounded: true,
      serviceFilter: 'service=~"a"',
      dependencyFilter: 'remoteService=~"redis"',
      runServices: true,
      runDependencies: true,
    });
  });

  it('uses the environment label for an environment-only filter, at any size', () => {
    const many = Array.from({ length: 500 }, (_, i) => svc(`service-${i}`));
    const f = buildScopeFilters({
      catalog: [...many, svc('x', 'ec2:asg')],
      scope: many,
      environments: ['eks:prod/default'],
      needsNameList: false,
    });
    expect(f).toMatchObject({
      bounded: true,
      fellBack: false,
      serviceFilter: 'environment=~"eks:prod/default"',
      runDependencies: false,
    });
  });

  it('skips the dependency queries for a type-only filter without a name list', () => {
    const f = buildScopeFilters({ catalog, scope: [svc('a'), svc('b')], needsNameList: false });
    expect(f).toMatchObject({ bounded: true, serviceFilter: '', runServices: true });
    expect(f.runDependencies).toBe(false);
  });

  it('falls back to the environment label when the name list is too long', () => {
    const many = Array.from({ length: 200 }, (_, i) => svc(`service-with-a-long-name-${i}`));
    const f = buildScopeFilters({
      catalog: [...many, svc('x')],
      scope: many,
      environments: ['eks:prod/default'],
    });
    expect(f).toMatchObject({ bounded: true, fellBack: false });
    expect(f.serviceFilter).toBe('environment=~"eks:prod/default"');
  });

  it('does not use an environment matcher longer than the query budget', () => {
    const envs = Array.from({ length: 200 }, (_, i) => `environment-with-a-long-name-${i}`);
    const many = envs.map((e, i) => svc(`service-with-a-long-name-${i}`, e));
    const f = buildScopeFilters({
      catalog: [...many, svc('x')],
      scope: many,
      environments: envs,
      needsNameList: false,
    });
    expect(f).toMatchObject({ bounded: false, fellBack: true, serviceFilter: '' });
  });

  it('bounds by name list when the environment matcher is too long but the scope is short', () => {
    const envs = Array.from({ length: 200 }, (_, i) => `environment-with-a-long-name-${i}`);
    const f = buildScopeFilters({
      catalog: [svc('a', envs[0]), svc('b', envs[1])],
      scope: [svc('a', envs[0])],
      environments: envs,
      needsNameList: false,
    });
    expect(f).toMatchObject({ bounded: true, fellBack: false, serviceFilter: 'service=~"a"' });
  });

  it('reports a fallback when nothing can narrow a long list', () => {
    const many = Array.from({ length: 200 }, (_, i) => svc(`service-with-a-long-name-${i}`));
    const f = buildScopeFilters({ catalog: [...many, svc('x')], scope: many });
    expect(f.serviceFilter.length).toBeLessThan(MAX_SCOPED_FILTER_CHARS);
    expect(f).toMatchObject({ bounded: false, fellBack: true, serviceFilter: '' });
  });

  it('keeps the kinds of rows in scope in the fallback (a services-only search skips dependencies)', () => {
    const many = Array.from({ length: 200 }, (_, i) => svc(`service-with-a-long-name-${i}`));
    const f = buildScopeFilters({ catalog: [...many, dep('postgres')], scope: many });
    expect(f).toMatchObject({ fellBack: true, runServices: true, runDependencies: false });
    expect(f.dependencyBatches).toEqual([]);
  });

  it('always lists dependency rows as bounded name batches, scoped or not', () => {
    const deps = Array.from({ length: 250 }, (_, i) => dep(`db-${i}`));
    const unscoped = buildScopeFilters({
      catalog: [svc('a'), ...deps],
      scope: [svc('a'), ...deps],
    });
    expect(unscoped.bounded).toBe(false);
    expect(unscoped.dependencyBatches.map((b) => b.names.length)).toEqual([100, 100, 50]);
    expect(unscoped.dependencyBatches[0].filter).toMatch(/^remoteService=~"db-0\|db-1\|/);

    const scoped = buildScopeFilters({ catalog: [svc('a'), ...deps], scope: deps.slice(0, 3) });
    expect(scoped.dependencyBatches).toEqual([
      { names: ['db-0', 'db-1', 'db-2'], filter: 'remoteService=~"db-0|db-1|db-2"' },
    ]);
  });
});
