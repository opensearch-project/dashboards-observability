# APM Application Map Implementation Plan

## Overview

Implement the APM Application Map page that visualizes service topology using the `@osd/apm-topology` library's `CelestialMap` component. The page follows established APM patterns with dual data sources (OpenSearch for topology, Prometheus for RED metrics).

## Key Scope Decisions

1. **Grouping**: Include dropdown to group services by `groupByAttributes` (e.g., `telemetry.sdk.language`). These attributes map to Prometheus labels with underscore format (e.g., `telemetry_sdk_language`). No "Manage groups" button needed.

2. **Skip for now**: Last deployments filters, SLI breach/recovery filters (no data available).

3. **Hierarchical Navigation**:
   - Initial view shows a single "Application" node (aggregated view)
   - Double-clicking the Application node drills down to show all services inside
   - Breadcrumb trail: "World" → "Application" → (services view)

4. **Service Details Panel**: Full RED metrics charts including:
   - Health donut showing fault/error/success breakdown
   - Requests & Availability chart (dual-axis)
   - Latency chart (P99, P90, P50 lines)
   - Faults (5xx) chart
   - Errors (4xx) chart

## Package Dependency

Add to `package.json`:
```json
"@osd/apm-topology": "npm:@ps48/apm-topology@^1.0.1"
```

---

## Files to Create

### 1. Types (`public/components/apm/common/types/service_map_types.ts`)

```typescript
// Node health/metrics types for CelestialMap
export interface NodeHealth {
  breached: number;
  recovered: number;
  total: number;
  status: 'ok' | 'warning' | 'critical' | 'unknown';
}

export interface NodeMetrics {
  requests: number;
  faults5xx: number;
  errors4xx: number;
}

// CelestialMap node/edge types
export interface CelestialMapNode { /* ... */ }
export interface CelestialMapEdge { /* ... */ }

// Filter state (reuse existing ErrorRateThreshold enum from constants.ts)
export interface ApplicationMapFilters {
  errorRateThresholds: ErrorRateThreshold[]; // LOW (<1%), MEDIUM (1-5%), HIGH (>5%)
  platforms: string[];                        // EC2, ECS, EKS, Lambda, Generic
  searchQuery: string;
  groupBy: string | null;                     // e.g., "telemetry.sdk.language" or null
}
```

### 2. Service Map Hook (`public/components/apm/shared/hooks/use_service_map.ts`)

Fetches topology data using existing `PPLSearchService.getServiceMap()`:
- Uses `useApmConfig()` to get serviceMapDataset
- Calls `getQueryGetServiceMap()` PPL query
- Uses existing `transformGetServiceMapResponse()`
- Returns `{ nodes, edges, isLoading, error, availableGroupByAttributes, refetch }`

### 3. Service Map Metrics Hook (`public/components/apm/shared/hooks/use_service_map_metrics.ts`)

Batch fetches RED metrics for all nodes (follows `useServicesRedMetrics` pattern):
- Takes array of `{ serviceName, environment }` from topology nodes (both required for unique identification)
- Uses `PromQLSearchService` with filters: `service`, `environment`, `namespace="span_derived"`
- Batch queries using regex: `service=~"svc1|svc2"` (note: may need separate queries per environment if environments differ)
- Returns `{ metricsMap: Map<nodeId, metrics>, isLoading, error, refetch }`

**Key:** Use `nodeId` (which includes both service and environment) as the map key instead of just `serviceName`.

### 4. Page Components (`public/components/apm/pages/application_map/`)

| File | Purpose |
|------|---------|
| `index.ts` | Barrel export |
| `application_map_page.tsx` | Main page component |
| `application_map_i18n.ts` | i18n translations |
| `application_map.scss` | Page-specific styles |
| `components/service_map_graph.tsx` | CelestialMap wrapper with transform logic |
| `components/service_map_sidebar.tsx` | Group by dropdown + filter sidebar |
| `components/service_details_panel.tsx` | Right panel with health donut + metric charts |
| `components/health_donut.tsx` | Donut chart for fault/error/success breakdown |
| `components/metric_line_chart.tsx` | Reusable line chart for metrics (can reuse PromQLLineChart)

### 5. Hook Tests

- `use_service_map.test.ts`
- `use_service_map_metrics.test.ts`

---

## Files to Modify

### 1. `public/components/apm/application_map.tsx`
Replace placeholder with import of new `ApplicationMapPage` component.

### 2. `public/components/apm/shared/utils/navigation_utils.ts`
Implement `navigateToServiceMap()` function (currently a TODO placeholder).

### 3. `public/components/apm/common/constants.ts`
Add Application Map constants for health thresholds, platform filters, etc.

