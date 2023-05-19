/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
    EuiButton,
    EuiFlexGroup,
    EuiFlexItem,
    EuiGlobalToastList,
    EuiHorizontalRule,
    EuiIcon,
    EuiInMemoryTable,
    EuiLink,
    EuiOverlayMask,
    EuiPage,
    EuiPageBody,
    EuiPageContent,
    EuiPageContentHeaderSection,
    EuiPageHeader,
    EuiPageHeaderSection,
    EuiPanel,
    EuiSelectOption,
    EuiSpacer,
    EuiTabbedContent,
    EuiTabbedContentTab,
    EuiTableFieldDataColumnType,
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
  import { TAB_EVENT_ID, TAB_CHART_ID, NEW_TAB, FILTER_OPTIONS } from '../../../../common/constants/explorer';
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
import _ from 'lodash';
import { DeleteModal } from '../../common/helpers/delete_modal';
  
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
  
  export function AddedIntegration(props: AppDetailProps) {
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
  
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [data, setData] = useState({ data: {} });
  
    useEffect(() => {
      chrome.setBreadcrumbs([
        ...parentBreadcrumbs,
        {
          text: 'Placeholder',
          href: '#/placeholder',
        },
        {
          text: 'Added Integration',
          href: '#/added'
        },
        {
          text: appId,
          href: `${last(parentBreadcrumbs)!.href}placeholder/added/${appId}`,
        },
      ]);
      handleDataRequest();
    }, [appId]);

    const [isModalVisible, setIsModalVisible] = useState(false);
    const [modalLayout, setModalLayout] = useState(<EuiOverlayMask />);
  
    const getModal = () => {
      setModalLayout(
        <DeleteModal
        onConfirm={() => {setIsModalVisible(false)}}
        onCancel={() => {setIsModalVisible(false)}}
        title={`Delete Assets`}
        message={`Are you sure you want to delete the selected asset(s)?`}
      />
      )
      setIsModalVisible(true);
    };

  
    async function handleDataRequest() {
        http.get(`${OBSERVABILITY_BASE}/store/id`).then((exists) => setData(exists));
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
            'danger',
          )
        );
    }
      
      function AddedOverview(props: any) {
        const {data} = props;
        
        return (
          <EuiPageHeader style={{ justifyContent: 'center'}}>
            <EuiSpacer size='m'/>
            <EuiPageHeaderSection style={{width: '80%'}}>
              <EuiPageContentHeaderSection>
                <EuiFlexGroup gutterSize="xs">
                  <EuiFlexItem>
                    <EuiTitle data-test-subj="eventHomePageTitle" size="l">
                      <EuiText>
                        {data.data.id}
                      </EuiText>
                    </EuiTitle>
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiButton
                      size="s"
                      onClick={() => {
                        getModal();
                      }}
                    >
                      Delete
                    </EuiButton>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiPageContentHeaderSection>
              <EuiSpacer />
              <EuiFlexGroup>
                <EuiFlexItem>
                  <EuiText>
                    <h4>Template</h4>
                  </EuiText>
                  <EuiSpacer size="m" />
                  <EuiLink href={`#/available/${data.data.templateName}`}>
                    {data.data.templateName}
                  </EuiLink>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText>
                    <h4>Date Added</h4>
                  </EuiText>
                  <EuiSpacer size="m" />
                  <EuiText size="m">{data.data.creationDate?.split('T')[0]}</EuiText>
                </EuiFlexItem>
                <EuiFlexItem>
            <EuiText>
              <h4>Status</h4>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiText size="m">{data.data.status}</EuiText>
          </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText>
                    <h4>Added By</h4>
                  </EuiText>
                  <EuiSpacer size="m" />
                  <EuiText>
                    {data.data.author}
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText>
                    <h4>Tags</h4>
                  </EuiText>
                  <EuiSpacer size="m" />
                  <EuiText size="m">{data.data.license}</EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiPageHeaderSection>
          </EuiPageHeader>
        );
      }

      function AddedAssets(props: any) {

        const data = props.data.data.assets || []
      
        const search = {
          box: {
            incremental: true,
          },
          filters: [
            {
              type: 'field_value_selection',
              field: 'type',
              name: 'Type',
              multiSelect: false,
              options: FILTER_OPTIONS.map((i) => ({
                value: i,
                name: i,
                view: i,
              })),
            },
          ],
        };
      
        const tableColumns = [
          {
            field: 'name',
            name: 'Name',
            sortable: true,
            truncateText: true,
            render: (value, record) => (
              <EuiText
                data-test-subj={`${record.name}IntegrationLink`}
              >
                {_.truncate(record.name, { length: 100 })}
              </EuiText>
            ),
          },
          {
            field: 'type',
            name: 'Type',
            sortable: true,
            truncateText: true,
            render: (value, record) => (
              <EuiText data-test-subj={`${record.type}IntegrationDescription`}>
                {_.truncate(record.type, { length: 100 })}
              </EuiText>
            ),
          },
          {
            field: 'actions',
            name: 'Actions',
            sortable: true,
            truncateText: true,
            render: (value, record) => (
              <EuiIcon type={'trash'} onClick={() => {getModal()}}/>
            ),
          },
        ] as Array<EuiTableFieldDataColumnType<any>>;
      
      
      
        return (
          <EuiPanel>
            <PanelTitle title={'Assets List'} />
            <EuiSpacer size='l'/>
            <EuiInMemoryTable
            itemId="id"
            loading={false}
            items={data}
            columns={tableColumns}
            pagination={{
              initialPageSize: 10,
              pageSizeOptions: [5, 10, 15],
            }}
            search={search}
          />
          </EuiPanel>
        );
      }

      function AddedIntegrationFields(props: any) {
        const data = props.data.data.fields || []
      
        const search = {
          box: {
            incremental: true,
          },
          filters: [
            {
              type: 'field_value_selection',
              field: 'type',
              name: 'Type',
              multiSelect: false,
              options: FILTER_OPTIONS.map((i) => ({
                value: i,
                name: i,
                view: i,
              })),
            },
          ],
        };
      
        const tableColumns = [
          {
            field: 'name',
            name: 'Name',
            sortable: true,
            truncateText: true,
            render: (value, record) => (
              <EuiText
                data-test-subj={`${record.name}IntegrationLink`}
              >
                {_.truncate(record.name, { length: 100 })}
              </EuiText>
            ),
          },
          {
            field: 'type',
            name: 'Type',
            sortable: true,
            truncateText: true,
            render: (value, record) => (
              <EuiText data-test-subj={`${record.type}IntegrationDescription`}>
                {_.truncate(record.type, { length: 100 })}
              </EuiText>
            ),
          },
          {
            field: 'category',
            name: 'Category',
            sortable: true,
            truncateText: true,
            render: (value, record) => (
              <EuiText data-test-subj={`${record.type}IntegrationDescription`}>
                {_.truncate(record.category, { length: 100 })}
              </EuiText>
            ),
          },
        ] as Array<EuiTableFieldDataColumnType<any>>;
      
      
      
        return (
          <EuiPanel>
            <PanelTitle title={'Integration Fields'} />
            <EuiSpacer size='l'/>
            <EuiInMemoryTable
            itemId="id"
            loading={false}
            items={data}
            columns={tableColumns}
            pagination={{
              initialPageSize: 10,
              pageSizeOptions: [5, 10, 15],
            }}
            search={search}
          />
          </EuiPanel>
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
          {AddedOverview({data})}
          <EuiSpacer />
            {AddedAssets({ data })}
            <EuiSpacer />
            {AddedIntegrationFields({ data })}
            <EuiSpacer />
        </EuiPageBody>
        {isModalVisible && modalLayout}
      </EuiPage>
    );
  }
  