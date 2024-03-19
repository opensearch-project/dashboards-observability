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
import { i18n } from '@osd/i18n';
import { AccelerationHealth, AccelerationStatus } from '../utils/acceleration_utils';
import { coreRefs } from '../../../../../../framework/core_refs';
import { observabilityDataConnectionsID } from '../../../../../../../common/constants/shared';

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
  dataSourceName: string;
  resetFlyout: () => void;
}

export const AccelerationDetailsTab = ({
  acceleration,
  settings,
  mappings,
  indexInfo,
  dataSourceName,
  resetFlyout,
}: AccelerationDetailsTabProps) => {
  const isSkippingIndex =
    mappings?.data?.[acceleration.flintIndexName]?.mappings?._meta?.kind === 'skipping';
  const refreshIntervalDescription = acceleration.autoRefresh ? 'Auto refresh' : 'Manual';
  const showRefreshTime =
    acceleration.autoRefresh ||
    mappings?.data?.[acceleration.flintIndexName]?.mappings?._meta?.options.incremental_refresh;
  const refreshTime = showRefreshTime
    ? mappings?.data?.[acceleration.flintIndexName]?.mappings?._meta?.options.refresh_interval ??
      '-'
    : '-';
  const creationDate = new Date(
    parseInt(settings?.settings?.index?.creation_date, 10)
  ).toLocaleString();
  const checkpointName =
    mappings?.data?.[acceleration.flintIndexName]?.mappings?._meta?.options?.checkpoint_location;

  const DetailComponent = ({
    title,
    description,
  }: {
    title: string;
    description: React.ReactNode;
  }) => (
    <EuiFlexItem>
      <EuiDescriptionList>
        <EuiDescriptionListTitle>
          {i18n.translate(`accelerationDetailsTab.details.${title}`, {
            defaultMessage: title,
          })}
        </EuiDescriptionListTitle>
        <EuiDescriptionListDescription>{description}</EuiDescriptionListDescription>
      </EuiDescriptionList>
    </EuiFlexItem>
  );

  const TitleComponent = ({ title }: { title: string }) => (
    <>
      <EuiTitle size="s">
        <h4>
          {i18n.translate(`accelerationDetailsTab.titles.${title}`, {
            defaultMessage: title,
          })}
        </h4>
      </EuiTitle>
      <EuiHorizontalRule margin="s" />
    </>
  );

  return (
    <>
      <EuiSpacer />
      <EuiFlexGroup direction="row">
        <DetailComponent
          title={i18n.translate('accelerationDetailsTab.detailComponent.statusTitle', {
            defaultMessage: 'Status',
          })}
          description={<AccelerationStatus status={acceleration.status} />}
        />
        <DetailComponent
          title={i18n.translate('accelerationDetailsTab.detailComponent.accelerationTypeTitle', {
            defaultMessage: 'Acceleration Type',
          })}
          description={mappings?.data?.[acceleration.flintIndexName]?.mappings?._meta?.kind}
        />
        <DetailComponent
          title={i18n.translate('accelerationDetailsTab.detailComponent.creationDateTitle', {
            defaultMessage: 'Creation Date',
          })}
          description={creationDate}
        />
      </EuiFlexGroup>
      <EuiSpacer />
      <TitleComponent
        title={i18n.translate('accelerationDetailsTab.titleComponent.dataSourceDetails', {
          defaultMessage: 'Data source details',
        })}
      />
      <EuiFlexGroup direction="row">
        <DetailComponent
          title={i18n.translate(
            'accelerationDetailsTab.detailComponent.dataSourceConnectionTitle',
            { defaultMessage: 'Data source connection' }
          )}
          description={
            <EuiLink
              onClick={() => {
                coreRefs?.application!.navigateToApp(observabilityDataConnectionsID, {
                  path: `#/manage/${dataSourceName}`,
                  replace: true,
                });
                resetFlyout();
              }}
            >
              {dataSourceName}
            </EuiLink>
          }
        />
        <DetailComponent
          title={i18n.translate('accelerationDetailsTab.detailComponent.databaseTitle', {
            defaultMessage: 'Database',
          })}
          description={acceleration.database}
        />
        <DetailComponent
          title={i18n.translate('accelerationDetailsTab.detailComponent.tableTitle', {
            defaultMessage: 'Table',
          })}
          description={acceleration.table || '-'}
        />
      </EuiFlexGroup>
      {!isSkippingIndex && (
        <>
          <EuiSpacer />
          <TitleComponent
            title={i18n.translate('accelerationDetailsTab.titleComponent.indexDetails', {
              defaultMessage: 'Index details',
            })}
          />
          <EuiFlexGroup>
            <DetailComponent
              title={i18n.translate('accelerationDetailsTab.detailComponent.indexNameTitle', {
                defaultMessage: 'Index name',
              })}
              description={indexInfo?.data[0]?.index}
            />
            <DetailComponent
              title={i18n.translate('accelerationDetailsTab.detailComponent.healthTitle', {
                defaultMessage: 'Health',
              })}
              description={<AccelerationHealth health={indexInfo?.data[0]?.health} />}
            />
          </EuiFlexGroup>
        </>
      )}
      <EuiSpacer />
      <TitleComponent
        title={i18n.translate('accelerationDetailsTab.titleComponent.refreshDetails', {
          defaultMessage: 'Refresh Details',
        })}
      />
      <EuiFlexGroup direction="row">
        <DetailComponent
          title={i18n.translate('accelerationDetailsTab.detailComponent.refreshTypeTitle', {
            defaultMessage: 'Refresh type',
          })}
          description={refreshIntervalDescription}
        />
        <DetailComponent
          title={i18n.translate('accelerationDetailsTab.detailComponent.refreshTimeTitle', {
            defaultMessage: 'Refresh time',
          })}
          description={refreshTime}
        />
        {checkpointName && (
          <DetailComponent
            title={i18n.translate(
              'accelerationDetailsTab.detailComponent.checkpointLocationTitle',
              { defaultMessage: 'Checkpoint location' }
            )}
            description={checkpointName}
          />
        )}
      </EuiFlexGroup>
    </>
  );
};