### 4. `package.json`
Add `@osd/apm-topology` dependency as aliased package.

---

## Component Architecture

```
ApplicationMapPage
├── ApmPageHeader (time range picker, search, refresh)
├── ActiveFilterBadges (displays active filters)
├── EuiResizableContainer
│   ├── ServiceMapSidebar (15% width, collapsible)
│   │   ├── Group By Dropdown (options from availableGroupByAttributes)
│   │   │   └── Options: "No grouping", "telemetry.sdk.language", etc.
│   │   ├── Error/Fault Rate Filter (using existing ErrorRateThreshold enum)
│   │   │   ├── < 1% (LOW)
│   │   │   ├── 1-5% (MEDIUM)
│   │   │   └── > 5% (HIGH)
│   │   └── Platform Filter (checkboxes: EC2, ECS, EKS, Lambda, Generic)
│   └── Main Content (85% width)
│       ├── ServiceMapGraph
│       │   ├── BreadcrumbTrail ("World > service-name")
│       │   ├── CelestialMap (from @osd/apm-topology)
│       │   └── GraphControls (zoom +/-, fit to screen)
│       └── ServiceDetailsPanel (right flyout, when node selected)
│           ├── Header: Health donut + Service name + Platform + "View more details"
│           ├── Health Section (collapsible accordion)
│           │   └── Error %, Fault % badges
│           └── Metrics Section (collapsible accordion)
│               ├── Requests & Availability chart (dual-axis line chart)
│               ├── Latency chart (P99, P90, P50 lines)
│               ├── Faults (5xx) chart
│               └── Errors (4xx) chart
└── ServiceCorrelationsFlyout (optional, for spans/logs correlation)
```

---

## Data Flow

```
1. Page Mount
   ├── useApmConfig() → Get serviceMapDataset, prometheusDataSource
   ├── Initialize state (timeRange, filters, selectedNode, navigationLevel)
   └── navigationLevel starts at 'application' (collapsed view)

2. Fetch Topology (useServiceMap hook)
   ├── PPLSearchService.getServiceMap(queryIndex, startTime, endTime, dataset)
   ├── Uses existing getQueryGetServiceMap() query for ServiceConnection events
   └── Returns { Nodes[], Edges[], AvailableGroupByAttributes }

3. Fetch Metrics (useServiceMapMetrics hook)
   ├── Extract { serviceName, environment } from topology nodes
   ├── PromQL queries for latency, throughput, failure rate
   └── Returns Map<nodeId, { latency, throughput, failureRatio }>

4. Transform for CelestialMap (depends on navigationLevel)

   If navigationLevel === 'application':
   ├── Create single Application group node (isGroup: true)
   ├── Aggregate metrics from all services
   └── No edges shown at this level

   If navigationLevel === 'services':
   ├── Convert all PPL nodes to CelestialMapNode format
   ├── Merge metrics from metricsMap
   └── Show all edges between services

5. Navigation Interactions
   ├── Double-click Application node → Set navigationLevel to 'services'
   ├── Click breadcrumb "World" → Set navigationLevel to 'application'
   └── Breadcrumb trail updates: "World" > "Application" > (services)

6. Client-Side Filtering (applies to services view)
   ├── Filter nodes by error rate threshold
   ├── Filter nodes by platform
   ├── Filter nodes by search query
   └── Remove orphaned edges

7. Render CelestialMap
   ├── <CelestialMap map={{ root: { nodes, edges } }} ... />
   ├── onNodeDoubleClick → Drill down to services
   ├── onDashboardClick → Show ServiceDetailsPanel
   └── onEdgeClick → Optional edge details
```

---

## Key Implementation Details

### Hierarchical Navigation State

```typescript
// Navigation level type
type NavigationLevel = 'application' | 'services';

// State for hierarchical view
interface MapNavigationState {
  level: NavigationLevel;
  breadcrumbs: Array<{ id: string; label: string }>;
}

// Initial state
const initialNavigationState: MapNavigationState = {
  level: 'application',
  breadcrumbs: [{ id: 'world', label: 'World' }],
};
```

**Application Node (Aggregated View):**
When `level === 'application'`, create a single aggregated node:

```typescript
const applicationNode: CelestialMapNode = {
  id: 'application-root',
  type: 'celestialNode',
  position: { x: 0, y: 0 },
  data: {
    id: 'application-root',
    title: 'Application',  // Or use a configured application name
    subtitle: `${serviceCount} services`,
    icon: getIcon('Application'),  // Use a generic application icon
    isGroup: true,
    keyAttributes: {},
    isInstrumented: true,
    health: aggregateHealth(allNodes),  // Aggregate health from all services
    metrics: {
      requests: sumRequests(allNodes),
      faults5xx: sumFaults(allNodes),
      errors4xx: sumErrors(allNodes),
    },
  },
};
```

