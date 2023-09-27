/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPage,
  EuiPageBody,
  EuiSpacer,
  EuiText,
  EuiButton,
  EuiSteps,
  EuiPageSideBar,
  EuiBottomBar,
  EuiButtonEmpty,
} from '@elastic/eui';
import React, { useCallback, useEffect, useState } from 'react';
import { ConfigureS3Datasource } from './configure_s3_datasource';
import { coreRefs } from '../../../../../public/framework/core_refs';
import { DATACONNECTIONS_BASE } from '../../../../../common/constants/shared';
import { ReviewS3Datasource } from './review_s3_datasource_configuration';
import { useToast } from '../../../../../public/components/common/toast';
import { DatasourceType, Role } from '../../../../../common/types/data_connections';

interface ConfigureDatasourceProps {
  type: string;
}

export function Configure(props: ConfigureDatasourceProps) {
  const { type } = props;
  const { http } = coreRefs;
  const { setToast } = useToast();

  const [name, setName] = useState('');
  const [details, setDetails] = useState('');
  const [arn, setArn] = useState('');
  const [store, setStore] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedQueryPermissionRoles, setSelectedQueryPermissionRoles] = useState<Role[]>([]);
  const [page, setPage] = useState<'configure' | 'review'>('configure');
  const ConfigureDatasourceSteps = [
    {
      title: 'Configure Data Source',
      children: null,
    },
    {
      title: 'Review Configuration',
      children: null,
    },
  ];

  useEffect(() => {
    http!.get('/api/v1/configuration/roles').then((data) =>
      setRoles(
        Object.keys(data.data).map((key) => {
          return { label: key };
        })
      )
    );
  }, []);

  const ConfigureDatasource = (configurationProps: { datasourceType: DatasourceType }) => {
    const { datasourceType } = configurationProps;
    switch (datasourceType) {
      case 'S3GLUE':
        return (
          <ConfigureS3Datasource
            currentName={name}
            currentDetails={details}
            setNameForRequest={setName}
            setDetailsForRequest={setDetails}
            currentArn={arn}
            setArnForRequest={setArn}
            currentStore={store}
            setStoreForRequest={setStore}
            roles={roles}
            selectedQueryPermissionRoles={selectedQueryPermissionRoles}
            setSelectedQueryPermissionRoles={setSelectedQueryPermissionRoles}
          />
        );
      default:
        return <></>;
    }
  };

  const ReviewDatasourceConfiguration = (configurationProps: { datasourceType: string }) => {
    const { datasourceType } = configurationProps;
    switch (datasourceType) {
      case 'S3':
        return (
          <ReviewS3Datasource
            currentName={name}
            currentDetails={details}
            currentArn={arn}
            currentStore={store}
            selectedQueryPermissionRoles={selectedQueryPermissionRoles}
            goBack={() => setPage('configure')}
          />
        );
      default:
        return <></>;
    }
  };

  const ReviewSaveOrCancel = useCallback(() => {
    return (
      <EuiBottomBar>
        <EuiFlexGroup justifyContent="flexEnd">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              onClick={() => {
                window.location.hash = '#/new';
              }}
              color="ghost"
              size="s"
              iconType="cross"
            >
              Cancel
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              onClick={() => (page === 'review' ? setPage('configure') : {})}
              color="ghost"
              size="s"
              iconType="arrowLeft"
            >
              Previous
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              onClick={() => (page === 'review' ? createDatasource() : setPage('review'))}
              size="s"
              iconType="arrowRight"
              fill
            >
              {page === 'configure' ? `Review Configuration` : `Connect to ${type}`}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiBottomBar>
    );
  }, [page]);

  const createDatasource = () => {
    http!
      .post(`${DATACONNECTIONS_BASE}`, {
        body: JSON.stringify({
          name,
          allowedRoles: selectedQueryPermissionRoles.map((role) => role.label),
          connector: 's3glue',
          properties: {
            'glue.auth.type': 'iam_role',
            'glue.auth.role_arn': arn,
            'glue.indexstore.opensearch.uri': store,
            'glue.indexstore.opensearch.auth': false,
            'glue.indexstore.opensearch.region': 'us-west-2',
          },
        }),
      })
      .then(() => {
        setToast(`Data source ${name} created`, 'success');
        window.location.hash = '#/manage';
      })
      .catch((err) => {
        setToast(`Data source ${name} created`, 'success');
        window.location.hash = '#/manage';
      });
  };

  return (
    <EuiPage>
      <EuiPageSideBar>
        <EuiSteps steps={ConfigureDatasourceSteps} />
      </EuiPageSideBar>
      <EuiPageBody>
        {page === 'configure' ? (
          <ConfigureDatasource datasourceType={type} />
        ) : (
          <ReviewDatasourceConfiguration datasourceType={type} />
        )}
        <EuiSpacer size="xl" />
        <EuiSpacer size="xl" />
        <ReviewSaveOrCancel />
      </EuiPageBody>
    </EuiPage>
  );
}
