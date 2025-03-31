/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButtonGroup,
  EuiButtonIcon,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiLoadingSpinner,
  EuiPanel,
  EuiPopover,
  EuiSelectable,
  EuiSpacer,
  EuiSuperSelect,
  EuiSuperSelectOption,
  EuiToolTip,
} from '@elastic/eui';
import React, { useEffect, useMemo, useState } from 'react';
// @ts-ignore
import Graph from 'react-graph-vis';
import {
  ServiceNodeDetails,
  TraceAnalyticsMode,
} from '../../../../../../common/types/trace_analytics';
import { FilterType } from '../filters/filters';
import {
  calculateTicks,
  getServiceMapGraph,
  NoMatchMessage,
  PanelTitle,
} from '../helper_functions';
import { ServiceDependenciesTable } from './service_dependencies_table';
import { ServiceMapNodeDetails } from './service_map_node_details';
import { ServiceMapScale } from './service_map_scale';

export interface ServiceObject {
  [key: string]: {
    average_latency: any;
    serviceName: string;
    id: number;
    traceGroups: Array<{ traceGroup: string; targetResource: string[] }>;
    targetServices: string[];
    destServices: string[];
    latency?: number;
    error_rate?: number;
    throughput?: number;
    throughputPerMinute?: number;
    relatedServices?: string[]; // services appear in the same traces this service appears
  };
}

