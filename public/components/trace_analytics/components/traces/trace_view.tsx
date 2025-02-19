/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiCodeBlock,
  EuiCopy,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiIconTip,
  EuiLoadingContent,
  EuiPage,
  EuiPageBody,
  EuiPanel,
  EuiSmallButtonIcon,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import round from 'lodash/round';
import React, { useEffect, useState } from 'react';
import { MountPoint } from '../../../../../../../src/core/public';
import { DataSourceManagementPluginSetup } from '../../../../../../../src/plugins/data_source_management/public';
import { DataSourceOption } from '../../../../../../../src/plugins/data_source_management/public/components/data_source_menu/types';
import { TraceAnalyticsMode } from '../../../../../common/types/trace_analytics';
import { setNavBreadCrumbs } from '../../../../../common/utils/set_nav_bread_crumbs';
import { coreRefs } from '../../../../framework/core_refs';
import { TraceAnalyticsCoreDeps } from '../../home';
import { handleServiceMapRequest } from '../../requests/services_request_handler';
import { handlePayloadRequest } from '../../requests/traces_request_handler';
import { TraceFilter } from '../common/constants';
import { PanelTitle, filtersToDsl, processTimeStamp } from '../common/helper_functions';
import { ServiceMap, ServiceObject } from '../common/plots/service_map';
import { ServiceBreakdownPanel } from './service_breakdown_panel';
import { SpanDetailPanel } from './span_detail_panel';
import { getOverviewFields, getServiceBreakdownData, spanFiltersToDSL } from './trace_view_helpers';

const newNavigation = coreRefs.chrome?.navGroup.getNavGroupEnabled();

interface TraceViewProps extends TraceAnalyticsCoreDeps {
  traceId: string;
  mode: TraceAnalyticsMode;
  dataSourceMDSId: DataSourceOption[];
  dataSourceManagement: DataSourceManagementPluginSetup;
  setActionMenu: (menuMount: MountPoint | undefined) => void;
  setDataSourceMenuSelectable?: React.Dispatch<React.SetStateAction<boolean>>;
}

