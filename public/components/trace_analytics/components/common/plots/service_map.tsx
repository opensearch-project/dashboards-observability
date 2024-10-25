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
}) {
  const [graphKey, setGraphKey] = useState(0); // adding key to allow for re-renders
  const [invalid, setInvalid] = useState(false);
  const [network, setNetwork] = useState(null);
  const [ticks, setTicks] = useState<number[]>([]);
  const [items, setItems] = useState<any>({});
  const [query, setQuery] = useState('');
  const [selectableOptions, setSelectableOptions] = useState<EuiSelectableOption[]>([]);

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
    }
  }, [items.graph, serviceMap]);

  const options = {
    layout: {
      hierarchical: {
        enabled: true,
        direction: 'UD', // UD, DU, LR, RL
        sortMethod: 'directed', // hubsize, directed
        shakeTowards: 'leaves', // roots, leaves
      },
    },
    edges: {
      arrows: {
        to: {
          enabled: true,
        },
      },
      physics: false,
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

      if (zoomLevel < 0.25 && zoomLevel < lastZoomLevel) {
        networkInstance.moveTo({ scale: 0.25, position: initialPosition });
      } else if (zoomLevel > 1.75) {
        networkInstance.moveTo({ scale: 1.75 });
      }

      lastZoomLevel = zoomLevel;
    });
  };

  const addServiceFilter = (selectedServiceName: string) => {
    if (!addFilter) return;
    addFilter({
      field: 'serviceName',
      operator: 'is',
      value: selectedServiceName,
      inverted: false,
      disabled: false,
    });
    if (!['appCreate', 'detailFlyout'].includes(page)) {
      window.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
    }
  };

  const events = {
    select: (event) => {
      const { nodes } = event;
      if (!addFilter || !nodes) return;
      const selectedNode = items?.graph.nodes.find((node) => node.id === nodes[0]);
      if (selectedNode) {
        const details = {
          label: selectedNode.label,
          average_latency: selectedNode.average_latency,
          error_rate: selectedNode.error_rate,
          throughput: selectedNode.throughput,
        };

        // On traces page with custom sources
        // When user clicks on empty graph, load metrics
        if (selectableValue.length === 0) {
          onChangeSelectable('latency');
        }
        // Update the state to display node details
        setSelectedNodeDetails(details);
      }
    },
    hoverNode: (_event) => {},
  };

  const onFocus = (service: string, networkInstance?: any) => {
    if (service.length === 0) {
      // Reset all nodes to the default size when no service is selected
      const resetNodes = items.graph.nodes.map((node) => ({ ...node, size: 15 }));
      setItems({
        ...items,
        graph: { ...items.graph, nodes: resetNodes },
      });
      if (networkInstance) networkInstance.fit(); // Adjust the view if needed
      setInvalid(false);
    } else if (serviceMap[service]) {
      if (!networkInstance) networkInstance = network;

      // Enlarge the focused node and reset others
      const updatedNodes = items.graph.nodes.map((node) =>
        node.label === service ? { ...node, size: 30 } : { ...node, size: 15 }
      );

      setItems({
        ...items,
        graph: { ...items.graph, nodes: updatedNodes },
      });

      networkInstance.focus(serviceMap[service].id, { animation: true });
      setInvalid(false);
    } else {
      setInvalid(true);
    }
  };

  useEffect(() => {
    if (selectedNodeDetails) {
      const selectedNode = items?.graph.nodes.find(
        (node) => node.label === selectedNodeDetails.label
      );
      const details = {
        label: selectedNode.label,
        average_latency: selectedNode.average_latency,
        error_rate: selectedNode.error_rate,
        throughput: selectedNode.throughput,
      };
      setSelectedNodeDetails(details);
    }
  }, [items]);

  useEffect(() => {
    if (Object.keys(serviceMap).length === 0) return;
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
            />
            <EuiHorizontalRule margin="m" />
          </>
        )}
        <EuiFlexGroup>
          <EuiFlexItem grow={7}>
            <EuiPopover
              button={
                <EuiFieldSearch
                  compressed
                  prepend="Focus on"
                  placeholder="Service name"
                  value={query}
                  onClick={() => setPopoverOpen(!isPopoverOpen)}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    setQuery(newValue);
                    if (newValue === '') {
                      onFocus(''); // Clear node focus when input is cleared
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
                    setQuery(selectedOption.label);
                    onFocus(selectedOption.label as string);
                    setPopoverOpen(false);
                    setSelectableOptions(
                      selectableOptions.map((option) => ({
                        ...option,
                        checked: undefined,
                      }))
                    );
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
