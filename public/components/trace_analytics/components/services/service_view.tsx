/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiBadge,
  EuiSmallButton,
  EuiContextMenu,
  EuiContextMenuPanelDescriptor,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiHorizontalRule,
  EuiI18nNumber,
  EuiLink,
  EuiPage,
  EuiPageBody,
  EuiPanel,
  EuiPopover,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import _ from 'lodash';
import React, { useEffect, useMemo, useState } from 'react';
import {
  DataSourceManagementPluginSetup,
  DataSourceViewConfig,
} from '../../../../../../../src/plugins/data_source_management/public';
import { DataSourceOption } from '../../../../../../../src/plugins/data_source_management/public/components/data_source_menu/types';
import {
  DEFAULT_DATA_SOURCE_NAME,
  DEFAULT_DATA_SOURCE_TYPE,
} from '../../../../../common/constants/data_sources';
import { observabilityLogsID } from '../../../../../common/constants/shared';
import { setNavBreadCrumbs } from '../../../../../common/utils/set_nav_bread_crumbs';
import { dataSourceFilterFn } from '../../../../../common/utils/shared';
import { coreRefs } from '../../../../framework/core_refs';
import { TraceAnalyticsComponentDeps } from '../../home';
import {
  handleServiceMapRequest,
  handleServiceViewRequest,
} from '../../requests/services_request_handler';
import { FilterType } from '../common/filters/filters';
import { PanelTitle, filtersToDsl, processTimeStamp } from '../common/helper_functions';
import { ServiceMap, ServiceObject } from '../common/plots/service_map';
import { SearchBarProps, renderDatePicker } from '../common/search_bar';
import { SpanDetailFlyout } from '../traces/span_detail_flyout';
import { SpanDetailTable } from '../traces/span_detail_table';
import { ServiceMetrics } from './service_metrics';

interface ServiceViewProps extends TraceAnalyticsComponentDeps {
  serviceName: string;
  addFilter: (filter: FilterType) => void;
  dataSourceMDSId: DataSourceOption[];
  dataSourceManagement: DataSourceManagementPluginSetup;
  dataSourceEnabled: boolean;
  page?: string;
  setCurrentSelectedService?: React.Dispatch<React.SetStateAction<string>>;
}

