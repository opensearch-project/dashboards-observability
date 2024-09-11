/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButtonGroup,
  EuiCompressedFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiPanel,
  EuiSpacer,
  EuiSuperSelect,
  EuiSuperSelectOption,
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
  const [invalid, setInvalid] = useState(false);
  const [network, setNetwork] = useState(null);
  const [ticks, setTicks] = useState<number[]>([]);
  const [items, setItems] = useState<any>({});
  const [query, setQuery] = useState('');
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

  const options = {
    layout: {
      // hierarchical: true,
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
    },
    manipulation: {
      enabled: false,
    },
    height: '434px',
    width: '100%',
    autoResize: true,
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
      setInvalid(false);
    } else if (serviceMap[service]) {
      if (!networkInstance) networkInstance = network;
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
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={7}>
            <EuiCompressedFieldSearch
              prepend="Focus on"
              placeholder="Service name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onSearch={(service) => onFocus(service)}
              isInvalid={query.length > 0 && invalid}
            />
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
                    graph={items.graph}
                    options={options}
                    events={events}
                    getNetwork={(networkInstance: any) => {
                      setNetwork(networkInstance);
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
