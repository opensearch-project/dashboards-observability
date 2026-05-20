/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { of } from 'rxjs';
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

describe('#setup — SLO adoption/dedup flag pairing warning (Session B Item 2)', () => {
  // The plugin.setup() call exercises a lot of wiring that coreMock's
  // async primitives don't fully satisfy (workspace, SQL plugin, MDS). We
  // only care about the branch that fires the config-combo warn; assert
  // on `logger.warn` mock calls and swallow the unrelated downstream
  // setup failure so this test stays focused. Each case re-uses the same
  // fresh mocks; the unrelated failure is awaited via .catch so Jest
  // doesn't flag unhandled rejections.

  const buildHarness = (sloConfig: {
    ruleDedup?: { enabled: boolean };
    ruleAdoption?: { enabled: boolean };
  }) => {
    const initializerContext = coreMock.createPluginInitializerContext();
    (initializerContext.config.create as unknown) = () =>
      of({
        alertManager: { enabled: false },
        slo: {
          reconcilerIntervalMs: 300_000,
          ruleDedup: sloConfig.ruleDedup,
          ruleAdoption: sloConfig.ruleAdoption,
          recordingGraceMs: 24 * 60 * 60_000,
        },
      });
    const coreSetup = coreMock.createSetup();
    const plugin = new ObservabilityPlugin(initializerContext);
    const logger = (initializerContext.logger.get() as unknown) as {
      warn: jest.Mock;
    };
    logger.warn.mockClear();
    return { plugin, coreSetup, logger };
  };

  const runSetup = async (
    plugin: ObservabilityPlugin,
    coreSetup: ReturnType<typeof coreMock.createSetup>
  ) => {
    try {
      await plugin.setup(coreSetup, {
        dataSource: ({
          registerCustomApiSchema: jest.fn(),
        } as unknown) as ObservabilityPluginSetupDependencies,
      });
    } catch {
      // Downstream wiring (route registration, SQL plugin) fails under the
      // core mock; the warn branch we care about fires before that point.
    }
  };

  const ruleAdoptionDedupMismatchWarn = (calls: unknown[][]) =>
    calls.some(
      (args) =>
        typeof args[0] === 'string' && args[0].includes('ruleAdoption.enabled=true requires')
    );

  it('warns when ruleAdoption=true and ruleDedup=false', async () => {
    const { plugin, coreSetup, logger } = buildHarness({
      ruleDedup: { enabled: false },
      ruleAdoption: { enabled: true },
    });
    await runSetup(plugin, coreSetup);
    expect(ruleAdoptionDedupMismatchWarn(logger.warn.mock.calls)).toBe(true);
  });

  it('stays silent when ruleAdoption=true and ruleDedup=true', async () => {
    const { plugin, coreSetup, logger } = buildHarness({
      ruleDedup: { enabled: true },
      ruleAdoption: { enabled: true },
    });
    await runSetup(plugin, coreSetup);
    expect(ruleAdoptionDedupMismatchWarn(logger.warn.mock.calls)).toBe(false);
  });

  it('stays silent when ruleAdoption=false and ruleDedup=true', async () => {
    const { plugin, coreSetup, logger } = buildHarness({
      ruleDedup: { enabled: true },
      ruleAdoption: { enabled: false },
    });
    await runSetup(plugin, coreSetup);
    expect(ruleAdoptionDedupMismatchWarn(logger.warn.mock.calls)).toBe(false);
  });

  it('stays silent when both flags are false', async () => {
    const { plugin, coreSetup, logger } = buildHarness({
      ruleDedup: { enabled: false },
      ruleAdoption: { enabled: false },
    });
    await runSetup(plugin, coreSetup);
    expect(ruleAdoptionDedupMismatchWarn(logger.warn.mock.calls)).toBe(false);
  });
});