**Double-Click Handler:**
```typescript
onNodeDoubleClick: (node) => {
  if (node.data.isGroup && navigationState.level === 'application') {
    setNavigationState({
      level: 'services',
      breadcrumbs: [
        { id: 'world', label: 'World' },
        { id: 'application', label: 'Application' },
      ],
    });
  }
};
```

### Prometheus RED Metrics Labels

Prometheus metrics include service name, environment, and groupByAttributes as labels:

```
request{
  service="shipping",                    # Service name
  environment="generic:default",         # Service environment
  namespace="span_derived",              # Fixed namespace
  operation="/get-quote",                # Operation name
  remoteService="quote",                 # Downstream dependency
  remoteEnvironment="generic:default",   # Dependency environment
  telemetry_sdk_language="rust"          # GroupByAttribute (underscore format)
}
```

**Key Labels for Querying:**
- `service` - Must match node.KeyAttributes.Name
- `environment` - Must match node.KeyAttributes.Environment
- `namespace="span_derived"` - Fixed for all RED metrics

**PromQL Query Pattern for Node Metrics:**
```promql
# Requests for a specific service+environment
request{service="shipping", environment="generic:default", namespace="span_derived"}

# Batch query for multiple services
request{service=~"shipping|frontend|checkout", namespace="span_derived"}
```

### GroupBy Attribute Mapping

GroupByAttributes in OpenSearch service topology use nested dot notation, while Prometheus uses underscore format:

| OpenSearch (nested) | Prometheus Label |
|---------------------|------------------|
| `telemetry.sdk.language` | `telemetry_sdk_language` |
| `k8s.namespace` | `k8s_namespace` |
| `aws.region` | `aws_region` |

```typescript
// Convert OpenSearch path to Prometheus label
function toPrometheusLabel(path: string): string {
  return path.replace(/\./g, '_');
}

// Get available groupBy options from service map response
const groupByOptions = Object.keys(serviceMapResponse.AvailableGroupByAttributes);
// Example: ["telemetry.sdk.language", "k8s.namespace"]
```

When groupBy is selected:
1. Group nodes by their `GroupByAttributes[groupByPath]` value
2. Create group nodes in CelestialMap (isGroup: true)
3. Nest service nodes under their respective group

### CelestialMap Usage (from example)

The CelestialMap component from `@osd/apm-topology` requires:

```typescript
import { CelestialMap, getIcon } from '@osd/apm-topology';
import type { CelestialMapProps, CelestialEdge, CelestialCardProps } from '@osd/apm-topology';

// Component structure
const mapData: CelestialMapProps = {
  map: {
    root: {
      nodes: [
        {
          id: 'unique-id',
          type: 'celestialNode',
          position: { x: 100, y: 100 }, // dagre auto-calculates
          data: {
            id: 'unique-id',
            title: 'Service Name',
            subtitle: 'AWS::Lambda',
            icon: getIcon('AWS::Lambda'),
            isGroup: false,
            keyAttributes: {},
            isInstrumented: true,
            health: {
              breached: 0,      // SLI breaches
              recovered: 0,     // Recovered SLIs
              total: 0,         // Total SLIs
              status: 'ok',     // 'ok' | 'recovered' | 'breached'
            },
            metrics: {
              requests: 5000,
              faults5xx: 25,
              errors4xx: 100,
            },
          },
        },
      ],
      edges: [
        { id: 'edge-1', source: 'node-1', target: 'node-2' },
      ],
    },
  },
  onDashboardClick: (node: CelestialCardProps) => {
    // Called when "View insights" is clicked on a node
  },
  onEdgeClick: (edge: CelestialEdge) => {
    // Called when an edge is clicked
  },
  onDataFetch: (node: CelestialCardProps) => {
    // Called to fetch additional data for a node
  },
};

// Render
<div style={{ width: '100%', height: '600px' }}>
  <CelestialMap {...mapData} />
</div>
```

**Health Status Visual Indicators:**
- `ok`: Blue circle border (healthy)
- `recovered`: Yellow circle border (recovered from SLI breach)
- `breached`: Red circle border (SLI breach active)

**Available Platform Icons via `getIcon()`:**
- `AWS::Lambda`, `AWS::DynamoDB`, `AWS::RDS`, `AWS::APIGateway`, `AWS::S3`
- `AWS::SQS`, `AWS::SNS`, `AWS::EKS`, `AWS::ECS`, `AWS::EC2`
- `Generic` (default)

