/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExplorerSavedObjectLoader } from '../explorer_saved_object_loader';

const buildSavedQueryObject = (dataSources?: string) => {
  const savedQuery: Record<string, unknown> = {
    name: 'test query',
    query: 'source = my-index | stats count() by name',
    query_lang: 'PPL',
    selected_date_range: { start: 'now-1d', end: 'now', text: 'last 1 day' },
    selected_fields: { tokens: [], text: '' },
    selected_timestamp: { name: 'startTime', type: 'timestamp' },
  };
  // Only attach data_sources when provided. The observability backend store
  // drops this field on write, so a loaded object may not contain it at all.
  if (dataSources !== undefined) {
    savedQuery.data_sources = dataSources;
  }
  return { savedQuery };
};

const createLoader = (savedObjectData: unknown) => {
  const addError = jest.fn();
  const dispatch = jest.fn();
  const fetchData = jest.fn();
  const batch = jest.fn((cb: () => void) => cb());

  const savedObjectClient = {
    get: jest.fn().mockResolvedValue({ observabilityObjectList: [savedObjectData] }),
  } as any;

  const notifications = { toasts: { addError, addSuccess: jest.fn() } } as any;

  const dispatchers = {
    batch,
    dispatch,
    changeQuery: jest.fn((p) => p),
    updateFields: jest.fn((p) => p),
    updateTabName: jest.fn((p) => p),
    updateVizConfig: jest.fn((p) => p),
  } as any;

  const loadParams = { objectId: 'test-object-id' };

  const loadContext = {
    tabId: 'tab-1',
    appLogEvents: false,
    setStartTime: jest.fn(),
    setEndTime: jest.fn(),
    queryManager: {
      queryParser: () => ({ parse: () => ({ getStats: () => ({}) }) }),
    },
    getDefaultVisConfig: jest.fn(() => ({})),
    setSelectedPanelName: jest.fn(),
    setCurVisId: jest.fn(),
    setTempQuery: jest.fn(),
    setMetricChecked: jest.fn(),
    setMetricMeasure: jest.fn(),
    setSubType: jest.fn(),
    setSelectedContentTab: jest.fn(),
    fetchData,
    dispatchOnGettingHis: jest.fn(),
  } as any;

  const loader = new ExplorerSavedObjectLoader(
    savedObjectClient,
    notifications,
    dispatchers,
    loadParams,
    loadContext
  );

  return { loader, addError, dispatch, fetchData };
};

describe('ExplorerSavedObjectLoader data source parsing', () => {
  it('opens a saved object that is missing data_sources without erroring (backend drops the field)', async () => {
    const { loader, addError, fetchData } = createLoader(buildSavedQueryObject(undefined));

    await loader.load();

    // No "Cannot parse datasources from saved object" toast should be raised.
    expect(addError).not.toHaveBeenCalled();
    // Falls back to the default cluster path, which fetches data.
    expect(fetchData).toHaveBeenCalled();
  });

  it('opens a saved object whose data_sources is undefined (explicitly present but no value)', async () => {
    const obj = buildSavedQueryObject(undefined);
    // Explicitly set the field to undefined, mimicking a GET response shape.
    (obj.savedQuery as Record<string, unknown>).data_sources = undefined;

    const { loader, addError, fetchData } = createLoader(obj);

    await loader.load();

    expect(addError).not.toHaveBeenCalled();
    expect(fetchData).toHaveBeenCalled();
  });

  it('loads the default index pattern when data_sources is present and valid', async () => {
    const dataSources = JSON.stringify([
      {
        name: 'Default cluster',
        type: 'DEFAULT_INDEX_PATTERNS',
        label: 'Default cluster',
        value: 'Default cluster',
      },
    ]);
    const { loader, addError, fetchData } = createLoader(buildSavedQueryObject(dataSources));

    await loader.load();

    expect(addError).not.toHaveBeenCalled();
    expect(fetchData).toHaveBeenCalled();
  });

  it('surfaces a single parse error for a genuinely malformed data_sources string', async () => {
    const { loader, addError, fetchData } = createLoader(buildSavedQueryObject('{not valid json'));

    await loader.load();

    // Exactly one error toast (parsed once, not once per consumer).
    expect(addError).toHaveBeenCalledTimes(1);
    // Still recovers to the default cluster path rather than throwing.
    expect(fetchData).toHaveBeenCalled();
  });
});
