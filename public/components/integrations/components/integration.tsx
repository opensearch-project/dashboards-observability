/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiGlobalToastList,
  EuiHorizontalRule,
  EuiLink,
  EuiOverlayMask,
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
import { Toast } from '@elastic/eui/src/components/toast/global_toast_list';
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
import { getAddIntegrationModal } from './add_integration_modal';
import { OBSERVABILITY_BASE } from '../../../../common/constants/shared';

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

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalLayout, setModalLayout] = useState(<EuiOverlayMask />);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [data, setData] = useState({ data: {} });

  const getModal = (name: string) => {
    setModalLayout(
      getAddIntegrationModal(
        () => {
          addIntegrationRequest(name);
          setIsModalVisible(false);
        },
        () => {
          setIsModalVisible(false);
        },
        'Name',
        'Namespace',
        'Tags (optional)',
        name,
        'prod',
        'Add Integration Options',
        'Cancel',
        'Add',
        'test'
      )
    );
    setIsModalVisible(true);
  };

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
    handleDataRequest();
  }, [appId]);

  async function handleDataRequest() {
    http.get(`${OBSERVABILITY_BASE}/repository/id`).then((exists) => setData(exists));
  }

  const setToast = (title: string, color = 'success', text?: ReactChild) => {
    if (!text) text = '';
    setToasts([...toasts, { id: new Date().toISOString(), title, text, color } as Toast]);
  };

  async function addIntegrationRequest(name: string) {
    http
      .post(`${OBSERVABILITY_BASE}/store`)
      .then((res) => {
        setToast(
          `${name} integration successfully added!`,
          'success',
          `View the added assets from ${name} in the Added Integrations list`
        );
      })
      .catch((err) =>
        setToast(
          'Failed to load integration. Check Added Integrations table for more details',
          'danger'
        )
      );
  }

  return (
    <EuiPage>
      <EuiGlobalToastList
        toasts={toasts}
        dismissToast={(removedToast) => {
          setToasts(toasts.filter((toast) => toast.id !== removedToast.id));
        }}
        toastLifeTimeMs={6000}
      />
      <EuiPageBody>
        <EuiSpacer size="xl" />
        {IntegrationOverview({ data, getModal })}
        <EuiSpacer />
        {IntegrationDetails({ data })}
        <EuiSpacer />
        {IntegrationAssets({ data })}
        <EuiSpacer />
        {IntegrationFields({ data })}
        <EuiSpacer />
      </EuiPageBody>
      {isModalVisible && modalLayout}
    </EuiPage>
  );
}
