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
  EuiButton,
  EuiSteps,
  EuiPageSideBar,
  EuiBottomBar,
  EuiButtonEmpty,
} from '@elastic/eui';
import React, { useCallback, useEffect, useState } from 'react';
import { ConfigureS3Datasource } from './configure_s3_datasource';
import { coreRefs } from '../../../../../public/framework/core_refs';
import { DATACONNECTIONS_BASE, SECURITY_ROLES } from '../../../../../common/constants/shared';
import { ReviewS3Datasource } from './review_s3_datasource_configuration';
import { useToast } from '../../../../../public/components/common/toast';
import { DatasourceType, Role } from '../../../../../common/types/data_connections';
import { ConfigurePrometheusDatasource } from './configure_prometheus_datasource';
import { ReviewPrometheusDatasource } from './review_prometheus_datasource_configuration';
import {
  AuthMethod,
  DatasourceTypeToDisplayName,
  UrlToDatasourceType,
} from '../../../../../common/constants/data_connections';
import { formatError } from '../../../../../public/components/event_analytics/utils';
import { NotificationsStart } from '../../../../../../../src/core/public';

interface ConfigureDatasourceProps {
  urlType: string;
  notifications: NotificationsStart;
}

export function Configure(props: ConfigureDatasourceProps) {
  const { urlType, notifications } = props;
  const { http, chrome } = coreRefs;
  const { setToast } = useToast();
  const [error, setError] = useState<string>('');
  const [authMethod, setAuthMethod] = useState<AuthMethod>('basicauth');
  const [name, setName] = useState('');
  const [details, setDetails] = useState('');
  const [arn, setArn] = useState('');
  const [storeURI, setStoreURI] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [region, setRegion] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [hasSecurityAccess, setHasSecurityAccess] = useState(true);
  const [selectedQueryPermissionRoles, setSelectedQueryPermissionRoles] = useState<Role[]>([]);
  const [page, setPage] = useState<'configure' | 'review'>('configure');
  const type = UrlToDatasourceType[urlType];
  const ConfigureDatasourceSteps = [
    {
      title: 'Configure data source',
      status: page === 'review' ? 'complete' : undefined,
    },
    {
      title: 'Review configuration',
    },
  ];

  useEffect(() => {
    http!
      .get(SECURITY_ROLES)
      .then((data) =>
        setRoles(
          Object.keys(data.data).map((key) => {
            return { label: key };
          })
        )
      )
      .catch((err) => setHasSecurityAccess(false));
    chrome!.setBreadcrumbs([
      {
        text: 'Data sources',
        href: '#/',
      },
      {
        text: 'New',
        href: '#/new',
      },
      {
        text: `${DatasourceTypeToDisplayName[type]}`,
        href: `#/configure/${type}`,
      },
    ]);
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
            currentStore={storeURI}
            setStoreForRequest={setStoreURI}
            roles={roles}
            selectedQueryPermissionRoles={selectedQueryPermissionRoles}
            setSelectedQueryPermissionRoles={setSelectedQueryPermissionRoles}
            currentUsername={username}
            setUsernameForRequest={setUsername}
            currentPassword={password}
            setPasswordForRequest={setPassword}
            currentAuthMethod={authMethod}
            setAuthMethodForRequest={setAuthMethod}
            hasSecurityAccess={hasSecurityAccess}
            error={error}
            setError={setError}
          />
        );
      case 'PROMETHEUS':
        return (
          <ConfigurePrometheusDatasource
            currentName={name}
            currentDetails={details}
            setNameForRequest={setName}
            setDetailsForRequest={setDetails}
            currentStore={storeURI}
            setStoreForRequest={setStoreURI}
            roles={roles}
            currentUsername={username}
            setUsernameForRequest={setUsername}
            currentPassword={password}
            setPasswordForRequest={setPassword}
            selectedQueryPermissionRoles={selectedQueryPermissionRoles}
            setSelectedQueryPermissionRoles={setSelectedQueryPermissionRoles}
            currentAccessKey={accessKey}
            currentSecretKey={secretKey}
            setAccessKeyForRequest={setAccessKey}
            setSecretKeyForRequest={setSecretKey}
            currentRegion={region}
            setRegionForRequest={setRegion}
            currentAuthMethod={authMethod}
            setAuthMethodForRequest={setAuthMethod}
            hasSecurityAccess={hasSecurityAccess}
            error={error}
            setError={setError}
          />
        );
      default:
        return <></>;
    }
  };

  const ReviewDatasourceConfiguration = (configurationProps: { datasourceType: string }) => {
    const { datasourceType } = configurationProps;
    switch (datasourceType) {
      case 'S3GLUE':
        return (
          <ReviewS3Datasource
            currentName={name}
            currentDetails={details}
            currentArn={arn}
            currentStore={storeURI}
            selectedQueryPermissionRoles={selectedQueryPermissionRoles}
            currentAuthMethod={authMethod}
            goBack={() => setPage('configure')}
          />
        );
      case 'PROMETHEUS':
        return (
          <ReviewPrometheusDatasource
            currentName={name}
            currentDetails={details}
            currentArn={arn}
            currentStore={storeURI}
            currentUsername={username}
            selectedQueryPermissionRoles={selectedQueryPermissionRoles}
            currentAuthMethod={authMethod}
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
              {page === 'configure'
                ? `Review Configuration`
                : `Connect to ${DatasourceTypeToDisplayName[type]}`}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiBottomBar>
    );
  }, [page]);

  const createDatasource = () => {
    let response;
    switch (type) {
      case 'S3GLUE':
        const s3properties =
          authMethod === 'basicauth'
            ? {
                'glue.auth.type': 'iam_role',
                'glue.auth.role_arn': arn,
                'glue.indexstore.opensearch.uri': storeURI,
                'glue.indexstore.opensearch.auth': authMethod,
                'glue.indexstore.opensearch.auth.username': username,
                'glue.indexstore.opensearch.auth.password': password,
              }
            : {
                'glue.auth.type': 'iam_role',
                'glue.auth.role_arn': arn,
                'glue.indexstore.opensearch.uri': storeURI,
                'glue.indexstore.opensearch.auth': authMethod,
              };
        response = http!.post(`${DATACONNECTIONS_BASE}`, {
          body: JSON.stringify({
            name,
            allowedRoles: selectedQueryPermissionRoles.map((role) => role.label),
            connector: 's3glue',
            properties: s3properties,
          }),
        });
        break;
      case 'PROMETHEUS':
        const prometheusProperties =
          authMethod === 'basicauth'
            ? {
                'prometheus.uri': storeURI,
                'prometheus.auth.type': authMethod,
                'prometheus.auth.username': username,
                'prometheus.auth.password': password,
              }
            : {
                'prometheus.uri': storeURI,
                'prometheus.auth.type': authMethod,
                'prometheus.auth.region': region,
                'prometheus.auth.access_key': accessKey,
                'prometheus.auth.secret_key': secretKey,
              };
        response = http!.post(`${DATACONNECTIONS_BASE}`, {
          body: JSON.stringify({
            name,
            allowedRoles: selectedQueryPermissionRoles.map((role) => role.label),
            connector: 'prometheus',
            properties: prometheusProperties,
          }),
        });
        break;
      default:
        response = Promise.reject('Invalid data source type');
    }
    response
      .then(() => {
        setToast(`Data source ${name} created`, 'success');
        window.location.hash = '#/manage';
      })
      .catch((err) => {
        const formattedError = formatError(err.name, err.message, err.body.message);
        notifications.toasts.addError(formattedError, {
          title: 'Could not create data source',
        });
        setPage('configure');
      });
  };

  return (
    <EuiPage>
      <EuiPageSideBar>
        <EuiSteps titleSize="xs" steps={ConfigureDatasourceSteps} />
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
