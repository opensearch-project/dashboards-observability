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
} from '@elastic/eui';
import { AssociatedObject } from 'common/types/data_connections';
import {
  onAccelerateButtonClick,
  onDeleteButtonClick,
  onDiscoverButtonClick,
} from './utils/associated_objects_tab_utils';

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
      </EuiFlyoutBody>
    </>
  );
};
