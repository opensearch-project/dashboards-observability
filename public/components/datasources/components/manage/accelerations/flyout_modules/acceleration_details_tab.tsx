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
import { AccelerationStatus } from '../helpers/utils';

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
}

export const AccelerationDetailsTab = ({
  acceleration,
  settings,
  mappings,
}: AccelerationDetailsTabProps) => {
  const accStatus = acceleration.status;
  console.log('Hereererere is the status: ', accStatus);
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
        <DetailComponent title="Index name" description={acceleration.flintIndexName} />
        <DetailComponent
          title="Health"
          description={<AccelerationStatus status={acceleration.status} />}
        />
        <DetailComponent title="Refresh interval" description="2s" />
      </EuiFlexGroup>
    </>
  );
};
