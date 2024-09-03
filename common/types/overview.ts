/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface DashboardState {
  startDate: string;
  endDate: string;
  dashboardTitle: string;
  dashboardId: string;
}

export interface DashboardSavedObjectsType {
  [key: string]: {
    value: string;
    label: string;
    startDate: string;
    endDate: string;
  };
}