export function TraceView(props: TraceViewProps) {
  const { mode } = props;
  const page = 'traceView';
  const renderTitle = (traceId: string) => {
    return (
      <>
        {!newNavigation && (
          <EuiFlexItem>
            <EuiText size="s">
              <h1 className="overview-content">{traceId}</h1>
            </EuiText>
          </EuiFlexItem>
        )}
      </>
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
  const [isServicesDataLoading, setIsServicesDataLoading] = useState(false);
  const [isTraceOverViewLoading, setIsTraceOverViewLoading] = useState(false);
  const [isTracePayloadLoading, setTracePayloadLoading] = useState(false);
  const [isServicesPieChartLoading, setIsServicesPieChartLoading] = useState(false);
  const [isGanttChartLoading, setIsGanttChartLoading] = useState(false);

  const storedFilters = sessionStorage.getItem('TraceAnalyticsSpanFilters');
  const [spanFilters, setSpanFilters] = useState<TraceFilter[]>(() =>
    storedFilters ? JSON.parse(storedFilters) : []
  );
  const [filteredPayload, setFilteredPayload] = useState('');

  const renderOverview = (overviewFields: any) => {
    return (
      <EuiPanel>
        <PanelTitle title="Overview" />
        {isTraceOverViewLoading ? (
          <div>
            <EuiLoadingContent lines={4} />
          </div>
        ) : (
          <>
            <EuiHorizontalRule margin="m" />
            <EuiFlexGroup>
              <EuiFlexItem>
                <EuiFlexGroup direction="column">
                  <EuiFlexItem grow={false}>
                    <EuiText className="overview-title">Trace ID</EuiText>
                    {overviewFields.trace_id && (
                      <EuiFlexGroup gutterSize="s" alignItems="center">
                        <EuiFlexItem grow={false}>
                          <EuiText size="s" className="overview-content">
                            {overviewFields.trace_id}
                          </EuiText>
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiCopy textToCopy={overviewFields.trace_id}>
                            {(copy) => (
                              <EuiSmallButtonIcon
                                aria-label="Copy trace id"
                                iconType="copyClipboard"
                                onClick={copy}
                              >
                                Click to copy
                              </EuiSmallButtonIcon>
                            )}
                          </EuiCopy>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    )}
                  </EuiFlexItem>
                  {mode === 'data_prepper' || mode === 'custom_data_prepper' ? (
                    <EuiFlexItem grow={false}>
                      <EuiText className="overview-title">Trace group name</EuiText>
                      <EuiText size="s" className="overview-content">
                        {overviewFields.trace_group || '-'}
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
                      {overviewFields.latency}
                      {overviewFields.fallbackValueUsed && (
                        <EuiIconTip
                          aria-label={i18n.translate('tracesOverview.iconTip.ariaLabel', {
                            defaultMessage: 'Warning',
                          })}
                          size="m"
                          type="alert"
                          color="warning"
                          content={i18n.translate('tracesOverview.iconTip.content', {
                            defaultMessage:
                              'Latency may not be accurate due to missing or unexpected duration data.',
                          })}
                        />
                      )}
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiText className="overview-title">Last updated</EuiText>
                    <EuiText size="s" className="overview-content">
                      {overviewFields.last_updated}
                    </EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiFlexGroup direction="column">
                  <EuiFlexItem grow={false}>
                    <EuiText className="overview-title">Errors</EuiText>
                    <EuiText size="s" className="overview-content">
                      {overviewFields.error_count == null ? (
                        '-'
                      ) : overviewFields.error_count > 0 ? (
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
          </>
        )}
      </EuiPanel>
    );
  };

  const refresh = async () => {
    const DSL = filtersToDsl(
      mode,
      [],
      '',
      processTimeStamp('now', mode),
      processTimeStamp('now', mode),
      page
    );

    setTracePayloadLoading(true);
    setIsTraceOverViewLoading(true);
    setIsServicesPieChartLoading(true);
    setIsGanttChartLoading(true);
    handlePayloadRequest(
      props.traceId,
      props.http,
      payloadData,
      setPayloadData,
      mode,
      props.dataSourceMDSId[0].id
    ).finally(() => setTracePayloadLoading(false));

    setIsServicesDataLoading(true);
    handleServiceMapRequest(
      props.http,
      DSL,
      mode,
      props.dataSourceMDSId[0].id,
      setServiceMap
    ).finally(() => setIsServicesDataLoading(false));
  };

  const setSpanFiltersWithStorage = (newFilters: TraceFilter[]) => {
    refreshFilteredPayload(newFilters);
    setSpanFilters(newFilters);
    sessionStorage.setItem('TraceAnalyticsSpanFilters', JSON.stringify(newFilters));
  };

  const refreshFilteredPayload = async (newFilters: TraceFilter[]) => {
    const spanDSL = spanFiltersToDSL(newFilters);
    setIsGanttChartLoading(true);
    handlePayloadRequest(
      props.traceId,
      props.http,
      spanDSL,
      setFilteredPayload,
      mode,
      props.dataSourceMDSId[0].id
    );
  };

  useEffect(() => {
    if (!payloadData) return;

    try {
      if (spanFilters.length > 0) {
        refreshFilteredPayload(spanFilters);
      } else {
        setFilteredPayload(payloadData);
      }

      setFilteredPayload(payloadData);
      const parsedPayload = JSON.parse(payloadData);
      const overview = getOverviewFields(parsedPayload, mode);
      if (overview) {
        setFields(overview);
      }

      const {
        serviceBreakdownData: queryServiceBreakdownData,
        colorMap: queryColorMap,
      } = getServiceBreakdownData(parsedPayload, mode);
      setServiceBreakdownData(queryServiceBreakdownData);
      setColorMap(queryColorMap);
    } catch (error) {
      console.error('Error processing payloadData:', error);
    } finally {
      setIsTraceOverViewLoading(false);
      setIsServicesPieChartLoading(false);
    }
  }, [payloadData, mode]);

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
    setNavBreadCrumbs(
      [
        props.parentBreadcrumb,
        {
          text: 'Trace analytics',
          href: '#/traces',
        },
      ],
      [
        {
          text: 'Traces',
          href: '#/traces',
        },
        {
          text: props.traceId,
          href: `#/traces/${encodeURIComponent(props.traceId)}`,
        },
      ]
    );
    props.setDataSourceMenuSelectable?.(false);
    refresh();
  }, [props.mode, props.setDataSourceMenuSelectable]);

  return (
    <>
      <EuiPage>
        <EuiPageBody>
          {renderTitle(props.traceId)}
          <EuiFlexGroup alignItems="stretch" gutterSize="s">
            <EuiFlexItem grow={5}>{renderOverview(fields)}</EuiFlexItem>
            <EuiFlexItem grow={3}>
              <ServiceBreakdownPanel
                data={serviceBreakdownData}
                isLoading={isServicesPieChartLoading}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="m" />
          <EuiFlexGroup>
            <EuiFlexItem>
              <SpanDetailPanel
                traceId={props.traceId}
                http={props.http}
                colorMap={colorMap}
                mode={mode}
                data={ganttData}
                setGanttData={setGanttData}
                dataSourceMDSId={props.dataSourceMDSId[0].id}
                dataSourceMDSLabel={props.dataSourceMDSId[0].label}
                payloadData={filteredPayload}
                isGanttChartLoading={isGanttChartLoading}
                setGanttChartLoading={setIsGanttChartLoading}
                spanFilters={spanFilters}
                setSpanFiltersWithStorage={setSpanFiltersWithStorage}
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
            {isTracePayloadLoading ? (
              <div>
                <EuiLoadingContent lines={4} />
              </div>
            ) : (
              payloadData.length > 0 && (
                <EuiCodeBlock language="json" paddingSize="s" isCopyable overflowHeight={500}>
                  {payloadData}
                </EuiCodeBlock>
              )
            )}
          </EuiPanel>
          <EuiSpacer />
          {mode === 'data_prepper' || mode === 'custom_data_prepper' ? (
            <ServiceMap
              addFilter={undefined}
              serviceMap={traceFilteredServiceMap}
              isServicesDataLoading={isServicesDataLoading}
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
