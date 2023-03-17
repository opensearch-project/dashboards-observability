/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiHorizontalRule,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiPanel,
  EuiSelectOption,
  EuiSpacer,
  EuiTabbedContent,
  EuiTabbedContentTab,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import DSLService from 'public/services/requests/dsl';
import PPLService from 'public/services/requests/ppl';
import SavedObjects from 'public/services/saved_objects/event_analytics/saved_objects';
import TimestampUtils from 'public/services/timestamp/timestamp';
import React, { ReactChild, useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { last } from 'lodash';
import { VisualizationType } from 'common/types/custom_panels';
import { TracesContent } from '../../trace_analytics/components/traces/traces_content';
import { DashboardContent } from '../../trace_analytics/components/dashboard/dashboard_content';
import { ServicesContent } from '../../trace_analytics/components/services/services_content';
import { filtersToDsl, PanelTitle } from '../../trace_analytics/components/common/helper_functions';
import { SpanDetailTable } from '../../trace_analytics/components/traces/span_detail_table';
import { Explorer } from '../../event_analytics/explorer/explorer';
// import { Configuration } from './configuration';
import {
  TAB_CONFIG_ID,
  TAB_CONFIG_TITLE,
  TAB_LOG_ID,
  TAB_LOG_TITLE,
  TAB_OVERVIEW_ID,
  TAB_OVERVIEW_TITLE,
  TAB_PANEL_ID,
  TAB_PANEL_TITLE,
  TAB_SERVICE_ID,
  TAB_SERVICE_TITLE,
  TAB_TRACE_ID,
  TAB_TRACE_TITLE,
} from '../../../../common/constants/application_analytics';
import { TAB_EVENT_ID, TAB_CHART_ID, NEW_TAB } from '../../../../common/constants/explorer';
import { IQueryTab } from '../../../../common/types/explorer';
import { NotificationsStart } from '../../../../../../src/core/public';
import { AppAnalyticsComponentDeps } from '../home';
import {
  ApplicationRequestType,
  ApplicationType,
} from '../../../../common/types/application_analytics';
import { QueryManager } from '../../../../common/query_manager/ppl_query_manager';
import { IntegrationOverview } from './integration_overview_panel';
import { IntegrationDetails } from './integration_details_panel';
import { IntegrationFields } from './integration_fields_panel';
import { IntegrationAssets } from './integration_assets_panel';

const searchBarConfigs = {
  [TAB_EVENT_ID]: {
    showSaveButton: false,
    showSavePanelOptionsList: false,
  },
  [TAB_CHART_ID]: {
    showSaveButton: true,
    showSavePanelOptionsList: false,
  },
};

interface AppDetailProps extends AppAnalyticsComponentDeps {
  disabled?: boolean;
  appId: string;
  pplService: PPLService;
  dslService: DSLService;
  savedObjects: SavedObjects;
  timestampUtils: TimestampUtils;
  notifications: NotificationsStart;
  queryManager: QueryManager;
  updateApp: (appId: string, updateAppData: Partial<ApplicationRequestType>, type: string) => void;
  setToasts: (title: string, color?: string, text?: ReactChild) => void;
  callback: (childfunction: () => void) => void;
}

export function Integration(props: AppDetailProps) {
  const {
    pplService,
    dslService,
    timestampUtils,
    savedObjects,
    http,
    notifications,
    appId,
    chrome,
    parentBreadcrumbs,
    query,
    filters,
    appConfigs,
    updateApp,
    setAppConfigs,
    setToasts,
    setFilters,
    callback,
    queryManager,
    mode,
  } = props;
  const [application, setApplication] = useState<ApplicationType>({
    id: '',
    dateCreated: '',
    dateModified: '',
    name: '',
    description: '',
    baseQuery: '',
    servicesEntities: [],
    traceGroups: [],
    panelId: '',
    availability: { name: '', color: '', availabilityVisId: '' },
  });

  useEffect(() => {
    chrome.setBreadcrumbs([
      ...parentBreadcrumbs,
      {
        text: 'Placeholder',
        href: '#/placeholder',
      },
      {
        text: appId,
        href: `${last(parentBreadcrumbs)!.href}placeholder/${appId}`,
      },
    ]);
  }, [appId]);

  return (
    <EuiPage>
      <EuiPageBody>
        <EuiSpacer size="xl" />
        {IntegrationOverview({
          appId,
          link: 'https://www.nginx.com/',
          license: 'Apache 2.0',
          category: 'web, http',
          version: 2.0,
          contributer: { name: 'Joshua Li', link: 'https://github.com/joshuali925' },
          status: 'available',
        })}
        <EuiSpacer />
        <EuiPageContent>
          {IntegrationDetails({ appId })}
          <EuiSpacer />
          {IntegrationAssets({ appId })}
          <EuiSpacer />
          {IntegrationFields({ appId })}
          <EuiSpacer />
        </EuiPageContent>
      </EuiPageBody>
    </EuiPage>
  );
}
