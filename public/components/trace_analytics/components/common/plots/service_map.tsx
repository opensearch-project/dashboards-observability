/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButtonGroup,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiPanel,
  EuiSpacer,
  EuiSuperSelect,
  EuiSuperSelectOption,
  EuiSelectable,
  EuiSelectableOption,
  EuiPopover,
  EuiFieldSearch,
  EuiLoadingSpinner,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';
// @ts-ignore
import Graph from 'react-graph-vis';
import { ServiceNodeDetails } from '../../../../../../common/types/trace_analytics';
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
  idSelected,
  setIdSelected,
  addFilter,
  currService,
  page,
  setCurrentSelectedService,
  filterByCurrService,
  includeMetricsCallback,
  mode,
  hideSearchBar = false,
}: {
  serviceMap: ServiceObject;
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
  mode?: string;
  hideSearchBar?: boolean;
}) {
  const [graphKey, setGraphKey] = useState(0); // adding key to allow for re-renders
  const [invalid, setInvalid] = useState(false);
  const [network, setNetwork] = useState(null);
  const [ticks, setTicks] = useState<number[]>([]);
  const [items, setItems] = useState<any>({});
  const [query, setQuery] = useState('');
  const [selectableOptions, setSelectableOptions] = useState<EuiSelectableOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterChange, setIsFilterChange] = useState(false);
  const [focusedService, setFocusedService] = useState<string | null>(null);
  const [clearFilterRequest, setClearFilterRequest] = useState(false);

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

  const onChangeSelectable = (value: React.SetStateAction<Array<EuiSuperSelectOption<any>>>) => {
    // if the change is changing for the first time then callback servicemap with metrics
    if (selectableValue.length === 0 && value.length !== 0) {
      if (includeMetricsCallback) {
        includeMetricsCallback();
      }
    }
    setIdSelected(value);
    setSelectableValue(value);
  };

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

  const clearFilter = () => {
    setFocusedService(null);
    setClearFilterRequest(true);
  };

  useEffect(() => {
    if (clearFilterRequest && focusedService === null) {
      setClearFilterRequest(false);

      setQuery('');
      currService = '';

      if (addFilter) {
        addFilter({
          field: 'serviceName',
          operator: 'is',
          value: '',
          inverted: false,
          disabled: true, // Disable the filter to effectively clear it
        });
      }

      // Reset the graph to show the full view
      setItems(
        getServiceMapGraph(
          serviceMap,
          idSelected,
          ticks,
          undefined,
          serviceMap[currService!]?.relatedServices,
          false // Do not filter by the current service to show the entire graph
        )
      );

      setInvalid(false);
    }
  }, [focusedService, clearFilterRequest]);

  useEffect(() => {
    if (items?.graph?.nodes) {
      const visibleNodes = items.graph.nodes.map((node) => node.label);
      const options = Object.keys(serviceMap)
        .filter((key) => visibleNodes.includes(serviceMap[key].serviceName))
        .map((key) => ({
          label: serviceMap[key].serviceName,
          value: serviceMap[key].serviceName,
        }));
      setSelectableOptions(options);
    } else {
      setSelectableOptions([]); // Ensure options are empty if items.graph.nodes doesn't exist
    }
  }, [items.graph, serviceMap]);

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
    if (selectedServiceName === focusedService) return;

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
    if (service.length === 0) {
      clearFilter();
    } else if (serviceMap[service]) {
      // Focus on the specified service and add a filter
      setFocusedService(service);
      if (addFilter) {
        addFilter({
          field: 'serviceName',
          operator: 'is',
          value: service,
          inverted: false,
          disabled: false,
        });
      }

      const filteredGraph = getServiceMapGraph(
        serviceMap,
        idSelected,
        ticks,
        service,
        serviceMap[service]?.relatedServices,
        true // Enable filtering by the current service to show only connected nodes
      );
      setItems(filteredGraph);
      setInvalid(false);
    } else {
      setInvalid(true);
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
    if (currService === focusedService) {
      return;
    }

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
    setItems(
      getServiceMapGraph(
        serviceMap,
        idSelected,
        calculatedTicks,
        currService,
        serviceMap[currService!]?.relatedServices,
        filterByCurrService
      )
    );
  }, [serviceMap, idSelected]);

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
                  <EuiFieldSearch
                    compressed
                    prepend="Focus on"
                    placeholder="Service name"
                    value={focusedService || query}
                    onClick={() => setPopoverOpen(!isPopoverOpen)}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      setQuery(newValue);
                      if (newValue === '') {
                        setGraphKey((prevKey) => prevKey + 1);
                        setQuery('');
                        onFocus('');
                      }
                    }}
                    isInvalid={query.length > 0 && invalid}
                    append={
                      <EuiButtonIcon
                        iconType="refresh"
                        size="s"
                        onClick={() => {
                          setGraphKey((prevKey) => prevKey + 1);
                          setQuery('');
                          onFocus('');
                        }}
                      />
                    }
                    aria-controls="service-select-dropdown"
                  />
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
                  options={selectableOptions.filter((option) =>
                    option.label.toLowerCase().includes(query.toLowerCase())
                  )}
                  singleSelection={true}
                  onChange={(newOptions) => {
                    const selectedOption = newOptions.find((option) => option.checked === 'on');
                    if (selectedOption) {
                      if (selectedOption.label === focusedService) {
                        setPopoverOpen(false);
                        return;
                      }
                      setQuery(selectedOption.label);
                      onFocus(selectedOption.label);
                      setPopoverOpen(false);
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
                  onChange={(value) => onChangeSelectable(value)}
                />
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        )}
        <EuiSpacer />

        {Object.keys(serviceMap).length > 0 ? (
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
                      if (currService) onFocus(currService, networkInstance);
                    }}
                  />
                )}
                {isLoading && (
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
                      backgroundColor: 'rgba(255, 255, 255, 0.8)',
                      zIndex: 1000,
                    }}
                  >
                    <EuiLoadingSpinner size="xl" />
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
            <NoMatchMessage size="s" />
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
