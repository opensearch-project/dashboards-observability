/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CustomPanelListType {
  title: string;
  id: string;
  dateCreated: number;
  dateModified: number;
  applicationId?: string;
  savedObject: boolean;
}

export interface BoxType {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface VisualizationType {
  id: string;
  savedVisualizationId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PanelType {
  title: string;
  dateCreated: number;
  dateModified: number;
  visualizations: VisualizationType[];
  timeRange: { to: string; from: string };
  queryFilter: { query: string; language: string };
  applicationId?: string;
}

export interface CustomPanelType extends PanelType {
  id: string;
}

export interface SavedVisualizationType {
  id: string;
  name: string;
  query: string;
  type: string;
  selected_date_range: { start: string; end: string; text: string };
  timeField: string;
  application_id?: string;
  user_configs: any;
}

export interface PPLResponse {
  data: any;
  metadata: any;
  size: number;
  status: number;
}

export interface VizContainerError {
  errorMessage: string;
  errorDetails?: string;
}

export interface ObservabilityPanelAttrs {
  title: string;
  description: string;
  dateCreated: number;
  dateModified: number;
  timeRange: {
    to: string;
    from: string;
  };
  queryFilter: {
    query: string;
    language: string;
  };
  visualizations: VisualizationType[];
  applicationId: string;
}
