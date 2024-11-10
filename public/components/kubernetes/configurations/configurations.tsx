/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  EuiPage,
  EuiPageBody,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiTitle,
  EuiText,
  EuiSpacer,
  EuiPanel,
  EuiForm,
  EuiFormRow,
  EuiFieldText,
  EuiButton,
  EuiSelect,
  EuiFlexGroup,
  EuiFlexItem,
  EuiAccordion,
  EuiGlobalToastList,
} from '@elastic/eui';

export const KubernetesConfiguration = () => {
  const [prometheusUri, setPrometheusUri] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [region, setRegion] = useState('');
  // const [datasourceName, setDatasourceName] = useState('prometheus_k8s_cluster');
  const [datasourceName, setDatasourceName] = useState('local cluster');
  const [osUri, setOsUri] = useState('');
  const [osUsername, setOsUsername] = useState('');
  const [osPassword, setOsPassword] = useState('');
  const [toasts, setToasts] = useState([]);

  const addToast = () => {
    const newToast = {
      id: new Date().getTime(),
      title: 'Prometheus datasource created',
      color: 'success',
      text: <p>Your Prometheus datasource has been successfully created.</p>,
    };
    setToasts([...toasts, newToast]);
  };

  const removeToast = (removedToast) => {
    setToasts(toasts.filter((toast) => toast.id !== removedToast.id));
  };

  const handleCreateDatasource = () => {
    // Simulate a successful creation with a toast notification
    addToast();
  };

  return (
    <EuiPage paddingSize="l">
      <EuiPageBody>
        <EuiPageHeader>
          <EuiPageHeaderSection>
            <EuiTitle size="l">
              <h1>Kubernetes Configuration</h1>
            </EuiTitle>
          </EuiPageHeaderSection>
        </EuiPageHeader>

        <EuiSpacer size="l" />

        {/* Prerequisites Section */}
        <EuiPanel paddingSize="m">
          <EuiTitle size="s">
            <h2>Prerequisites</h2>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiText>
            <ul>
              <li>
                Ensure that you have access to a <strong>Prometheus</strong> instance and a <strong>Kubernetes cluster</strong> for providing Access Key and Secret Key.
              </li>
              <li>
                Have an <strong>OpenSearch compatible domain</strong> as a datasource, or enable a local OpenSearch cluster to create the Prometheus datasource in OpenSearch.
              </li>
            </ul>
          </EuiText>
        </EuiPanel>

        <EuiSpacer size="l" />

        {/* Datasource Selector Section */}
        <EuiPanel paddingSize="m">
          <EuiTitle size="s">
            <h2>Datasource Selector</h2>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiForm component="form">
            <EuiAccordion
              id="opensearchDatasourceConfig"
              buttonContent="OpenSearch Datasource Configuration"
              paddingSize="m"
            >
              <EuiFormRow label="OpenSearch URI" helpText="Enter the URI for your OpenSearch instance.">
                <EuiFieldText
                  placeholder="https://localhost:9200"
                  value={osUri}
                  onChange={(e) => setOsUri(e.target.value)}
                />
              </EuiFormRow>
              <EuiFormRow label="OpenSearch Username">
                <EuiFieldText
                  placeholder="admin"
                  value={osUsername}
                  onChange={(e) => setOsUsername(e.target.value)}
                />
              </EuiFormRow>
              <EuiFormRow label="OpenSearch Password">
                <EuiFieldText
                  type="password"
                  placeholder="password"
                  value={osPassword}
                  onChange={(e) => setOsPassword(e.target.value)}
                />
              </EuiFormRow>
            </EuiAccordion>

            <EuiSpacer size="l" />

            <EuiAccordion
              id="prometheusDatasourceConfig"
              buttonContent="Prometheus Datasource Configuration"
              paddingSize="m"
            >
              <EuiFormRow label="Datasource Name">
                <EuiFieldText
                  placeholder="prometheus_k8s_cluster"
                  value={datasourceName}
                  onChange={(e) => setDatasourceName(e.target.value)}
                />
              </EuiFormRow>
              <EuiFormRow label="Prometheus URI" helpText="Enter the URI for your Prometheus instance.">
                <EuiFieldText
                  placeholder="https://prometheus.example.com"
                  value={prometheusUri}
                  onChange={(e) => setPrometheusUri(e.target.value)}
                />
              </EuiFormRow>
              <EuiFormRow label="Access Key">
                <EuiFieldText
                  placeholder="Your Access Key"
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                />
              </EuiFormRow>
              <EuiFormRow label="Secret Key">
                <EuiFieldText
                  type="password"
                  placeholder="Your Secret Key"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                />
              </EuiFormRow>
              <EuiFormRow label="Region">
                <EuiFieldText
                  placeholder="us-east-1"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                />
              </EuiFormRow>
            </EuiAccordion>
          </EuiForm>
        </EuiPanel>

        <EuiSpacer size="l" />

        {/* Create Datasource Button */}
        <EuiButton fill color="primary" onClick={handleCreateDatasource}>
          Create Prometheus Datasource
        </EuiButton>

        {/* Toast Notifications */}
        <EuiGlobalToastList
          toasts={toasts}
          dismissToast={removeToast}
          toastLifeTimeMs={6000}
        />
      </EuiPageBody>
    </EuiPage>
  );
};
