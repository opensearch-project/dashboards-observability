/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Saved-object-backed ISloStore. Persists full SloDocument ({ id, spec, status })
 * plus a set of top-level projection scalars so the listing page can filter at
 * the index level without traversing the opaque `spec` JSON.
 *
 * See docs/design/slo-sli-design.md §4 for the mapping.
 */

import type { SavedObjectsClientContract } from '../../../../../src/core/server';
import type { ISloStore, SloDocument } from '../../../common/slo/slo_types';

const SO_TYPE = 'slo-definition';

interface SavedObjectEnvelope {
  id: string;
  attributes: Record<string, unknown>;
}

function isSavedObjectNotFound(err: unknown): boolean {
  const e = err as { output?: { statusCode?: number }; statusCode?: number } | undefined;
  return e?.output?.statusCode === 404 || e?.statusCode === 404;
}

/**
 * Derive the index-level projections from the document.
 *
 * All projections are stored under top-level non-dotted keys. The opaque `spec`
 * and `status` sub-objects are disabled in the mapping (`enabled: false`), so
 * dotted keys like `spec.name` are interpreted as paths *into* `spec` and
 * rejected by OpenSearch. The store duplicates values out of `spec`/`status`
 * so that listing filters can work at the index level.
 */
function projectAttributes(doc: SloDocument): Record<string, unknown> {
  const worstTarget =
    doc.spec.objectives.length > 0
      ? doc.spec.objectives.reduce((acc, o) => Math.max(acc, o.target), 0)
      : 0;
  const single = doc.spec.sli.type === 'single' ? doc.spec.sli : null;
  const sliBackend = single?.definition.backend;
  const sliLeafType = single?.definition.type;
  const dimensionNames = single?.dimensions.map((d) => d.name) ?? [];
  const dimensionValues = single?.dimensions.map((d) => d.value) ?? [];
  const labelKeys = Object.keys(doc.spec.labels ?? {});
  const labelValues = Object.entries(doc.spec.labels ?? {}).flatMap(([, v]) =>
    Array.isArray(v) ? v : [v]
  );
  return {
    spec: doc.spec,
    status: doc.status,
    // Flattened projections from spec
    name: doc.spec.name,
    description: doc.spec.description,
    datasourceId: doc.spec.datasourceId,
    enabled: doc.spec.enabled,
    mode: doc.spec.mode,
    service: doc.spec.service,
    ownerTeams: doc.spec.owner.teams,
    ownerPrimaryUser: doc.spec.owner.primaryUser,
    tier: doc.spec.tier,
    primaryOwnerTeam: doc.spec.owner.teams[0],
    sliNodeType: doc.spec.sli.type,
    sliBackend,
    sliLeafType,
    dimensionNames,
    dimensionValues,
    objectiveCount: doc.spec.objectives.length,
    worstTarget,
    labelKeys,
    labelValues,
    // Audit projections from status
    version: doc.status.version,
    createdAt: doc.status.createdAt,
    createdBy: doc.status.createdBy,
    updatedAt: doc.status.updatedAt,
    updatedBy: doc.status.updatedBy,
  };
}

/** Reconstruct an SloDocument from saved-object attributes. */
function fromAttributes(obj: SavedObjectEnvelope): SloDocument {
  const attrs = obj.attributes as {
    spec?: SloDocument['spec'];
    status?: SloDocument['status'];
  };
  if (!attrs.spec || !attrs.status) {
    throw new Error(`Invalid slo-definition document ${obj.id}: missing spec/status`);
  }
  return { id: obj.id, spec: attrs.spec, status: attrs.status };
}

export class SavedObjectSloStore implements ISloStore {
  constructor(private readonly client: SavedObjectsClientContract) {}

  async get(id: string): Promise<SloDocument | null> {
    try {
      const obj = await this.client.get(SO_TYPE, id);
      return fromAttributes(obj);
    } catch (err) {
      if (isSavedObjectNotFound(err)) return null;
      throw err;
    }
  }

  async list(datasourceIds?: string[]): Promise<SloDocument[]> {
    const results: SloDocument[] = [];
    let page = 1;
    const perPage = 1000;
    while (true) {
      const findOpts: {
        type: string;
        perPage: number;
        page: number;
        filter?: string;
      } = { type: SO_TYPE, perPage, page };
      if (datasourceIds && datasourceIds.length > 0) {
        const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const clauses = datasourceIds
          .map((id) => `${SO_TYPE}.attributes.datasourceId: "${esc(id)}"`)
          .join(' OR ');
        findOpts.filter = `(${clauses})`;
      }
      const response = await this.client.find(findOpts);
      for (const obj of response.saved_objects as SavedObjectEnvelope[]) {
        try {
          results.push(fromAttributes(obj));
        } catch {
          // Skip malformed docs rather than failing the whole listing.
        }
      }
      if (response.saved_objects.length === 0 || results.length >= response.total) break;
      page++;
    }
    return results;
  }

  async save(doc: SloDocument): Promise<void> {
    await this.client.create(SO_TYPE, projectAttributes(doc), {
      id: doc.id,
      overwrite: true,
    });
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.client.delete(SO_TYPE, id);
      return true;
    } catch (err) {
      if (isSavedObjectNotFound(err)) return false;
      throw err;
    }
  }
}