export function ServiceView(props: ServiceViewProps) {
  const { mode, page, setCurrentSelectedService } = props;
  const [fields, setFields] = useState<any>({});
  const [serviceMap, setServiceMap] = useState<ServiceObject>({});
  const [serviceMapIdSelected, setServiceMapIdSelected] = useState<
    'latency' | 'error_rate' | 'throughput'
  >('latency');
  const [redirect, setRedirect] = useState(false);
  const [actionsMenuPopover, setActionsMenuPopover] = useState(false);

  const refresh = () => {
    const DSL = filtersToDsl(
      mode,
      props.filters,
      props.query,
      processTimeStamp(props.startTime, mode),
      processTimeStamp(props.endTime, mode)
    );
    handleServiceViewRequest(
      props.serviceName,
      props.http,
      DSL,
      setFields,
      mode,
      props.dataSourceMDSId[0].id
    );
    if (mode === 'data_prepper') {
      handleServiceMapRequest(
        props.http,
        DSL,
        mode,
        props.dataSourceMDSId[0].id,
        setServiceMap,
        props.serviceName
      );
    }
  };

  useEffect(() => {
    if (page !== 'serviceFlyout')
      setNavBreadCrumbs(
        [
          props.parentBreadcrumb,
          {
            text: 'Trace analytics',
            href: '#/services',
          },
        ],
        [
          {
            text: 'Services',
            href: '#/services',
          },
          {
            text: props.serviceName,
            href: `#/services/${encodeURIComponent(props.serviceName)}`,
          },
        ]
      );
  }, [props.serviceName]);

  const DataSourceMenu = props.dataSourceManagement?.ui?.getDataSourceMenu<DataSourceViewConfig>();

  const redirectToServicePage = (service: string) => {
    window.location.href = `#/services/${service}`;
  };

  const onClickConnectedService = (service: string) => {
    if (page !== 'serviceFlyout') redirectToServicePage(service);
    else if (setCurrentSelectedService) setCurrentSelectedService(service);
  };

  const redirectToServiceTraces = () => {
    if (setCurrentSelectedService) setCurrentSelectedService('');
    setRedirect(true);
    const filterField = mode === 'data_prepper' ? 'serviceName' : 'process.serviceName';
    props.addFilter({
      field: filterField,
      operator: 'is',
      value: props.serviceName,
      inverted: false,
      disabled: false,
    });
    location.assign('#/traces');
  };

  useEffect(() => {
    if (!redirect) refresh();
  }, [props.startTime, props.endTime, props.serviceName, props.mode]);

  const actionsButton = (
    <EuiSmallButton
      data-test-subj="ActionContextMenu"
      iconType="arrowDown"
      iconSide="right"
      onClick={() => setActionsMenuPopover(true)}
    >
      Actions
    </EuiSmallButton>
  );

  const actionsMenu: EuiContextMenuPanelDescriptor[] = [
    {
      id: 0,
      items: [
        ...(mode === 'data_prepper'
          ? [
              {
                name: 'View logs',
                'data-test-subj': 'viewLogsButton',
                onClick: () => {
                  coreRefs?.application!.navigateToApp(observabilityLogsID, {
                    path: `#/explorer`,
                    state: {
                      DEFAULT_DATA_SOURCE_NAME,
                      DEFAULT_DATA_SOURCE_TYPE,
                      queryToRun: `source = ss4o_logs-* | where serviceName='${props.serviceName}'`,
                      startTimeRange: props.startTime,
                      endTimeRange: props.endTime,
                    },
                  });
                },
              },
            ]
          : []),
        {
          name: 'View traces',
          'data-test-subj': 'viewTracesButton',
          onClick: redirectToServiceTraces,
        },
        {
          name: 'Expand view',
          'data-test-subj': 'viewServiceButton',
          onClick: () => {
            if (setCurrentSelectedService) setCurrentSelectedService('');
            redirectToServicePage(props.serviceName);
          },
        },
      ],
    },
  ];

  const renderTitle = (
    serviceName: string,
    startTime: SearchBarProps['startTime'],
    setStartTime: SearchBarProps['setStartTime'],
    endTime: SearchBarProps['endTime'],
    setEndTime: SearchBarProps['setEndTime'],
    _addFilter: (filter: FilterType) => void,
    _page?: string
  ) => {
    return (
      <>
        {_page === 'serviceFlyout' ? (
          <EuiFlyoutHeader hasBorder>
            <EuiFlexGroup justifyContent="spaceBetween">
              <EuiFlexItem>
                <EuiTitle size="l">
                  <h2 className="overview-content">{serviceName}</h2>
                </EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiPopover
                  panelPaddingSize="none"
                  button={actionsButton}
                  isOpen={actionsMenuPopover}
                  closePopover={() => setActionsMenuPopover(false)}
                >
                  <EuiContextMenu initialPanelId={0} panels={actionsMenu} />
                </EuiPopover>
              </EuiFlexItem>
            </EuiFlexGroup>
            {renderDatePicker(startTime, setStartTime, endTime, setEndTime)}
          </EuiFlyoutHeader>
        ) : (
          <EuiFlexGroup alignItems="center" gutterSize="s">
            <EuiFlexItem>
              <EuiTitle size="l">
                <h2 className="overview-content">{serviceName}</h2>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              {renderDatePicker(startTime, setStartTime, endTime, setEndTime)}
            </EuiFlexItem>
          </EuiFlexGroup>
        )}
      </>
    );
  };

  const renderOverview = () => {
    return (
      <>
        {props.dataSourceEnabled && (
          <DataSourceMenu
            setMenuMountPoint={props.setActionMenu}
            componentType={'DataSourceView'}
            componentConfig={{
              activeOption: props.dataSourceMDSId,
              fullWidth: true,
              dataSourceFilter: dataSourceFilterFn,
            }}
          />
        )}
        <EuiPanel>
          <PanelTitle title="Overview" />
          <EuiHorizontalRule margin="m" />
          <EuiFlexGroup>
            <EuiFlexItem>
              <EuiFlexGroup direction="column">
                <EuiFlexItem grow={false}>
                  <EuiText className="overview-title">Name</EuiText>
                  <EuiText size="s" className="overview-content">
                    {props.serviceName || '-'}
                  </EuiText>
                </EuiFlexItem>
                {mode === 'data_prepper' ? (
                  <EuiFlexItem grow={false}>
                    <EuiText className="overview-title">Number of connected services</EuiText>
                    <EuiText size="s" className="overview-content">
                      {fields.number_of_connected_services !== undefined
                        ? fields.number_of_connected_services
                        : 0}
                    </EuiText>
                  </EuiFlexItem>
                ) : (
                  <EuiFlexItem />
                )}
                {mode === 'data_prepper' ? (
                  <EuiFlexItem grow={false}>
                    <EuiText className="overview-title">Connected services</EuiText>
                    <EuiText size="s" className="overview-content">
                      {fields.connected_services && fields.connected_services.length
                        ? fields.connected_services
                            .map((service: string) => (
                              <EuiLink
                                onClick={() => onClickConnectedService(service)}
                                key={service}
                              >
                                {service}
                              </EuiLink>
                            ))
                            .reduce((prev: React.ReactNode, curr: React.ReactNode) => {
                              return [prev, ', ', curr];
                            })
                        : '-'}
                    </EuiText>
                  </EuiFlexItem>
                ) : (
                  <EuiFlexItem />
                )}
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiFlexGroup direction="column">
                <EuiFlexItem grow={false}>
                  <EuiText className="overview-title">Average duration (ms)</EuiText>
                  <EuiText size="s" className="overview-content">
                    {fields.average_latency !== undefined ? fields.average_latency : '-'}
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText className="overview-title">Error rate</EuiText>
                  <EuiText size="s" className="overview-content">
                    {fields.error_rate !== undefined
                      ? _.round(fields.error_rate, 2).toString() + '%'
                      : '-'}
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText className="overview-title">Request rate</EuiText>
                  <EuiText size="s" className="overview-content">
                    {fields.throughput !== undefined ? (
                      <EuiI18nNumber value={fields.throughput} />
                    ) : (
                      '-'
                    )}
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText className="overview-title">Traces</EuiText>
                  <EuiText size="s" className="overview-content">
                    {fields.traces === 0 || fields.traces ? (
                      <EuiLink onClick={redirectToServiceTraces}>
                        <EuiI18nNumber value={fields.traces} />
                      </EuiLink>
                    ) : (
                      '-'
                    )}
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer />
        </EuiPanel>
      </>
    );
  };

  const overview = useMemo(() => renderOverview(), [fields, props.serviceName]);

  const title = useMemo(
    () =>
      renderTitle(
        props.serviceName,
        props.startTime,
        props.setStartTime,
        props.endTime,
        props.setEndTime,
        props.addFilter,
        page
      ),
    [props.serviceName, props.startTime, props.endTime, page, actionsMenuPopover]
  );

  const activeFilters = useMemo(
    () => props.filters.filter((filter) => !filter.locked && !filter.disabled),
    [props.filters]
  );

  const [currentSpan, setCurrentSpan] = useState('');
  const storedFilters = sessionStorage.getItem('TraceAnalyticsSpanFilters');
  const [spanFilters, setSpanFilters] = useState<Array<{ field: string; value: any }>>(
    storedFilters ? JSON.parse(storedFilters) : []
  );
  const [DSL, setDSL] = useState<any>({});

  const setSpanFiltersWithStorage = (newFilters: Array<{ field: string; value: any }>) => {
    setSpanFilters(newFilters);
    sessionStorage.setItem('TraceAnalyticsSpanFilters', JSON.stringify(newFilters));
  };

  useEffect(() => {
    const spanDSL = filtersToDsl(
      mode,
      props.filters,
      props.query,
      processTimeStamp(props.startTime, mode),
      processTimeStamp(props.endTime, mode)
    );
    if (mode === 'data_prepper') {
      spanDSL.query.bool.must.push({
        term: {
          serviceName: props.serviceName,
        },
      });
    } else if (mode === 'jaeger') {
      spanDSL.query.bool.must.push({
        term: {
          'process.serviceName': props.serviceName,
        },
      });
    }
    spanFilters.map(({ field, value }) => {
      if (value != null) {
        spanDSL.query.bool.must.push({
          term: {
            [field]: value,
          },
        });
      }
    });
    setDSL(spanDSL);
  }, [props.startTime, props.endTime, props.serviceName, spanFilters]);

  const addSpanFilter = (field: string, value: any) => {
    const newFilters = [...spanFilters];
    const index = newFilters.findIndex(({ field: filterField }) => field === filterField);
    if (index === -1) {
      newFilters.push({ field, value });
    } else {
      newFilters.splice(index, 1, { field, value });
    }
    setSpanFiltersWithStorage(newFilters);
  };

  const removeSpanFilter = (field: string) => {
    const newFilters = [...spanFilters];
    const index = newFilters.findIndex(({ field: filterField }) => field === filterField);
    if (index !== -1) {
      newFilters.splice(index, 1);
      setSpanFiltersWithStorage(newFilters);
    }
  };

  const renderFilters = useMemo(() => {
    return spanFilters.map(({ field, value }) => (
      <EuiFlexItem grow={false} key={`span-filter-badge-${field}`}>
        <EuiBadge
          iconType="cross"
          iconSide="right"
          iconOnClick={() => removeSpanFilter(field)}
          iconOnClickAriaLabel="remove current filter"
        >
          {`${field}: ${value}`}
        </EuiBadge>
      </EuiFlexItem>
    ));
  }, [spanFilters]);

  const [total, setTotal] = useState(0);
  const spanDetailTable = useMemo(
    () => (
      <SpanDetailTable
        http={props.http}
        hiddenColumns={['serviceName']}
        DSL={DSL}
        openFlyout={(spanId: string) => setCurrentSpan(spanId)}
        setTotal={setTotal}
        mode={mode}
        dataSourceMDSId={props.dataSourceMDSId[0].id}
      />
    ),
    [DSL, setCurrentSpan, spanFilters]
  );

  const pageToRender = (
    <>
      {activeFilters.length > 0 && (
        <EuiText textAlign="right" style={{ marginRight: 20 }} color="subdued">
          results are filtered by {activeFilters.map((filter) => filter.field).join(', ')}
        </EuiText>
      )}
      <EuiSpacer size="xl" />
      {overview}

      {mode === 'data_prepper' ? (
        <>
          <EuiSpacer />
          <ServiceMetrics
            serviceName={props.serviceName}
            mode={mode}
            dataSourceMDSId={props.dataSourceMDSId}
            setStartTime={props.setStartTime}
            setEndTime={props.setEndTime}
            page={props.page}
          />
          <EuiSpacer />
          <ServiceMap
            serviceMap={serviceMap}
            idSelected={serviceMapIdSelected}
            setIdSelected={setServiceMapIdSelected}
            currService={props.serviceName}
            page="serviceView"
            filterByCurrService={true}
          />
        </>
      ) : (
        <div />
      )}
      <EuiSpacer />
      <EuiPanel>
        <PanelTitle title="Spans" totalItems={total} />
        {spanFilters.length > 0 && (
          <>
            <EuiSpacer size="s" />
            <EuiFlexGroup gutterSize="s" wrap>
              {renderFilters}
            </EuiFlexGroup>
          </>
        )}
        <EuiHorizontalRule margin="m" />
        <div>{spanDetailTable}</div>
      </EuiPanel>
    </>
  );

  return (
    <>
      {page === 'serviceFlyout' ? (
        !!currentSpan ? (
          <SpanDetailFlyout
            http={props.http}
            spanId={currentSpan}
            isFlyoutVisible={!!currentSpan}
            closeFlyout={() => {
              setCurrentSpan('');
              if (props.setCurrentSelectedService) props.setCurrentSelectedService('');
            }}
            addSpanFilter={addSpanFilter}
            mode={mode}
            serviceName={props.serviceName}
            dataSourceMDSId={props.dataSourceMDSId[0].id}
            startTime={props.startTime}
            endTime={props.endTime}
            setCurrentSpan={setCurrentSpan}
          />
        ) : (
          <EuiFlyout
            ownFocus
            onClose={() => props.setCurrentSelectedService && props.setCurrentSelectedService('')}
            paddingSize="l"
          >
            {title}
            <EuiFlyoutBody>{pageToRender}</EuiFlyoutBody>
          </EuiFlyout>
        )
      ) : (
        <EuiPage>
          <EuiPageBody>
            {title}
            {pageToRender}
            {!!currentSpan && (
              <SpanDetailFlyout
                http={props.http}
                spanId={currentSpan}
                isFlyoutVisible={!!currentSpan}
                closeFlyout={() => setCurrentSpan('')}
                addSpanFilter={addSpanFilter}
                mode={mode}
                dataSourceMDSId={props.dataSourceMDSId[0].id}
              />
            )}
          </EuiPageBody>
        </EuiPage>
      )}
    </>
  );
}