export function ServiceMap({
  serviceMap,
  isServicesDataLoading,
  idSelected,
  setIdSelected,
  addFilter,
  currService,
  page,
  setCurrentSelectedService,
  filterByCurrService,
  includeMetricsCallback,
  mode,
  filters = [],
  setFilters,
  hideSearchBar = false,
}: {
  serviceMap: ServiceObject;
  isServicesDataLoading: boolean;
  idSelected: 'latency' | 'error_rate' | 'throughput';
  setIdSelected: (newId: 'latency' | 'error_rate' | 'throughput') => void;
  addFilter?: (filter: FilterType) => void;
  currService?: string;
  page:
    | 'app'
    | 'appCreate'
    | 'dashboard'
    | 'traces'
    | 'services'
    | 'serviceView'
    | 'detailFlyout'
    | 'traceView';
  setCurrentSelectedService?: (value: React.SetStateAction<string>) => void;
  filterByCurrService?: boolean;
  includeMetricsCallback?: () => void;
  mode?: TraceAnalyticsMode;
  filters: FilterType[];
  setFilters: (filters: FilterType[]) => void;
  hideSearchBar?: boolean;
}) {
  const [graphKey, setGraphKey] = useState(0); // adding key to allow for re-renders
  const [invalid, setInvalid] = useState(false);
  const [network, setNetwork] = useState(null);
  const [ticks, setTicks] = useState<number[]>([]);
  const [items, setItems] = useState<any>({});
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [filterChange, setIsFilterChange] = useState(false);
  const [focusedService, setFocusedService] = useState<string | null>(null);

  const toggleButtons = [
    {
      id: 'latency',
      label: 'Duration',
    },
    {
      id: 'error_rate',
      label: 'Errors',
    },
    {
      id: 'throughput',
      label: 'Request Rate',
    },
  ];

  const [selectedNodeDetails, setSelectedNodeDetails] = useState<ServiceNodeDetails | null>(null);
  const [selectableValue, setSelectableValue] = useState<Array<EuiSuperSelectOption<any>>>([]);
  const [isPopoverOpen, setPopoverOpen] = useState(false);

  // Memoize a boolean to determine if the focus bar should be disabled
  const isFocusBarDisabled = useMemo(() => {
    return filters.some(
      (filter) => filter.field === 'serviceName' && focusedService === filter.value
    );
  }, [filters, focusedService]);

  const metricOptions: Array<EuiSuperSelectOption<any>> = [
    {
      value: 'latency',
      inputDisplay: 'Duration',
    },
    {
      value: 'error_rate',
      inputDisplay: 'Errors',
    },
    {
      value: 'throughput',
      inputDisplay: 'Request Rate',
    },
  ];

  // For the traces custom page
  useEffect(() => {
    if (!selectableValue || selectableValue.length === 0) {
      // Set to the first option ("latency") and trigger the onChange function
      const defaultValue = metricOptions[0].value;
      setSelectableValue(defaultValue); // Update the state
      setIdSelected(defaultValue); // Propagate the default to parent
      if (includeMetricsCallback) {
        includeMetricsCallback();
      }
    }
  }, []);

  const removeFilter = (field: string, value: string) => {
    if (!setFilters) return;
    const updatedFilters = filters.filter(
      (filter) => !(filter.field === field && filter.value === value)
    );
    setFilters(updatedFilters);
  };

  const options = {
    layout: {
      randomSeed: 10,
      improvedLayout: false,
      clusterThreshold: 150,
      hierarchical: {
        enabled: false,
      },
    },
    physics: {
      enabled: true,
      stabilization: {
        enabled: true,
        iterations: 1000, // Increase iterations for better layout stability
        updateInterval: 25,
      },
      solver: 'forceAtlas2Based',
      forceAtlas2Based: {
        gravitationalConstant: -100, // Adjust this for node repulsion
        centralGravity: 0.005,
        springLength: 200, // Increase to make nodes further apart
        springConstant: 0.08,
      },
    },
    edges: {
      arrows: {
        to: {
          enabled: true,
        },
      },
      physics: true,
    },
    nodes: {
      shape: 'dot',
      color: '#adadad',
      font: {
        size: 17,
        color: '#387ab9',
      },
    },
    interaction: {
      hover: true,
      tooltipDelay: 30,
      selectable: true,
      zoomView: true,
      zoomSpeed: 0.5,
    },
    manipulation: {
      enabled: false,
    },
    height: '434px',
    width: '100%',
    autoResize: true,
  };

  const setZoomLimits = (networkInstance) => {
    let lastZoomLevel = 1.0;
    const initialPosition = networkInstance.getViewPosition();

    networkInstance.on('zoom', (params) => {
      const zoomLevel = params.scale;

      if (zoomLevel < 0.05 && zoomLevel < lastZoomLevel) {
        networkInstance.moveTo({ scale: 0.05, position: initialPosition });
      } else if (zoomLevel > 1.75) {
        networkInstance.moveTo({ scale: 1.75 });
      }

      lastZoomLevel = zoomLevel;
    });
  };

  const addServiceFilter = (selectedServiceName) => {
    if (!addFilter) return;

    if (selectedServiceName) {
      setFocusedService(selectedServiceName);
      addFilter({
        field: 'serviceName',
        operator: 'is',
        value: selectedServiceName,
        inverted: false,
        disabled: false,
      });
    } else {
      // Clear the filter by adding a disabled filter or an empty filter object
      setFocusedService(null);
      addFilter({
        field: 'serviceName',
        operator: 'is',
        value: '',
        inverted: false,
        disabled: true,
      });
    }
  };

  const events = {
    stabilizationProgress: () => {
      setIsLoading(true);
    },
    // Disable physics after rendering the tree
    stabilizationIterationsDone: () => {
      if (network) {
        network.setOptions({ physics: { enabled: false } });
      }
      setIsLoading(false);
    },
    select: (event) => {
      const { nodes } = event;
      if (!addFilter || !nodes) return;
      const selectedNode = items?.graph.nodes.find((node) => node.id === nodes[0]);
      if (selectedNode) {
        const details = {
          label: selectedNode.label,
          average_latency: selectedNode.average_latency || '-',
          error_rate: selectedNode.error_rate || '-',
          throughput: selectedNode.throughput || '-',
        };

        if (serviceMap[selectedNode.label]) {
          setSelectedNodeDetails(details);
        } else {
          console.warn('Selected node details are missing in the new data source.');
          setSelectedNodeDetails(null);
        }
      }
    },
    hoverNode: (_event) => {},
  };

  const onFocus = (service: string) => {
    if (!service) {
      // Clear focus if no service is provided
      if (focusedService !== null) {
        removeFilter('serviceName', focusedService);
        setItems(
          getServiceMapGraph({
            map: serviceMap,
            idSelected,
            ticks,
            filterByCurrService: false,
          })
        );
        setFocusedService(null);
        setInvalid(false);
      }
    } else if (serviceMap[service]) {
      if (focusedService !== service) {
        const filteredGraph = getServiceMapGraph({
          map: serviceMap,
          idSelected,
          ticks,
          currService: service,
          filterByCurrService: true,
        });
        setItems(filteredGraph);
        setFocusedService(service);
      }
    }
  };

  useEffect(() => {
    setSelectedNodeDetails(null);
    setQuery('');
    setItems({});
    setFocusedService(null);

    if (filterChange) {
      setIsFilterChange(false);
    }
  }, [mode, filterChange, currService]);

  useEffect(() => {
    if (selectedNodeDetails && items?.graph?.nodes) {
      const selectedNode = items.graph.nodes.find(
        (node) => node.label === selectedNodeDetails.label
      );

      if (selectedNode) {
        const details = {
          label: selectedNode.label,
          average_latency: selectedNode.average_latency || '-',
          error_rate: selectedNode.error_rate || '-',
          throughput: selectedNode.throughput || '-',
        };
        setSelectedNodeDetails(details);
      }
    }
  }, [items]);

  useEffect(() => {
    if (!serviceMap || Object.keys(serviceMap).length === 0) {
      setItems({});
      return;
    }

    const values = Object.keys(serviceMap)
      .filter((service) => serviceMap[service][idSelected])
      .map((service) => serviceMap[service][idSelected]!);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const calculatedTicks = calculateTicks(min, max);
    setTicks(calculatedTicks);
    // Adjust graph rendering logic to ensure related services are visible
    const showRelatedServices = focusedService ? true : filterByCurrService;
    setItems(
      getServiceMapGraph({
        map: serviceMap,
        idSelected,
        ticks: calculatedTicks,
        currService: focusedService ?? currService,
        filterByCurrService: showRelatedServices,
      })
    );
  }, [serviceMap, idSelected, focusedService, filterByCurrService]);

  return (
    <>
      <EuiPanel>
        {page === 'app' ? (
          <PanelTitle title="Application Composition Map" />
        ) : (
          <PanelTitle title="Service map" />
        )}
        <EuiSpacer size="m" />
        {page !== 'traces' && (
          <>
            <EuiButtonGroup
              options={toggleButtons}
              idSelected={idSelected}
              onChange={(id) => setIdSelected(id as 'latency' | 'error_rate' | 'throughput')}
              buttonSize="s"
              color="text"
              legend="Select metric for service map display"
            />
            <EuiHorizontalRule margin="m" />
          </>
        )}
        {!hideSearchBar && (
          <EuiFlexGroup>
            <EuiFlexItem grow={7}>
              <EuiPopover
                button={
                  <EuiToolTip
                    position="top"
                    content={
                      isFocusBarDisabled
                        ? 'To use the focus field, clear the service filter manually or click the refresh icon.'
                        : undefined
                    }
                  >
                    <EuiFieldSearch
                      compressed
                      prepend="Focus on"
                      placeholder={focusedService || 'Service name'}
                      value={query}
                      onClick={() => {
                        if (!isFocusBarDisabled) setPopoverOpen(!isPopoverOpen);
                      }}
                      onChange={(e) => {
                        if (!isFocusBarDisabled) {
                          const newValue = e.target.value;
                          setQuery(newValue);
                          if (newValue === '') {
                            setGraphKey((prevKey) => prevKey + 1);
                            setQuery('');
                            onFocus(focusedService || '');
                          }
                        }
                      }}
                      isInvalid={query.length > 0 && invalid}
                      append={
                        <EuiButtonIcon
                          iconType="refresh"
                          data-test-subj="serviceMapRefreshButton"
                          aria-label="Clear focus and refresh the service map"
                          size="s"
                          onClick={() => {
                            if (!isFocusBarDisabled) {
                              setGraphKey((prevKey) => prevKey + 1);
                            }
                            setQuery('');
                            onFocus('');
                          }}
                        />
                      }
                      aria-controls="service-select-dropdown"
                      disabled={isFocusBarDisabled}
                    />
                  </EuiToolTip>
                }
                isOpen={isPopoverOpen}
                closePopover={() => setPopoverOpen(false)}
                panelPaddingSize="none"
                anchorPosition="downLeft"
                repositionOnScroll
                id="service-select-dropdown"
                ownFocus={false}
              >
                <EuiSelectable
                  searchable
                  searchProps={{
                    value: query,
                    onInput: (e) => setQuery(e.target.value),
                    isClearable: true,
                    autoFocus: true,
                  }}
                  options={
                    items?.graph?.nodes
                      ?.filter((node) => node.label.toLowerCase().includes(query.toLowerCase()))
                      .map((node) => ({
                        label: node.label,
                        checked: focusedService === node.label ? 'on' : undefined,
                      })) || []
                  }
                  singleSelection={true}
                  onChange={(newOptions) => {
                    const selectedOption = newOptions.find((option) => option.checked === 'on');
                    if (selectedOption) {
                      if (selectedOption.label === focusedService) {
                        setPopoverOpen(false);
                        return;
                      }
                      setQuery('');
                      onFocus(selectedOption.label);
                      setPopoverOpen(false);
                      setGraphKey((prevKey) => prevKey + 1);
                    }
                  }}
                  listProps={{ bordered: true, style: { width: '300px' } }}
                >
                  {(list) => <div>{list}</div>}
                </EuiSelectable>
              </EuiPopover>
            </EuiFlexItem>
            {page === 'traces' && (
              <EuiFlexItem grow={3}>
                <EuiSuperSelect
                  prepend="Select metrics"
                  compressed
                  options={metricOptions}
                  valueOfSelected={selectableValue}
                  onChange={(value) => {
                    setSelectableValue(value);
                    setIdSelected(value);
                  }}
                />
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        )}
        <EuiSpacer />

        {Object.keys(serviceMap).length > 0 || isLoading || isServicesDataLoading ? (
          <EuiFlexGroup gutterSize="none" responsive={false}>
            <EuiFlexItem>
              <div style={{ position: 'relative' }}>
                {items?.graph && (
                  <Graph
                    key={graphKey}
                    graph={items.graph}
                    options={options}
                    events={events}
                    getNetwork={(networkInstance: any) => {
                      setNetwork(networkInstance);
                      setZoomLimits(networkInstance);
                      if (currService) onFocus(currService);
                    }}
                  />
                )}

                {(isLoading || isServicesDataLoading) && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'transparent',
                      zIndex: 1000,
                    }}
                  >
                    <EuiLoadingSpinner size="xl" aria-label="Service map is loading" />
                  </div>
                )}

                {selectedNodeDetails && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 20,
                      right: 20,
                      zIndex: 1000,
                    }}
                  >
                    <ServiceMapNodeDetails
                      selectedNodeDetails={selectedNodeDetails}
                      setSelectedNodeDetails={setSelectedNodeDetails}
                      addServiceFilter={addServiceFilter}
                      setCurrentSelectedService={setCurrentSelectedService}
                    />
                  </div>
                )}
              </div>
            </EuiFlexItem>

            {(page !== 'traces' || idSelected) && (
              <EuiFlexItem grow={false}>
                <ServiceMapScale idSelected={idSelected} serviceMap={serviceMap} ticks={ticks} />
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        ) : (
          <div style={{ minHeight: 434 }}>
            <NoMatchMessage size="s" mode={mode} />
          </div>
        )}
      </EuiPanel>
      <EuiSpacer size="m" />
      {filterByCurrService && items?.graph && (
        <ServiceDependenciesTable serviceMap={serviceMap} graph={items?.graph} />
      )}
    </>
  );
}
