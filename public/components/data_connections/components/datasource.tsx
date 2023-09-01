/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './accelerate.scss';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiGlobalToastList,
  EuiLoadingSpinner,
  EuiOverlayMask,
  EuiPage,
  EuiPageBody,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiCheckableCard,
  htmlIdGenerator,
  EuiTitle,
  EuiText,
  EuiLink,
  EuiButton,
  EuiInMemoryTable,
  EuiTableFieldDataColumnType,
  EuiPageContent,
  EuiPanel,
  EuiPageContentHeaderSection,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiAccordion,
  EuiIcon,
  EuiCard,
} from '@elastic/eui';
import React, { ReactChild, useEffect, useState } from 'react';
import httpClientMock from 'test/__mocks__/httpClientMock';
import { AccelerateHeader } from './accelerate_header';
import { AccelerateCallout } from './accelerate_callout';
import {
  ASSET_FILTER_OPTIONS,
  OPENSEARCH_DOCUMENTATION_URL,
} from '../../../../common/constants/integrations';
import { AccelerateFlyout } from './accelerate_flyout';
import { TabbedPage } from '../../common/tabbed_page/tabbed_page';

export function DataSource(props: any) {
  // const [isFlyoutVisible, setIsFlyoutVisible] = useState(false);
  const { dataSource, pplService } = props;
  console.log(dataSource);

  const [tables, setTables] = useState([]);

  useEffect(() => {
    pplService
      .fetch({ query: `source = ${dataSource}.sql(\'SHOW TABLES\')`, format: 'jdbc' })
      .then((data) =>
        setTables(
          data.jsonData.map((x: any) => {
            return { label: x.tableName, namespace: x.namespace, isTemporary: x.isTemporary };
          })
        )
      );
  }, []);

  const tableColumns = [
    {
      field: 'name',
      name: 'Table Name',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiLink
          data-test-subj={`${record.label}IntegrationDescription`}
          href={`#/accelerate/${dataSource}/${record.label}`}
        >
          {_.truncate(record.label, { length: 100 })}
        </EuiLink>
      ),
    },
    {
      field: 'namespace',
      name: 'Namespace',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiText data-test-subj={`${record.namespace}Namespace`}>
          {_.truncate(record.namespace, { length: 100 })}
        </EuiText>
      ),
    },
    {
      field: 'isTemporary',
      name: 'Is Temporary',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiText data-test-subj={`${record.isTemporary}temporary`}>
          {_.truncate(record.isTemporary, { length: 100 })}
        </EuiText>
      ),
    },
  ] as Array<EuiTableFieldDataColumnType<any>>;

  const search = {
    box: {
      incremental: true,
    },
    filters: [
      {
        type: 'field_value_selection',
        field: 'assetType',
        name: 'Type',
        multiSelect: false,
        options: ASSET_FILTER_OPTIONS.map((i) => ({
          value: i,
          name: i,
          view: i,
        })),
      },
    ],
  };

  return (
    <EuiPage>
      <EuiPageBody>
        <EuiPageHeader style={{ justifyContent: 'spaceBetween' }}>
          <EuiPageHeaderSection style={{ width: '100%', justifyContent: 'space-between' }}>
            <EuiFlexGroup>
              <EuiFlexItem grow={false}>
                <EuiTitle data-test-subj="eventHomePageTitle" size="l">
                  <h1>{dataSource}</h1>
                </EuiTitle>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPageHeaderSection>
        </EuiPageHeader>

        <EuiPanel>{dataSource}</EuiPanel>
        <EuiSpacer />
        <EuiAccordion
          id="queryOrAccelerateAccordion"
          buttonContent="Ways to use in Dashboards"
          initialIsOpen={true}
        >
          <EuiFlexGroup>
            <EuiFlexItem>
              <EuiCard
                icon={<EuiIcon size="xxl" type="discoverApp" />}
                title={'Query data'}
                description="Query your data in Data Explorer or Observability Logs."
                onClick={() => {}}
              />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiCard
                icon={<EuiIcon size="xxl" type="bolt" />}
                title={'Accelerate performance'}
                description="Accelerate performance through OpenSearch indexing."
                onClick={() => {}}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiAccordion>
        <EuiSpacer />
        {TabbedPage({
          tabNames: [
            ['manage', 'Manage connections'],
            ['new', 'New connection'],
          ],
          header: <></>,
        })}
      </EuiPageBody>
    </EuiPage>
  );
}
