/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { NOTEBOOK_SAVED_OBJECT } from '../common/types/observability_saved_object_attributes';
import { coreMock } from '../../../src/core/server/mocks';
import { ObservabilityPlugin, ObservabilityPluginSetupDependencies } from './plugin';

describe('#setup', () => {
  it('should not register notebook saved object when investigation plugin present', () => {
    const intializerContextMock = coreMock.createPluginInitializerContext();
    const coreSetup = coreMock.createSetup();
    const observabilityPlugin = new ObservabilityPlugin(intializerContextMock);
    observabilityPlugin.setup(coreSetup, {
      investigationDashboards: {},
      dataSource: ({
        registerCustomApiSchema: jest.fn(),
      } as unknown) as ObservabilityPluginSetupDependencies,
    });
    expect(coreSetup.savedObjects.registerType).not.toBeCalledWith(
      expect.objectContaining({
        type: NOTEBOOK_SAVED_OBJECT,
      })
    );
  });
});

describe('#setup capability switcher (dynamic feature flags)', () => {
  // Helper: drive the dynamic-config-service mock so the switcher resolves
  // a particular `getConfig` outcome. Returns the captured switcher fn so
  // tests can invoke it directly. `yml` seeds the yml-derived defaults
  // the switcher uses as its fallback chain.
  async function captureSwitcher(opts: {
    yml?: { alertManager?: { enabled: boolean }; slo?: { enabled: boolean } };
    getConfigBehavior:
      | { ok: { alertManager?: { enabled: boolean }; slo?: { enabled: boolean } } }
      | { reject: Error };
  }) {
    const initializerContext = coreMock.createPluginInitializerContext(opts.yml ?? {});
    const coreSetup = coreMock.createSetup();
    const getConfigMock = jest.fn();
    if ('ok' in opts.getConfigBehavior) {
      getConfigMock.mockResolvedValue(opts.getConfigBehavior.ok);
    } else {
      getConfigMock.mockRejectedValue(opts.getConfigBehavior.reject);
    }
    (coreSetup.dynamicConfigService.getStartService as jest.Mock).mockResolvedValue({
      getClient: () => ({ getConfig: getConfigMock }),
      getAsyncLocalStore: () => ({}),
    });

    const plugin = new ObservabilityPlugin(initializerContext);
    await plugin.setup(coreSetup, {
      dataSource: ({
        registerCustomApiSchema: jest.fn(),
      } as unknown) as ObservabilityPluginSetupDependencies,
    });

    // The plugin calls `registerSwitcher` once for the dynamic flag path.
    // The pre-existing readonly-security switcher is registered after
    // ours, so the first call is the one we want.
    const switcherCalls = (coreSetup.capabilities.registerSwitcher as jest.Mock).mock.calls;
    const switcher = switcherCalls[0]?.[0] as (
      request: unknown,
      capabilities: Record<string, unknown>
    ) => Promise<Record<string, unknown>>;

    return { switcher, plugin, initializerContext, getConfigMock };
  }

  it('dynamic value overrides yml when both are set', async () => {
    // yml says off, dynamic says on → dynamic wins.
    const { switcher } = await captureSwitcher({
      yml: { alertManager: { enabled: false }, slo: { enabled: false } },
      getConfigBehavior: { ok: { alertManager: { enabled: true }, slo: { enabled: true } } },
    });
    const result = (await switcher({}, { observability: {} })) as {
      observability: { alertManagerEnabled: boolean; sloEnabled: boolean };
    };
    expect(result.observability.alertManagerEnabled).toBe(true);
    expect(result.observability.sloEnabled).toBe(true);
  });

  it('falls back to yml value when dynamic config omits a flag', async () => {
    // yml has alertManager on, slo off. Dynamic config only specifies slo
    // → alertManager falls through to its yml value.
    const { switcher } = await captureSwitcher({
      yml: { alertManager: { enabled: true }, slo: { enabled: false } },
      getConfigBehavior: { ok: { slo: { enabled: true } } },
    });
    const result = (await switcher({}, { observability: {} })) as {
      observability: { alertManagerEnabled: boolean; sloEnabled: boolean };
    };
    expect(result.observability.alertManagerEnabled).toBe(true);
    expect(result.observability.sloEnabled).toBe(true);
  });

  it('falls back to yml value when dynamic config layer rejects', async () => {
    // No DynamicConfigService present (open-source / GitHub OSD case
    // simulated by a getConfig rejection). yml is the source of truth.
    // The catch path returns capabilities unchanged so the yml-seeded
    // provider defaults remain in effect.
    const { switcher } = await captureSwitcher({
      yml: { alertManager: { enabled: true }, slo: { enabled: false } },
      getConfigBehavior: { reject: new Error('no dynamic config available') },
    });
    const seededCapabilities = {
      observability: { alertManagerEnabled: true, sloEnabled: false },
    };
    const result = (await switcher({}, seededCapabilities)) as {
      observability: { alertManagerEnabled: boolean; sloEnabled: boolean };
    };
    expect(result.observability.alertManagerEnabled).toBe(true);
    expect(result.observability.sloEnabled).toBe(false);
  });
});