### Transform PPL Response to CelestialMap Format

```typescript
function transformToCelestialFormat(
  serviceMapResponse: ServiceMapResponse,
  metricsMap: Map<string, ServiceRedMetrics>
): { nodes: CelestialMapNode[]; edges: CelestialMapEdge[] } {
  const celestialNodes = serviceMapResponse.Nodes.map(node => {
    const serviceName = node.KeyAttributes.Name;
    const metrics = metricsMap.get(serviceName);
    const platformType = getPlatformFromAttributeMaps(node.AttributeMaps);

    return {
      id: node.NodeId,
      type: 'celestialNode' as const,
      position: { x: 0, y: 0 }, // dagre layout calculates positions
      data: {
        id: node.NodeId,
        title: node.Name,
        subtitle: platformType, // e.g., "AWS::EKS", "Generic"
        icon: getIcon(platformType),
        isGroup: false,
        keyAttributes: node.KeyAttributes,
        isInstrumented: true,
        health: calculateHealth(metrics),
        metrics: {
          requests: Math.round(metrics?.avgThroughput || 0),
          faults5xx: Math.round((metrics?.avgFailureRatio || 0) * metrics?.avgThroughput / 100),
          errors4xx: 0, // Calculate from error rate if available
        },
      },
    };
  });

  const celestialEdges = serviceMapResponse.Edges.map(edge => ({
    id: edge.EdgeId,
    source: edge.SourceNodeId,
    target: edge.DestinationNodeId,
  }));

  return { nodes: celestialNodes, edges: celestialEdges };
}
```

### Filter Implementation (Client-Side)

```typescript
import { ErrorRateThreshold, THRESHOLD_LABELS } from '../../common/constants';

// Helper to determine which threshold bucket a failure rate falls into
function getErrorRateThreshold(failureRate: number): ErrorRateThreshold {
  if (failureRate < 1) return ErrorRateThreshold.LOW;
  if (failureRate <= 5) return ErrorRateThreshold.MEDIUM;
  return ErrorRateThreshold.HIGH;
}

const filteredData = useMemo(() => {
  let filteredNodes = [...nodes];

  // Error/Fault rate threshold filter (using existing ErrorRateThreshold enum)
  if (filters.errorRateThresholds.length > 0) {
    filteredNodes = filteredNodes.filter(node => {
      const metrics = node.data.metrics;
      const failureRate = metrics.requests > 0
        ? ((metrics.faults5xx + metrics.errors4xx) / metrics.requests) * 100
        : 0;
      const threshold = getErrorRateThreshold(failureRate);
      return filters.errorRateThresholds.includes(threshold);
    });
  }

  // Platform filter
  if (filters.platforms.length > 0) {
    filteredNodes = filteredNodes.filter(node => {
      const platform = extractPlatform(node.data.subtitle);
      return filters.platforms.includes(platform);
    });
  }

  // Search filter
  if (filters.searchQuery) {
    const query = filters.searchQuery.toLowerCase();
    filteredNodes = filteredNodes.filter(node =>
      node.data.title.toLowerCase().includes(query)
    );
  }

  // Remove orphaned edges
  const nodeIds = new Set(filteredNodes.map(n => n.id));
  const filteredEdges = edges.filter(e =>
    nodeIds.has(e.source) && nodeIds.has(e.target)
  );

  return { nodes: filteredNodes, edges: filteredEdges };
}, [nodes, edges, filters]);
```

---

## Implementation Order

### Phase 1: Foundation (No UI)
1. Add `@osd/apm-topology` dependency to `package.json`
2. Create `service_map_types.ts` - Type definitions
3. Create `use_service_map.ts` - Topology data hook
4. Create `use_service_map_metrics.ts` - Metrics hook (extended version with time-series data for charts)
5. Write hook unit tests

### Phase 2: Supporting Updates
6. Add Application Map constants to `constants.ts`
7. Create `application_map_i18n.ts`
8. Implement `navigateToServiceMap()` in `navigation_utils.ts`

### Phase 3: Components (Bottom-Up)
9. Create `HealthDonut` component (reuse existing chart patterns or ECharts)
10. Create `ServiceDetailsPanel` component with accordions and metric line charts
    - Reuse existing `PromQLLineChart` component for Requests/Latency/Faults/Errors charts
11. Create `ServiceMapSidebar` component with Group By dropdown and filters
12. Create `ServiceMapGraph` component (CelestialMap wrapper with transform logic)

### Phase 4: Main Page
13. Create `ApplicationMapPage` component wiring all pieces
14. Update `application_map.tsx` to use new page
15. Create `application_map.scss` styles

