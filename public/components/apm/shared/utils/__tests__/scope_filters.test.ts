/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  buildScopeFilters,
  environmentPlatformMatcher,
  MAX_SCOPED_FILTER_CHARS,
} from '../scope_filters';

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

describe('environmentPlatformMatcher', () => {
  it('matches the platform prefix case-insensitively', () => {
    expect(environmentPlatformMatcher('environment', ['eks'])).toBe('environment=~"(?i:eks):.*"');
  });

  it('also matches values without a platform prefix for generic', () => {
    expect(environmentPlatformMatcher('remoteEnvironment', ['generic', 'ec2'])).toBe(
      'remoteEnvironment=~"(?i:generic):.*|(?i:ec2):.*|[^:]*"'
    );
  });

  it('escapes regex metacharacters in a platform', () => {
    expect(environmentPlatformMatcher('environment', ['a.b'])).toBe(
      'environment=~"(?i:a\\\\.b):.*"'
    );
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
      environmentPlatforms: ['eks'],
      needsNameList: false,
    });
    expect(f).toMatchObject({
      bounded: true,
      fellBack: false,
      serviceFilter: 'environment=~"(?i:eks):.*"',
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
      environmentPlatforms: ['eks'],
    });
    expect(f).toMatchObject({ bounded: true, fellBack: false });
    expect(f.serviceFilter).toBe('environment=~"(?i:eks):.*"');
  });

  it('reports a fallback when nothing can narrow a long list', () => {
    const many = Array.from({ length: 200 }, (_, i) => svc(`service-with-a-long-name-${i}`));
    const f = buildScopeFilters({ catalog: [...many, svc('x')], scope: many });
    expect(f.serviceFilter.length).toBeLessThan(MAX_SCOPED_FILTER_CHARS);
    expect(f).toMatchObject({ bounded: false, fellBack: true, serviceFilter: '' });
  });
});
