/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  observabilityDashboardsKey,
  observabilityShowCardsKey,
} from '../../../../common/constants/overview';
import { uiSettingsService } from '../../../../common/utils';

export const getObservabilityDashboardsId = () => {
  return uiSettingsService.get(observabilityDashboardsKey);
};

export const setObservabilityDashboardsId = (id: string | null) => {
  return uiSettingsService.set(observabilityDashboardsKey, id);
};

export const getObservabilityDashboardsShowCards = () => {
  return uiSettingsService.get(observabilityShowCardsKey);
};

export const setObservabilityDashboardsShowCards = (state: boolean | null) => {
  return uiSettingsService.set(observabilityShowCardsKey, state);
};