### Phase 5: Testing & Polish
16. Write component tests
17. Manual integration testing
18. Verify navigation flows (node click → service details page)

---

## Service Details Panel Charts

When a node is selected, the panel shows full time-series charts. Reuse existing `PromQLLineChart` or create similar component.

### Chart Specifications

All PromQL queries must filter by both `service` AND `environment` to uniquely identify a service:

| Chart | Data | PromQL Query Pattern |
|-------|------|---------------------|
| **Requests & Availability** | Dual-axis: requests count (left), availability % (right) | `request{service="X",environment="Y",namespace="span_derived"}` and `(request - error - fault) / request * 100` |
| **Latency** | P99, P90, P50 lines | `histogram_quantile(0.99/0.90/0.50, sum by (le) (latency_seconds_seconds_bucket{service="X",environment="Y",namespace="span_derived"})) * 1000` |
| **Faults (5xx)** | Count over time | `fault{service="X",environment="Y",namespace="span_derived"}` |
| **Errors (4xx)** | Count over time | `error{service="X",environment="Y",namespace="span_derived"}` |

**Note:** When fetching metrics for the service map nodes, we need both `serviceName` and `environment` from `node.KeyAttributes`.

### Hook Enhancement

The `useServiceMapMetrics` hook needs to return time-series data (not just averages) for the selected node's charts:

```typescript
interface ServiceDetailMetrics {
  // Time-series for charts
  requestsTimeSeries: MetricDataPoint[];
  availabilityTimeSeries: MetricDataPoint[];
  latencyP99TimeSeries: MetricDataPoint[];
  latencyP90TimeSeries: MetricDataPoint[];
  latencyP50TimeSeries: MetricDataPoint[];
  faultsTimeSeries: MetricDataPoint[];
  errorsTimeSeries: MetricDataPoint[];
  // Averages for badges/summaries
  avgRequests: number;
  avgLatencyP99: number;
  faultRate: number;
  errorRate: number;
}
```

---

## Testing Strategy

### Unit Tests
- `use_service_map.test.ts`: Mock PPLSearchService, verify data transformation
- `use_service_map_metrics.test.ts`: Mock PromQLSearchService, verify metrics extraction
- Component tests for filter sidebar and details panel

### Manual Testing Checklist

**Hierarchical Navigation:**
- [ ] Page initially shows single "Application" node with aggregated metrics
- [ ] Application node shows total request count, aggregated health
- [ ] Double-clicking Application node drills down to services view
- [ ] Breadcrumb shows "World > Application" in services view
- [ ] Clicking "World" in breadcrumb returns to application view

**Services View:**
- [ ] All service nodes display with names and health indicators
- [ ] Edges connect services correctly showing topology
- [ ] Clicking node "View insights" shows details panel with charts
- [ ] Error rate threshold filters work (< 1%, 1-5%, > 5%)
- [ ] Platform filters work (EC2, ECS, EKS, Lambda, Generic)
- [ ] Group By dropdown populated from availableGroupByAttributes
- [ ] Selecting Group By groups nodes by that attribute
- [ ] Search filters work
- [ ] Time range changes refetch data

**Service Details Panel:**
- [ ] Panel shows: health donut, error %, fault % badges
- [ ] Requests & Availability chart displays correctly
- [ ] Latency chart shows P99/P90/P50 lines
- [ ] Faults 5xx chart displays correctly
- [ ] Errors 4xx chart displays correctly
- [ ] "View more details" navigates to service details page

**General:**
- [ ] Refresh button refetches data
- [ ] Empty state shown when no data
- [ ] Loading states display during data fetch

---

## Critical Files Reference

| File | Use For |
|------|---------|
| `pages/services_home/services_home.tsx` | Page structure pattern |
| `shared/hooks/use_services.ts` | PPL fetch hook pattern |
| `shared/hooks/use_services_red_metrics.ts` | PromQL metrics hook pattern |
| `query_services/query_requests/ppl_queries.ts` | `getQueryGetServiceMap()` |
| `query_services/query_requests/response_processor.ts` | `transformGetServiceMapResponse()` |
| `/Users/sgguruda/work/opensource/repos/apm-topology/CLAUDE.md` | CelestialMap usage guide |

---

## Implementation Status

- [x] Phase 1: Foundation (types, hooks)
- [x] Phase 2: Supporting updates (constants, i18n, navigation)
- [x] Phase 3: Components (HealthDonut, ServiceDetailsPanel, Sidebar, Graph)
- [x] Phase 4: Main page integration
- [x] Phase 5: Hook tests
