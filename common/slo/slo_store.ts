/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * In-memory implementation of ISloStore. Used as the bootstrap store until the
 * saved-objects repository is available (in CoreStart); see
 * server/services/slo/slo_saved_object_store.ts for the persistent backend.
 */

import type {
  ISloStore,
  SloDocument,
  SloHealthState,
  SloPaginateOpts,
  SloPaginateResult,
} from './slo_types';

export class InMemorySloStore implements ISloStore {
  private docs = new Map<string, SloDocument>();
  private cachedStates = new Map<string, SloHealthState>();

  async get(id: string): Promise<SloDocument | null> {
    return this.docs.get(id) ?? null;
  }

  async list(datasourceIds?: string[]): Promise<SloDocument[]> {
    const all = Array.from(this.docs.values());
    if (!datasourceIds || datasourceIds.length === 0) return all;
    const set = new Set(datasourceIds);
    return all.filter((d) => set.has(d.spec.datasourceId));
  }

  async save(doc: SloDocument): Promise<void> {
    this.docs.set(doc.id, doc);
  }

  async updateCachedState(id: string, state: SloHealthState): Promise<void> {
    if (this.docs.has(id)) {
      this.cachedStates.set(id, state);
    }
  }

  async paginate(opts: SloPaginateOpts): Promise<SloPaginateResult> {
    const f = opts.filters ?? {};
    let filtered = Array.from(this.docs.values()).filter((d) => {
      if (f.datasourceId && f.datasourceId.length && !f.datasourceId.includes(d.spec.datasourceId))
        return false;
      if (f.state && f.state.length) {
        const cached = this.cachedStates.get(d.id);
        if (!cached || !f.state.includes(cached)) return false;
      }
      if (f.service && f.service.length && !f.service.includes(d.spec.service)) return false;
      if (f.team && f.team.length && !d.spec.owner.teams.some((t) => f.team!.includes(t)))
        return false;
      if (f.tier && f.tier.length && !(d.spec.tier && f.tier.includes(d.spec.tier))) return false;
      if (
        f.canonicalKind &&
        f.canonicalKind.length &&
        !(d.spec.canonicalKind && f.canonicalKind.includes(d.spec.canonicalKind))
      )
        return false;
      if (f.enabled !== undefined && d.spec.enabled !== f.enabled) return false;
      if (f.mode && f.mode.length && !f.mode.includes(d.spec.mode)) return false;
      if (f.sliBackend && f.sliBackend.length) {
        if (d.spec.sli.type !== 'single' || !f.sliBackend.includes(d.spec.sli.definition.backend))
          return false;
      }
      if (f.sliLeafType && f.sliLeafType.length) {
        if (d.spec.sli.type !== 'single' || !f.sliLeafType.includes(d.spec.sli.definition.type))
          return false;
      }
      if (opts.search) {
        const q = opts.search.toLowerCase();
        const match =
          d.spec.name.toLowerCase().includes(q) ||
          d.spec.service.toLowerCase().includes(q) ||
          (d.spec.description?.toLowerCase().includes(q) ?? false);
        if (!match) return false;
      }
      return true;
    });
    if (opts.sortField === 'name') {
      filtered = [...filtered].sort((a, b) => a.spec.name.localeCompare(b.spec.name));
      if (opts.sortOrder === 'desc') filtered.reverse();
    }
    const total = filtered.length;
    const start = (opts.page - 1) * opts.perPage;
    const slice = filtered.slice(start, start + opts.perPage);
    return {
      docs: slice,
      cachedStates: slice.map((d) => this.cachedStates.get(d.id) ?? null),
      total,
    };
  }

  async delete(id: string): Promise<boolean> {
    this.cachedStates.delete(id);
    return this.docs.delete(id);
  }
}
