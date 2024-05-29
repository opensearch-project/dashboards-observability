/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiButtonIcon,
  EuiCodeBlock,
  EuiCopy,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiPage,
  EuiPageBody,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import round from 'lodash/round';
import React, { useEffect, useState } from 'react';
import { MountPoint } from '../../../../../../../src/core/public';
import {
  DataSourceManagementPluginSetup,
  DataSourceViewConfig,
} from '../../../../../../../src/plugins/data_source_management/public';
import { DataSourceOption } from '../../../../../../../src/plugins/data_source_management/public/components/data_source_menu/types';
import { TraceAnalyticsCoreDeps, TraceAnalyticsMode } from '../../home';
import { handleServiceMapRequest } from '../../requests/services_request_handler';
import {
  handlePayloadRequest,
  handleServicesPieChartRequest,
  handleTraceViewRequest,
} from '../../requests/traces_request_handler';
import { PanelTitle, filtersToDsl, processTimeStamp } from '../common/helper_functions';
import { ServiceMap, ServiceObject } from '../common/plots/service_map';
import { ServiceBreakdownPanel } from './service_breakdown_panel';
import { SpanDetailPanel } from './span_detail_panel';

interface TraceViewProps extends TraceAnalyticsCoreDeps {
  traceId: string;
  mode: TraceAnalyticsMode;
  dataSourceMDSId: DataSourceOption[];
  dataSourceManagement: DataSourceManagementPluginSetup;
  setActionMenu: (menuMount: MountPoint | undefined) => void;
  tenant?: string;
}

