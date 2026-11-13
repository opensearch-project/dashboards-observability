/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Encapsulates the Alerts page's datasource-selection lifecycle:
 *   1. Resolve initial selection from localStorage / admin-curated default
 *      / fallback to the first discovered datasource.
 *   2. Persist the chosen names back to localStorage on every change.
 *   3. Clamp to `maxDatasources`.
 *   4. Wrap the change callback with stable identity.
 *
 * The priority order is unchanged from the inline implementation in
 * `alarms_page.tsx` — extracting it here keeps the page focused on tab
 * orchestration without changing semantics.
 */
import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import type { Datasource } from '../../../../common/types/alerting';
import { ALERT_MANAGER_SELECTED_DS_STORAGE_KEY } from '../../../../common/constants/alerting_settings';
import {
  clampToDatasourceCap,
  isCloudWatchDatasourceId,
} from '../../../../common/services/alerting/cloudwatch_datasource_id';
import {
  loadPersistedSelection as loadPersistedSelectionRaw,
  persistSelection as persistSelectionRaw,
  resolveDatasourceTokens,
} from '../alarms_page_helpers';

export interface UseDatasourceSelectionParams {
  datasources: Datasource[];
  /** True while the saved-object datasources are loading. */
  datasourcesLoading: boolean;
  /**
   * True while the CloudWatch datasources are loading (they aren't in `datasources` yet). The
   * selection starts without them, and stored CloudWatch entries are merged in once they load.
   */
  cloudWatchLoading?: boolean;
  /**
   * True when the CloudWatch accounts couldn't be read (only the single CloudWatch row is
   * listed). Stored CloudWatch entries are kept meanwhile, and merged back in once a later read
   * lists them.
   */
  cloudWatchUnavailable?: boolean;
  defaultDatasources: string[];
  maxDatasources: number;
}

export interface UseDatasourceSelectionResult {
  selectedDsIds: string[];
  /**
   * Stable callback bound to `setSelectedDsIds`. Returns nothing — the
   * caller can reset companion state (page numbers etc.) inline if it
   * needs to. Takes the ids, or an update of the latest selection.
   */
  setSelectedDsIds: (ids: SetStateAction<string[]>) => void;
}

const loadPersistedSelection = () =>
  loadPersistedSelectionRaw(ALERT_MANAGER_SELECTED_DS_STORAGE_KEY);
const persistSelection = (names: string[]) =>
  persistSelectionRaw(ALERT_MANAGER_SELECTED_DS_STORAGE_KEY, names);

const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

