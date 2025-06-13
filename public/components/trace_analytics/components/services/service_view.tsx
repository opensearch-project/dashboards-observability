/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiBadge,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiHorizontalRule,
  EuiI18nNumber,
  EuiLink,
  EuiLoadingContent,
  EuiPage,
  EuiPageBody,
  EuiPanel,
  EuiSmallButtonIcon,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import round from 'lodash/round';
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { DataSourceManagementPluginSetup } from '../../../../../../../src/plugins/data_source_management/public';
import { DataSourceOption } from '../../../../../../../src/plugins/data_source_management/public/components/data_source_menu/types';
import { setNavBreadCrumbs } from '../../../../../common/utils/set_nav_bread_crumbs';
import { coreRefs } from '../../../../framework/core_refs';
import { HeaderControlledComponentsWrapper } from '../../../../plugin_helpers/plugin_headerControl';
import { TraceAnalyticsComponentDeps } from '../../home';
import {
  checkValidServiceName,
  handleServiceViewRequest,
} from '../../requests/services_request_handler';
import { TraceFilter } from '../common/constants';
import { FilterType } from '../common/filters/filters';
import {
  NoMatchMessage,
  PanelTitle,
  filtersToDsl,
  generateServiceUrl,
  processTimeStamp,
} from '../common/helper_functions';
import { ServiceMap, ServiceObject } from '../common/plots/service_map';
import { redirectToServiceLogs, redirectToServiceTraces } from '../common/redirection_helpers';
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
  const [serviceId, setServiceId] = useState<string | null>(null);
  const location = useLocation();
  const [isServiceOverviewLoading, setIsServiceOverviewLoading] = useState(false);
  const [isServicesDataLoading, setIsServicesDataLoading] = useState(false);
  const [serviceIdError, setServiceIdError] = useState(false);
  const [serviceIdEmpty, setserviceIdEmpty] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(location?.search || '');
      const id = params.get('serviceId');
      setServiceId(id);
    } catch (error) {
      setServiceId(null);
    }
  }, [location]);

  useEffect(() => {
    setServiceIdError(false);
    setserviceIdEmpty(false);
  }, [props.serviceName]);

  const hideSearchBarCheck = page === 'serviceFlyout' || serviceId !== '';

  const handleServiceDataResponse = (data: any) => {
    try {
      if (!data || Object.keys(data).length === 0) {
        setserviceIdEmpty(true);
        setFields({});
        setServiceMap({});
      } else {
        setserviceIdEmpty(false);
        setFields(data);
      }
    } catch (e) {
      setserviceIdEmpty(true);
      setFields({});
      setServiceMap({});
    }
  };

  const refresh = async () => {
    const DSL = filtersToDsl(
      mode,
      props.filters,
      props.query,
      processTimeStamp(props.startTime, mode),
      processTimeStamp(props.endTime, mode, true)
    );

    setIsServiceOverviewLoading(true);
    setIsServicesDataLoading(true);

    const validService = await checkValidServiceName(
      props.http,
      mode,
      props.serviceName,
      props.dataSourceMDSId[0].id
    );

    if (!validService) {
      setServiceIdError(true);
      setFields({});
      setServiceMap({});
      setIsServiceOverviewLoading(false);
      setIsServicesDataLoading(false);
      return;
    }

    handleServiceViewRequest(
      props.serviceName,
      props.http,
      DSL,
      handleServiceDataResponse,
      mode,
      setServiceMap,
      props.dataSourceMDSId[0].id
    ).finally(() => {
      setIsServiceOverviewLoading(false);
      setIsServicesDataLoading(false);
    });
  };

  useEffect(() => {
    if (page !== 'serviceFlyout')
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
            text: 'Services',
            href: '#/services',
          },
          {
            text: props.serviceName,
            href: generateServiceUrl(props.serviceName, props.dataSourceMDSId[0].id),
          },
        ]
      );
    props.setDataSourceMenuSelectable?.(false);
  }, [props.serviceName, props.setDataSourceMenuSelectable]);

  const redirectToServicePage = (service: string) => {
    window.location.href = generateServiceUrl(service, props.dataSourceMDSId[0].id, mode);
  };

  const onClickConnectedService = (service: string) => {
    if (page !== 'serviceFlyout') redirectToServicePage(service);
    else if (setCurrentSelectedService) setCurrentSelectedService(service);
  };

  const renderServiceActionsMenu = (isFlyout: boolean) => {
    return (
      <EuiFlexItem grow={false}>
        <EuiFlexGroup justifyContent="center" gutterSize="s">
          <EuiFlexItem
            grow={false}
            onClick={() => {
              if (setCurrentSelectedService) setCurrentSelectedService('');
              setRedirect(true);
              redirectToServiceTraces({
                mode: props.mode,
                addFilter: props.addFilter,
                dataSourceMDSId: props.dataSourceMDSId,
                serviceName: props.serviceName,
              });
            }}
          >
            <EuiToolTip content="View service traces">
              <EuiLink data-test-subj={'service-view-traces-redirection-btn'}>
                <EuiSmallButtonIcon iconType="apmTrace" display="base" />
              </EuiLink>
            </EuiToolTip>
          </EuiFlexItem>
          {mode === 'data_prepper' && (
            <>
              <EuiFlexItem
                grow={false}
                onClick={() =>
                  redirectToServiceLogs({
                    fromTime: props.startTime,
                    toTime: props.endTime,
                    dataSourceMDSId: props.dataSourceMDSId,
                    serviceName: props.serviceName,
                  })
                }
              >
                <EuiToolTip content="View service logs">
                  <EuiLink data-test-subj={'service-view-logs-redirection-btn'}>
                    <EuiSmallButtonIcon iconType="discoverApp" display="base" />
                  </EuiLink>
                </EuiToolTip>
              </EuiFlexItem>
              {isFlyout && (
                <EuiFlexItem
                  grow={false}
                  onClick={() => {
                    redirectToServicePage(props.serviceName);
                    if (setCurrentSelectedService) setCurrentSelectedService('');
                  }}
                >
                  <EuiToolTip content="View service page">
                    <EuiLink data-test-subj={'service-view-flyout-action-btn'}>
                      <EuiSmallButtonIcon iconType="graphApp" display="base" />
                    </EuiLink>
                  </EuiToolTip>
                </EuiFlexItem>
              )}
            </>
          )}
        </EuiFlexGroup>
      </EuiFlexItem>
    );
  };

  useEffect(() => {
    if (!redirect) refresh();
  }, [props.startTime, props.endTime, props.serviceName, props.mode]);

  const serviceHeader = (
    <EuiText size="s">
      <h1 className="overview-content">{props.serviceName}</h1>
    </EuiText>
  );

  const renderTitle = (
    startTime: SearchBarProps['startTime'],
    setStartTime: SearchBarProps['setStartTime'],
    endTime: SearchBarProps['endTime'],
    setEndTime: SearchBarProps['setEndTime'],
    _addFilter: (filter: FilterType) => void,
    currentPage?: string
  ) => {
    return (
      <>
        {currentPage === 'serviceFlyout' ? (
          <EuiFlyoutHeader hasBorder>
            <EuiFlexGroup justifyContent="spaceBetween">
              <EuiFlexItem>{serviceHeader}</EuiFlexItem>
            </EuiFlexGroup>
            <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" gutterSize="s">
              <EuiFlexItem grow={true}>
                {renderDatePicker(startTime, setStartTime, endTime, setEndTime)}
              </EuiFlexItem>
              {renderServiceActionsMenu(currentPage === 'serviceFlyout')}
            </EuiFlexGroup>
          </EuiFlyoutHeader>
        ) : coreRefs?.chrome?.navGroup.getNavGroupEnabled() ? (
          <HeaderControlledComponentsWrapper
            components={[
              renderDatePicker(startTime, setStartTime, endTime, setEndTime),
              renderServiceActionsMenu(currentPage === 'serviceFlyout'),
            ]}
          />
        ) : (
          <EuiFlexGroup alignItems="center" gutterSize="s">
            <EuiFlexItem>{serviceHeader}</EuiFlexItem>
            <EuiFlexItem grow={false}>
              {renderDatePicker(startTime, setStartTime, endTime, setEndTime)}
            </EuiFlexItem>
            {renderServiceActionsMenu(currentPage === 'serviceFlyout')}
          </EuiFlexGroup>
        )}
      </>
    );
  };

  const renderOverview = () => {
    return (
      <>
        <EuiPanel>
          <PanelTitle title="Overview" />
          {isServiceOverviewLoading ? (
            <div>
              <EuiLoadingContent lines={4} />
            </div>
          ) : (
            <>
              <EuiHorizontalRule margin="m" />
              {serviceIdEmpty || serviceIdError ? (
                <NoMatchMessage size="xl" mode={mode} />
              ) : (
                <>
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
                            <EuiText className="overview-title">
                              Number of connected services
                            </EuiText>
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
                              ? round(fields.error_rate, 2).toString() + '%'
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
                              <EuiI18nNumber value={fields.traces} />
                            ) : (
                              '-'
                            )}
                          </EuiText>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                  <EuiSpacer />
                </>
              )}
            </>
          )}
        </EuiPanel>
      </>
    );
  };

  const overview = useMemo(() => renderOverview(), [
    fields,
    isServiceOverviewLoading,
    props.serviceName,
  ]);

  const title = useMemo(
    () =>
      renderTitle(
        props.startTime,
        props.setStartTime,
        props.endTime,
        props.setEndTime,
        props.addFilter,
        page
      ),
    [props.startTime, props.endTime, page]
  );

  const activeFilters = useMemo(
    () => props.filters.filter((filter) => !filter.locked && !filter.disabled),
    [props.filters]
  );

  const [currentSpan, setCurrentSpan] = useState('');
  const storedFilters = sessionStorage.getItem('TraceAnalyticsSpanFilters');
  const [spanFilters, setSpanFilters] = useState<TraceFilter[]>(
    storedFilters ? JSON.parse(storedFilters) : []
  );
  const [DSL, setDSL] = useState<any>({});

  const setSpanFiltersWithStorage = (newFilters: TraceFilter[]) => {
    setSpanFilters(newFilters);
    sessionStorage.setItem('TraceAnalyticsSpanFilters', JSON.stringify(newFilters));
  };

  useEffect(() => {
    const spanDSL = filtersToDsl(
      mode,
      props.filters,
      props.query,
      processTimeStamp(props.startTime, mode),
      processTimeStamp(props.endTime, mode, true)
    );
    if (mode === 'data_prepper') {
      spanDSL.query.bool.filter.push({
        term: {
          serviceName: props.serviceName,
        },
      });
    } else if (mode === 'jaeger') {
      spanDSL.query.bool.filter.push({
        term: {
          'process.serviceName': props.serviceName,
        },
      });
    }
    spanFilters.map(({ field, value }) => {
      if (value != null) {
        spanDSL.query.bool.filter.push({
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
  const spanDetailTable = useMemo(() => {
    // only render when time and service state updates in DSL
    if (Object.keys(DSL).length > 0)
      return (
        <SpanDetailTable
          http={props.http}
          hiddenColumns={['serviceName']}
          DSL={DSL}
          openFlyout={(spanId: string) => setCurrentSpan(spanId)}
          setTotal={setTotal}
          mode={mode}
          dataSourceMDSId={props.dataSourceMDSId[0].id}
        />
      );
    return <></>;
  }, [DSL, setCurrentSpan, spanFilters]);

  const pageToRender = (
    <>
      {activeFilters.length > 0 && (
        <EuiText textAlign="right" style={{ marginRight: 20 }} color="subdued">
          results are filtered by {activeFilters.map((filter) => filter.field).join(', ')}
        </EuiText>
      )}
      <EuiSpacer size="m" />
      {serviceIdError && (
        <>
          <EuiCallOut
            title={i18n.translate('serviceView.callout.errorTitle', {
              defaultMessage: 'Error loading service: {serviceName}',
              values: { serviceName: props.serviceName },
            })}
            color="danger"
            iconType="alert"
          >
            <p>
              {i18n.translate('serviceView.callout.errorDescription', {
                defaultMessage:
                  'The service name is invalid or could not be found. Please check the URL or try again.',
              })}
            </p>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}

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
            isServicesDataLoading={isServicesDataLoading}
            idSelected={serviceMapIdSelected}
            setIdSelected={setServiceMapIdSelected}
            currService={props.serviceName}
            page="serviceView"
            filterByCurrService={true}
            mode={mode}
            hideSearchBar={hideSearchBarCheck}
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
            dataSourceMDSLabel={props.dataSourceMDSId[0].label}
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
                dataSourceMDSLabel={props.dataSourceMDSId[0].label}
              />
            )}
          </EuiPageBody>
        </EuiPage>
      )}
    </>
  );
}