export function TraceView(props: TraceViewProps) {
  const { mode, tenant } = props;
  const page = 'traceView';
  const renderTitle = (traceId: string) => {
    return (
      <>
        <EuiFlexItem>
          <EuiTitle size="l">
            <h2 className="overview-content">{traceId}</h2>
          </EuiTitle>
        </EuiFlexItem>
      </>
    );
  };
  const DataSourceMenu = props.dataSourceManagement?.ui?.getDataSourceMenu<DataSourceViewConfig>();

  const renderOverview = (fields: any) => {
    return (
      <EuiPanel>
        <PanelTitle title="Overview" />
        <EuiHorizontalRule margin="m" />
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiFlexGroup direction="column">
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Trace ID</EuiText>
                {fields.trace_id && (
                  <EuiFlexGroup gutterSize="s" alignItems="center">
                    <EuiFlexItem grow={false}>
                      <EuiText size="s" className="overview-content">
                        {fields.trace_id}
                      </EuiText>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiCopy textToCopy={fields.trace_id}>
                        {(copy) => (
                          <EuiButtonIcon
                            aria-label="Copy trace id"
                            iconType="copyClipboard"
                            onClick={copy}
                          >
                            Click to copy
                          </EuiButtonIcon>
                        )}
                      </EuiCopy>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                )}
              </EuiFlexItem>
              {mode === 'data_prepper' ? (
                <EuiFlexItem grow={false}>
                  <EuiText className="overview-title">Trace group name</EuiText>
                  <EuiText size="s" className="overview-content">
                    {fields.trace_group || '-'}
                  </EuiText>
                </EuiFlexItem>
              ) : (
                <div />
              )}
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFlexGroup direction="column">
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Latency</EuiText>
                <EuiText size="s" className="overview-content">
                  {fields.latency}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Last updated</EuiText>
                <EuiText size="s" className="overview-content">
                  {fields.last_updated}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFlexGroup direction="column">
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Errors</EuiText>
                <EuiText size="s" className="overview-content">
                  {fields.error_count == null ? (
                    '-'
                  ) : fields.error_count > 0 ? (
                    <EuiText color="danger" size="s" style={{ fontWeight: 430 }}>
                      Yes
                    </EuiText>
                  ) : (
                    'No'
                  )}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    );
  };

  const [fields, setFields] = useState({});
  const [serviceBreakdownData, setServiceBreakdownData] = useState([]);
  const [payloadData, setPayloadData] = useState('');
  const [colorMap, setColorMap] = useState({});
  const [ganttData, setGanttData] = useState<{ gantt: any[]; table: any[]; ganttMaxX: number }>({
    gantt: [],
    table: [],
    ganttMaxX: 0,
  });
  const [serviceMap, setServiceMap] = useState<ServiceObject>({});
  const [traceFilteredServiceMap, setTraceFilteredServiceMap] = useState<ServiceObject>({});
  const [serviceMapIdSelected, setServiceMapIdSelected] = useState<
    'latency' | 'error_rate' | 'throughput'
  >('latency');

  const refresh = async () => {
    const DSL = filtersToDsl(
      mode,
      [],
      '',
      processTimeStamp('now', mode),
      processTimeStamp('now', mode),
      page
    );
    handleTraceViewRequest(
      props.traceId,
      props.http,
      fields,
      setFields,
      mode,
      props.dataSourceMDSId[0].id,
      tenant
    );
    handlePayloadRequest(
      props.traceId,
      props.http,
      payloadData,
      setPayloadData,
      mode,
      props.dataSourceMDSId[0].id,
      tenant
    );
    handleServicesPieChartRequest(
      props.traceId,
      props.http,
      setServiceBreakdownData,
      setColorMap,
      mode,
      props.dataSourceMDSId[0].id,
      tenant
    );
    handleServiceMapRequest(
      props.http,
      DSL,
      mode,
      props.dataSourceMDSId[0].id,
      setServiceMap,
      undefined,
      tenant
    );
  };

  useEffect(() => {
    if (!Object.keys(serviceMap).length || !ganttData.table.length) return;
    const services: any = {};
    ganttData.table.forEach((service: any) => {
      if (!services[service.service_name]) {
        services[service.service_name] = {
          latency: 0,
          errors: 0,
          throughput: 0,
        };
      }
      services[service.service_name].latency += service.latency;
      if (service.error) services[service.service_name].errors++;
      services[service.service_name].throughput++;
    });
    const filteredServiceMap: ServiceObject = {};
    Object.entries(services).forEach(([serviceName, service]: [string, any]) => {
      if (!serviceMap[serviceName]) return;
      filteredServiceMap[serviceName] = serviceMap[serviceName];
      filteredServiceMap[serviceName].latency = round(service.latency / service.throughput, 2);
      filteredServiceMap[serviceName].error_rate = round(
        (service.errors / service.throughput) * 100,
        2
      );
      filteredServiceMap[serviceName].throughput = service.throughput;
      filteredServiceMap[serviceName].destServices = filteredServiceMap[
        serviceName
      ].destServices.filter((destService) => services[destService]);
    });
    setTraceFilteredServiceMap(filteredServiceMap);
  }, [serviceMap, ganttData]);

  useEffect(() => {
    props.chrome.setBreadcrumbs([
      props.parentBreadcrumb,
      {
        text: 'Trace analytics',
        href: '#/home',
      },
      {
        text: 'Traces',
        href: '#/traces',
      },
      {
        text: props.traceId,
        href: `#/traces/${encodeURIComponent(props.traceId)}`,
      },
    ]);
    refresh();
  }, [props.mode, props.tenant]);

  return (
    <>
      <EuiPage>
        {props.dataSourceEnabled && (
          <DataSourceMenu
            setMenuMountPoint={props.setActionMenu}
            componentType={'DataSourceView'}
            componentConfig={{
              activeOption: props.dataSourceMDSId,
              fullWidth: true,
            }}
          />
        )}
        <EuiPageBody>
          <EuiFlexGroup alignItems="center" gutterSize="s">
            {renderTitle(props.traceId)}
          </EuiFlexGroup>
          <EuiSpacer size="xl" />
          {renderOverview(fields)}

          <EuiSpacer />
          <EuiFlexGroup>
            <EuiFlexItem grow={3}>
              <ServiceBreakdownPanel data={serviceBreakdownData} />
            </EuiFlexItem>
            <EuiFlexItem grow={7}>
              <SpanDetailPanel
                traceId={props.traceId}
                http={props.http}
                colorMap={colorMap}
                mode={mode}
                data={ganttData}
                setData={setGanttData}
                dataSourceMDSId={props.dataSourceMDSId[0].id}
                tenant={tenant}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer />

          <EuiPanel>
            <EuiFlexGroup>
              <EuiFlexItem>
                <PanelTitle title="Payload" />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiHorizontalRule margin="m" />
            {payloadData.length > 0 ? (
              <EuiCodeBlock language="json" paddingSize="s" isCopyable overflowHeight={500}>
                {payloadData}
              </EuiCodeBlock>
            ) : null}
          </EuiPanel>
          <EuiSpacer />
          {mode === 'data_prepper' ? (
            <ServiceMap
              addFilter={undefined}
              serviceMap={traceFilteredServiceMap}
              idSelected={serviceMapIdSelected}
              setIdSelected={setServiceMapIdSelected}
              page={page}
            />
          ) : (
            <div />
          )}
        </EuiPageBody>
      </EuiPage>
    </>
  );
}