export function useDatasourceSelection({
  datasources,
  datasourcesLoading,
  cloudWatchLoading = false,
  cloudWatchUnavailable = false,
  defaultDatasources,
  maxDatasources,
}: UseDatasourceSelectionParams): UseDatasourceSelectionResult {
  const [selectedDsIds, setSelectedDsIdsState] = useState<string[]>([]);
  // The current selection, read by the init effect without re-running it on every change.
  const selectedRef = useRef(selectedDsIds);
  selectedRef.current = selectedDsIds;
  // Tokens the initial selection came from while CloudWatch was loading: re-resolved once it
  // loads, so stored CloudWatch entries are merged in. Dropped if the user changes the selection.
  const pendingTokensRef = useRef<string[] | undefined>(undefined);
  const userChangedRef = useRef(false);
  // Set while the CloudWatch accounts couldn't be read; cleared once a later read lists them.
  const cloudWatchFailedRef = useRef(false);

  // Resolve initial selection priority order:
  //   1. Previously-persisted names from localStorage (user's last
  //      explicit choice — wins over the admin default so refresh
  //      doesn't stomp their selection).
  //   2. `observability:alertManagerSelectedDatasources` setting
  //      (names / ids / directQueryName / mdsId). Also used as a
  //      fallthrough when localStorage exists but none of its entries
  //      resolve — e.g., the user's cached datasources were deleted.
  //   3. First discovered datasource.
  // Always clamp to the current `maxDatasources` — so if the admin
  // lowers the cap after the user stored 5 names, we drop the overflow.
  //
  // The saved-object datasources don't wait for CloudWatch: while it loads, the selection starts
  // from the entries that resolve, and the same tokens are resolved again once it has loaded.
  // Tokens that don't resolve yet may name CloudWatch datasources, so they wait for it.
  useEffect(() => {
    if (cloudWatchUnavailable) cloudWatchFailedRef.current = true;
    if (datasourcesLoading) return;
    // The cap counts sources: a CloudWatch account counts once, whatever its regions.
    const prev = selectedRef.current;
    if (prev.length > 0) {
      // A read after a failed one (a retry) lists the accounts: add the stored CloudWatch entries
      // back, after the current selection. The user never unchecked them, so this applies even
      // if they changed other datasources meanwhile.
      if (cloudWatchFailedRef.current && !cloudWatchLoading && !cloudWatchUnavailable) {
        cloudWatchFailedRef.current = false;
        const restored = resolveDatasourceTokens(
          loadPersistedSelection().filter(isCloudWatchDatasourceId),
          datasources
        ).filter((id) => !prev.includes(id));
        if (restored.length > 0) {
          setSelectedDsIdsState(clampToDatasourceCap([...prev, ...restored], maxDatasources));
          return;
        }
      }
      const pending = pendingTokensRef.current;
      if (pending && !cloudWatchLoading) {
        pendingTokensRef.current = undefined;
        if (!userChangedRef.current) {
          const resolved = resolveDatasourceTokens(pending, datasources);
          const merged = clampToDatasourceCap(
            resolved.length > 0 ? resolved : prev,
            maxDatasources
          );
          if (!sameIds(merged, prev)) setSelectedDsIdsState(merged);
          return;
        }
      }
      const clamped = clampToDatasourceCap(prev, maxDatasources);
      if (clamped.length !== prev.length) setSelectedDsIdsState(clamped);
      return;
    }

    // Persisted entries first. When all are stale (datasources removed), fall through to the
    // admin-curated setting rather than jumping straight to "first datasource" — the setting is
    // a better backup than an arbitrary pick.
    for (const tokens of [loadPersistedSelection(), defaultDatasources]) {
      if (tokens.length === 0) continue;
      const resolved = resolveDatasourceTokens(tokens, datasources);
      if (resolved.length > 0) {
        if (cloudWatchLoading) pendingTokensRef.current = tokens;
        setSelectedDsIdsState(clampToDatasourceCap(resolved, maxDatasources));
        return;
      }
      if (cloudWatchLoading) return;
    }

    const first = datasources[0]?.id;
    if (first) setSelectedDsIdsState([first]);
  }, [
    datasources,
    datasourcesLoading,
    cloudWatchLoading,
    cloudWatchUnavailable,
    defaultDatasources,
    maxDatasources,
  ]);

  // Persist the selection whenever it changes and we know the datasource list: by name, which
  // survives server restarts, and CloudWatch datasources by id, which is stable and unique
  // (two accounts may share a label).
  //
  // Skip the empty case: `selectedDsIds` starts as `[]` before the init
  // effect resolves a real selection, and both effects depend on
  // `datasources` — so on the first datasources-loaded render this effect
  // can fire with the still-empty initial state and clobber a valid
  // persisted selection. Skip while CloudWatch loads too, so stored CloudWatch
  // entries aren't dropped before they can resolve. When the CloudWatch accounts couldn't be
  // read, keep the stored CloudWatch entries that aren't listed, so a transient failure doesn't
  // erase them; a listed one (e.g. the single CloudWatch row) is saved as selected or not.
  useEffect(() => {
    if (cloudWatchLoading) return;
    if (datasources.length === 0) return;
    if (selectedDsIds.length === 0) return;
    const tokens = selectedDsIds
      .map((id) => {
        const ds = datasources.find((d) => d.id === id);
        if (!ds) return undefined;
        return ds.type === 'cloudwatch' ? ds.id : ds.name;
      })
      .filter((n): n is string => typeof n === 'string');
    if (cloudWatchUnavailable) {
      for (const token of loadPersistedSelection()) {
        if (
          isCloudWatchDatasourceId(token) &&
          !tokens.includes(token) &&
          !datasources.some((d) => d.id === token || d.name === token)
        ) {
          tokens.push(token);
        }
      }
    }
    persistSelection(tokens);
  }, [selectedDsIds, datasources, cloudWatchLoading, cloudWatchUnavailable]);

  const setSelectedDsIds = useCallback((ids: SetStateAction<string[]>) => {
    userChangedRef.current = true;
    setSelectedDsIdsState(ids);
  }, []);

  return { selectedDsIds, setSelectedDsIds };
}
