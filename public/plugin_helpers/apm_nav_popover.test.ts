/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { of } from 'rxjs';
import {
  topologyMapNavPopover,
  servicesNavPopover,
  sloNavPopover,
  alertingNavPopover,
} from './apm_nav_popover';
import { httpServiceMock } from '../../../../src/core/public/mocks';
import { NavPopoverServices } from '../../../../src/core/public';
import {
  observabilityApmServicesID,
  observabilityApmApplicationMapID,
  observabilityApmSloID,
} from '../../common/constants/apm';
import { observabilityAlertingID } from '../../common/constants/shared';

const makeServices = (navigateToApp = jest.fn()): NavPopoverServices => ({
  navigateToApp,
  basePath: httpServiceMock.createSetupContract({ basePath: '/test' }).basePath,
  http: httpServiceMock.createStartContract(),
  recentlyAccessed$: of([]),
});

/** Fire the action with the given id and return the navigateToApp mock. */
function clickAction(popover: typeof topologyMapNavPopover, id: string) {
  const navigateToApp = jest.fn();
  const action = (popover.actions ?? []).find((a) => a.id === id);
  if (!action) throw new Error(`No popover action with id "${id}"`);
  action.onClick(makeServices(navigateToApp));
  return navigateToApp;
}

describe('apm nav popovers', () => {
  describe('topologyMapNavPopover', () => {
    it('declares viewTopology + apmSettings', () => {
      expect((topologyMapNavPopover.actions ?? []).map((a) => a.id)).toEqual([
        'viewTopology',
        'apmSettings',
      ]);
    });

    it('navigates to the topology page', () => {
      expect(
        clickAction(topologyMapNavPopover, 'viewTopology')
      ).toHaveBeenCalledWith(observabilityApmApplicationMapID, { path: '#/application-map' });
    });

    it('opens APM settings on the concrete route (survives the redirect)', () => {
      expect(clickAction(topologyMapNavPopover, 'apmSettings')).toHaveBeenCalledWith(
        observabilityApmApplicationMapID,
        {
          path: '#/application-map?_apmSettings=true',
        }
      );
    });
  });

  describe('servicesNavPopover', () => {
    it('declares viewServices + apmSettings', () => {
      expect((servicesNavPopover.actions ?? []).map((a) => a.id)).toEqual([
        'viewServices',
        'apmSettings',
      ]);
    });

    it('navigates to the services page', () => {
      expect(
        clickAction(servicesNavPopover, 'viewServices')
      ).toHaveBeenCalledWith(observabilityApmServicesID, { path: '#/services' });
    });

    it('opens APM settings on /services so the router redirect does not drop the marker', () => {
      expect(
        clickAction(servicesNavPopover, 'apmSettings')
      ).toHaveBeenCalledWith(observabilityApmServicesID, { path: '#/services?_apmSettings=true' });
    });
  });

  describe('sloNavPopover', () => {
    it('declares viewSlos + createSlo', () => {
      expect((sloNavPopover.actions ?? []).map((a) => a.id)).toEqual(['viewSlos', 'createSlo']);
    });

    it('navigates to the SLO list and create routes', () => {
      expect(clickAction(sloNavPopover, 'viewSlos')).toHaveBeenCalledWith(observabilityApmSloID, {
        path: '#/slos',
      });
      expect(clickAction(sloNavPopover, 'createSlo')).toHaveBeenCalledWith(observabilityApmSloID, {
        path: '#/slos/create',
      });
    });
  });

  describe('alertingNavPopover', () => {
    it('declares the three alerting tabs', () => {
      expect((alertingNavPopover.actions ?? []).map((a) => a.id)).toEqual([
        'viewAlerts',
        'viewRules',
        'viewRouting',
      ]);
    });

    it('navigates to each alerting tab route', () => {
      expect(
        clickAction(alertingNavPopover, 'viewAlerts')
      ).toHaveBeenCalledWith(observabilityAlertingID, { path: '#/alerts' });
      expect(
        clickAction(alertingNavPopover, 'viewRules')
      ).toHaveBeenCalledWith(observabilityAlertingID, { path: '#/rules' });
      expect(
        clickAction(alertingNavPopover, 'viewRouting')
      ).toHaveBeenCalledWith(observabilityAlertingID, { path: '#/routing' });
    });
  });
});
