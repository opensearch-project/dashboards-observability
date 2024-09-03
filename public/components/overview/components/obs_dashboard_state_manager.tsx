/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BehaviorSubject } from 'rxjs';
import { DashboardState } from '../../../../common/types/overview';

/**
 * Class to manage the state of the observability dashboard.
 * TODO: Change this to redux or react context provider.
 *       RXJS is a temporary solution here
 */
export class ObsDashboardStateManager {
  static isDashboardSelected$ = new BehaviorSubject<boolean>(false);
  static dashboardState$ = new BehaviorSubject<DashboardState>({
    startDate: '',
    endDate: '',
    dashboardTitle: '',
    dashboardId: '',
  });
  static showFlyout$ = new BehaviorSubject<() => void>(() => {});
}
