/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BehaviorSubject } from 'rxjs';
import { DashboardState } from '../../../../common/types/overview';

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
