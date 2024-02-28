/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

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
import React from 'react';
import { AccelerationStatus } from '../helpers/utils';

interface AccelerationDetailsTabProps {
  acceleration: any;
}

export const AccelerationDetailsTab = (props: AccelerationDetailsTabProps) => {
  const { acceleration } = props;

  const DetailComponent = (detailProps: { title: string; description: any }) => {
    const { title, description } = detailProps;
    return (
      <EuiFlexItem>
        <EuiDescriptionList>
          <EuiDescriptionListTitle>{title}</EuiDescriptionListTitle>
          <EuiDescriptionListDescription>{description}</EuiDescriptionListDescription>
        </EuiDescriptionList>
      </EuiFlexItem>
    );
  };

  const TitleComponent = (titleProps: { title: string }) => {
    const { title } = titleProps;
    return (
      <>
        <EuiTitle size="s">
          <h4>{title}</h4>
        </EuiTitle>
        <EuiHorizontalRule margin="s" />
      </>
    );
  };

  return (
    <>
      <EuiSpacer />
      <EuiFlexGroup direction="row">
        <DetailComponent
          title="Status"
          description={<AccelerationStatus status={acceleration.status} />}
        />
        <DetailComponent title="Acceleration Type" description={acceleration.type} />
        <DetailComponent
          title="Creation Date"
          description={new Date(acceleration.dateCreated).toUTCString()}
        />
      </EuiFlexGroup>
      <EuiFlexGroup>
        <DetailComponent
          title="Last Updated"
          description={new Date(acceleration.dateUpdated).toUTCString()}
        />
      </EuiFlexGroup>
      <EuiSpacer />
      <TitleComponent title="Data source details" />
      <EuiFlexGroup direction="row">
        <DetailComponent
          title="Data source connection"
          description={<EuiLink onClick={() => console.log()}>{acceleration.index}</EuiLink>}
        />
        <DetailComponent title="Database" description={acceleration.database} />
        <DetailComponent title="Table" description={acceleration.table} />
      </EuiFlexGroup>
      <EuiSpacer />
      <TitleComponent title="Index details" />
      <EuiFlexGroup>
        <DetailComponent title="Index name" description={acceleration.index} />
        <DetailComponent
          title="Health"
          description={<AccelerationStatus status={acceleration.status} />}
        />
        <DetailComponent title="Refresh interval" description="2s" />
      </EuiFlexGroup>
    </>
  );
};
