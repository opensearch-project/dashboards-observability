/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContentManagementPluginSetup } from '../../../../src/plugins/content_management/public';

export const HOME_PAGE_ID = 'observabilityOverviewPage';
export enum SECTIONS {
  GET_STARTED = `get_started`,
  DELETE_EXAMPLE = `service_cards`,
  DASHBOARD = `dashboard`,
}

export enum HOME_CONTENT_AREAS {
  GET_STARTED = `${HOME_PAGE_ID}/${SECTIONS.GET_STARTED}`,
  DELETE_EXAMPLE = `${HOME_PAGE_ID}/${SECTIONS.DELETE_EXAMPLE}`,
  DASHBOARD = `${HOME_PAGE_ID}/${SECTIONS.DASHBOARD}`,
}

export const setupOverviewPage = (contentManagement: ContentManagementPluginSetup) => {
  contentManagement.registerPage({
    id: HOME_PAGE_ID,
    title: 'Home',
    sections: [
      {
        id: SECTIONS.DELETE_EXAMPLE,
        order: 3000,
        kind: 'dashboard',
      },
      {
        id: SECTIONS.DASHBOARD,
        order: 2000,
        kind: 'dashboard',
      },
      {
        id: SECTIONS.GET_STARTED,
        order: 1000,
        title: 'Get started',
        kind: 'card',
      },
    ],
  });
};

// export const initHome = (contentManagement: ContentManagementPluginStart) => {
//   //Delete if not needed
//   //If we need something updated on start
// };
