/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import {
  EuiDescriptionList,
  EuiDescriptionListDescription,
  EuiDescriptionListTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiLink,
  EuiSpacer,
  EuiTitle,
} from '@elastic/eui';
import { AccelerationHealth, AccelerationStatus } from '../helpers/utils';

interface AccelerationDetailsTabProps {
  acceleration: {
    flintIndexName: string;
    kind: string;
    database: string;
    table: string;
    indexName: string;
    autoRefresh: boolean;
    status: string;
  };
  settings: object;
  mappings: object;
  indexInfo: any;
}

export const AccelerationDetailsTab = ({
  acceleration,
  settings,
  mappings,
  indexInfo,
}: AccelerationDetailsTabProps) => {

  console.log('mappings:', mappings);
  console.log('indexInfo:', indexInfo);
  console.log('indexInfo data:', indexInfo?.data);
  console.log('First item in indexInfo data:', indexInfo?.data[0]);
  console.log('Health of the first item:', indexInfo?.data[0]?.health);

  const DetailComponent = ({
    title,
    description,
  }: {
    title: string;
    description: React.ReactNode;
  }) => (
    <EuiFlexItem>
      <EuiDescriptionList>
        <EuiDescriptionListTitle>{title}</EuiDescriptionListTitle>
        <EuiDescriptionListDescription>{description}</EuiDescriptionListDescription>
      </EuiDescriptionList>
    </EuiFlexItem>
  );

  const TitleComponent = ({ title }: { title: string }) => (
    <>
      <EuiTitle size="s">
        <h4>{title}</h4>
      </EuiTitle>
      <EuiHorizontalRule margin="s" />
    </>
  );

  return (
    <>
      <EuiSpacer />
      <EuiFlexGroup direction="row">
        <DetailComponent
          title="Status"
          description={<AccelerationStatus status={acceleration.status} />}
        />
        <DetailComponent
          title="Acceleration Type"
          description={mappings?.data?.[acceleration.flintIndexName]?.mappings?._meta?.kind}
        />
        <DetailComponent
          title="Creation Date"
          description={settings?.settings?.index?.creation_date}
        />
      </EuiFlexGroup>
      <EuiFlexGroup>
        <DetailComponent
          title="Last Updated"
          description={settings?.settings?.index?.creation_date}
        />
      </EuiFlexGroup>
      <EuiSpacer />
      <TitleComponent title="Data source details" />
      <EuiFlexGroup direction="row">
        <DetailComponent
          title="Data source connection"
          description={
            <EuiLink onClick={() => console.log()}>{acceleration.flintIndexName}</EuiLink>
          }
        />
        <DetailComponent title="Database" description={acceleration.database} />
        <DetailComponent title="Table" description={acceleration.table} />
      </EuiFlexGroup>
      <EuiSpacer />
      <TitleComponent title="Index details" />
      <EuiFlexGroup>
        <DetailComponent title="Index name" description={indexInfo?.data[0]?.index} />
        <DetailComponent
          title="Health"
          description={<AccelerationHealth health={indexInfo?.data[0]?.health} />}
        />
        <DetailComponent title="Refresh interval" description="2s" />
      </EuiFlexGroup>
    </>
  );
};
