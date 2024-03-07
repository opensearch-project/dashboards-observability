/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiSpacer,
  EuiText,
  EuiIcon,
  EuiButtonEmpty,
  EuiFlexItem,
  EuiFlexGroup,
  EuiDescriptionList,
  EuiDescriptionListTitle,
  EuiDescriptionListDescription,
  EuiHorizontalRule,
  EuiTitle,
  EuiTableFieldDataColumnType,
  EuiInMemoryTable,
  EuiLink,
} from '@elastic/eui';
import { AssociatedObject } from 'common/types/data_connections';
import {
  onAccelerateButtonClick,
  onDeleteButtonClick,
  onDiscoverButtonClick,
} from './utils/associated_objects_tab_utils';
import { getRenderAccelerationDetailsFlyout } from '../../../../../plugin';
import { AccelerationStatus } from '../accelerations/helpers/utils';

export interface AssociatedObjectsFlyoutProps {
  tableDetail: AssociatedObject;
}

export const AssociatedObjectsDetailsFlyout = ({ tableDetail }: AssociatedObjectsFlyoutProps) => {
  const DiscoverButton = () => {
    // TODO: display button if can be sent to discover
    return (
      <EuiButtonEmpty onClick={onDiscoverButtonClick}>
        <EuiIcon type={'discoverApp'} size="m" />
      </EuiButtonEmpty>
    );
  };

  const AccelerateButton = () => {
    return (
      <EuiButtonEmpty onClick={onAccelerateButtonClick}>
        <EuiIcon type={'bolt'} size="m" />
      </EuiButtonEmpty>
    );
  };

  const DeleteButton = () => {
    return (
      <EuiButtonEmpty onClick={onDeleteButtonClick}>
        <EuiIcon type="trash" size="m" />
      </EuiButtonEmpty>
    );
  };

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

  const ConnectionComponent = () => {
    return (
      <EuiFlexGroup direction="row">
        <DetailComponent title="Datasource connection" description={tableDetail.datasource} />
        <DetailComponent title="Database" description={tableDetail.database} />
        <DetailComponent title="Table" description={tableDetail.name} />
      </EuiFlexGroup>
    );
  };

  const TableTitleComponent = (titleProps: { title: string }) => {
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

  const accelerationData = tableDetail.accelerations.map((acc, index) => ({
    ...acc,
    id: index,
  }));

  const columns = [
    {
      field: 'name',
      name: 'Name',
      'data-test-subj': 'accelerationName',
      render: (name: string, item: AssociatedObject) => (
        <EuiLink onClick={() => renderAccelerationDetailsFlyout(item)}>{name}</EuiLink>
      ),
    },
    {
      field: 'status',
      name: 'Status',
      render: (status) => <AccelerationStatus status={status} />,
    },
    {
      field: 'type',
      name: 'Type',
    },
  ] as Array<EuiTableFieldDataColumnType<any>>;

  const renderAccelerationDetailsFlyout = getRenderAccelerationDetailsFlyout();

  return (
    <>
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup direction="row" alignItems="center" gutterSize="m">
          <EuiFlexItem>
            <EuiText size="m">
              <h2 className="accsDetailFlyoutTitle">{tableDetail.name}</h2>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <DiscoverButton />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <AccelerateButton />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <DeleteButton />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <ConnectionComponent />
        <EuiSpacer />
        <TableTitleComponent title="Accelerations" />
        <TableTitleComponent title="Schema" />
        <EuiInMemoryTable
          items={accelerationData}
          columns={columns}
          pagination={true}
          sorting={true}
        />
      </EuiFlyoutBody>
    </>
  );
};
