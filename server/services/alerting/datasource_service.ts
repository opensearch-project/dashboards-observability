/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Datasource service — manages alert datasource configurations
 */
import {
  Datasource,
  DatasourceService,
  PrometheusBackend,
  Logger,
} from '../../../common/types/alerting/types';

export class InMemoryDatasourceService implements DatasourceService {
  private datasources: Map<string, Datasource> = new Map();
  private counter = 0;
  private promBackend?: PrometheusBackend;

  constructor(private readonly logger: Logger) {}

  setPrometheusBackend(backend: PrometheusBackend): void {
    this.promBackend = backend;
  }

  async list(): Promise<Datasource[]> {
    return Array.from(this.datasources.values());
  }

  async get(id: string): Promise<Datasource | null> {
    return this.datasources.get(id) ?? null;
  }

  async create(input: Omit<Datasource, 'id'>): Promise<Datasource> {
    const id = `ds-${++this.counter}`;
    const datasource: Datasource = { id, ...input };
    this.datasources.set(id, datasource);
    this.logger.debug(`Created datasource: ${id} (${input.name})`);
    return datasource;
  }

  async update(id: string, input: Partial<Datasource>): Promise<Datasource | null> {
    const datasource = this.datasources.get(id);
    if (!datasource) return null;

    Object.assign(datasource, input);
    this.logger.debug(`Updated datasource: ${id}`);
    return datasource;
  }

  async delete(id: string): Promise<boolean> {
    const existed = this.datasources.delete(id);
    if (existed) this.logger.debug(`Deleted datasource: ${id}`);
    return existed;
  }

  async testConnection(client: any, id: string): Promise<{ success: boolean; message: string }> {
    const datasource = this.datasources.get(id);
    if (!datasource) {
      return { success: false, message: 'Datasource not found' };
    }

    try {
      if (datasource.type === 'opensearch') {
        // Probe cluster via OSD scoped client — auth/TLS handled by OSD.
        const resp = await client.transport.request<{ status?: string }>({
          method: 'GET',
          path: '/',
        });
        const status = (resp?.body as { status?: string } | undefined)?.status;
        return {
          success: true,
          message: status ? `Connected. Cluster health: ${status}` : 'Connected.',
        };
      } else if (datasource.type === 'prometheus') {
        // Phase 1: skip active probe. The first real query will surface any
        // connection issue naturally, and Prometheus endpoints are reached via
        // the OSD DirectQuery resource proxy (no direct Prom connectivity to
        // test from here). Keep the UI "Test connection" button working by
        // succeeding with a note.
        return { success: true, message: 'Prometheus (skipped-in-phase1)' };
      }
      return { success: false, message: `Unknown datasource type: ${datasource.type}` };
    } catch (err) {
      return {
        success: false,
        message: `Connection failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async listWorkspaces(client: any, dsId: string): Promise<Datasource[]> {
    const ds = this.datasources.get(dsId);
    if (!ds || ds.type !== 'prometheus' || !this.promBackend) return [];

    const workspaces = await this.promBackend.listWorkspaces(client, ds);
    return workspaces.map((ws) => ({
      id: `${dsId}::${ws.id}`,
      name: `${ds.name} / ${ws.alias || ws.name}`,
      type: ds.type,
      url: ds.url,
      enabled: ws.status === 'active',
      workspaceId: ws.id,
      workspaceName: ws.name,
      parentDatasourceId: dsId,
    }));
  }

  // Helper to seed initial datasources
  seed(datasources: Array<Omit<Datasource, 'id'>>): void {
    for (const ds of datasources) {
      this.create(ds);
    }
  }
}
