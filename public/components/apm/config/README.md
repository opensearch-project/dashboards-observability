# APM Configuration

This directory contains the APM configuration system, which manages the connection between APM pages and their data sources (traces dataset, service map dataset, and Prometheus metrics).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        ApmConfigProvider                         │
│  (Wraps APM pages - Services, Application Map)                  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    useApmConfig()                        │    │
│  │  Returns: { config, loading, error, refresh }           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              OSDSavedApmConfigClient                     │    │
│  │  - Singleton pattern                                     │    │
│  │  - CRUD operations for APM config                        │    │
│  │  - Resolves references to get dataset/datasource info   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Correlations Saved Object                   │    │
│  │  Type: 'correlations'                                    │    │
│  │  correlationType: 'APM-Config-{workspaceId}'            │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `apm_config_context.tsx` | React context provider that fetches and caches APM config |
| `apm_settings_modal.tsx` | Modal UI for configuring APM data sources |
| `hooks.ts` | Data fetching hooks for datasets and Prometheus sources |
| `apm-architecture-svg.tsx` | SVG diagram shown in the settings modal |

## Saved Object Structure

APM configuration is stored using the `correlations` saved object type with a special `correlationType` prefix:

```typescript
{
  type: 'correlations',
  attributes: {
    correlationType: 'APM-Config-{workspaceId}',  // Identifies this as APM config
    version: '1.0.0',
    entities: [
      { tracesDataset: { id: 'references[0].id' } },
      { serviceMapDataset: { id: 'references[1].id' } },
      { prometheusDataSource: { id: 'references[2].id' } }
    ]
  },
  references: [
    { name: 'entities[0].index', type: 'index-pattern', id: '<traces-dataset-id>' },
    { name: 'entities[1].index', type: 'index-pattern', id: '<service-map-dataset-id>' },
    { name: 'entities[2].dataConnection', type: 'data-connection', id: '<prometheus-id>' }
  ]
}
```

### Entity-to-Reference Resolution

The `entities` array uses pointer syntax (`references[N].id`) to link to the actual `references` array. This allows:
- Flexible ordering of entities
- Type-safe reference resolution regardless of array position
- Compatibility with the correlations saved object pattern

## Context Provider Usage

The `ApmConfigProvider` wraps APM pages to provide config state:

```tsx
// In app.tsx
const ApmServicesWithProvider = (props) => (
  <ApmConfigProvider dataService={props.DepsStart?.data}>
    <ApmServices {...props} />
  </ApmConfigProvider>
);
```

Components access config via the `useApmConfig` hook:

```tsx
// In any APM component
const { config, loading, error, refresh } = useApmConfig();

if (loading) return <LoadingSpinner />;
if (!config) return <ApmEmptyState onGetStartedClick={openModal} />;

// Use config.tracesDataset, config.serviceMapDataset, config.prometheusDataSource
```

## OSDSavedApmConfigClient

Singleton client for APM config CRUD operations:

```typescript
const client = OSDSavedApmConfigClient.getInstance();

// Create new config
await client.create({
  workspaceId: 'workspace-123',
  tracesDatasetId: 'traces-dataset-id',
  serviceMapDatasetId: 'service-map-id',
  prometheusDataSourceId: 'prometheus-id'
});

// Fetch with resolved references (includes dataset titles, names)
const { configs } = await client.getBulkWithResolvedReferences(dataService);

// Update existing config
await client.update({
  objectId: 'correlations:uuid',
  tracesDatasetId: 'new-traces-id'
});

// Delete config
await client.delete({ objectId: 'correlations:uuid' });
```

## Resolved Config Shape

When fetched via `getBulkWithResolvedReferences`, the config includes resolved dataset information:

```typescript
interface ResolvedApmConfig {
  objectId: string;
  correlationType: string;
  version: string;
  tracesDataset: {
    id: string;
    title: string;
    name?: string;        // Display name from DataView
    datasourceId?: string; // MDS data source reference
  } | null;
  serviceMapDataset: {
    id: string;
    title: string;
    name?: string;
    datasourceId?: string;
  } | null;
  prometheusDataSource: {
    id: string;
    title: string;
    meta?: Record<string, unknown>; // Metadata from data-connection (e.g., prometheusUrl)
  } | null;
}
```

## Settings Modal Flow

1. User clicks "APM Settings" button in header
2. Modal opens with `ApmSettingsModal` component
3. Modal uses `useApmConfig()` to get existing config (if any)
4. User selects datasets from dropdowns (populated by `useDatasets` and `usePrometheusDataSources` hooks)
5. On "Apply", modal calls `OSDSavedApmConfigClient.create()` or updates existing
6. Modal closes with `onClose(true)` to trigger parent refresh
7. Parent component calls `refresh()` from context to reload config

## Workspace Scoping

Each APM config is scoped to a workspace via the `correlationType` field:
- Format: `APM-Config-{workspaceId}`
- Only one config per workspace
- Config is automatically filtered by workspace when fetched
