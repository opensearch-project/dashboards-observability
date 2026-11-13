/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * The CloudWatch logo for the Datasource facet group header and the per-row type icon. OUI has
 * no CloudWatch logo, so this uses the one OSD core's workspace plugin ships in its
 * `public/assets`. Core serves every UI plugin's `public/assets` at
 * `<basePath>/plugins/<pluginId>/assets/` (PluginsService.registerPluginStaticDirs), so the
 * logo is referenced by that URL instead of being copied or imported across plugins. The AWS
 * logo stands in until the asset has loaded, and stays if it cannot load (for example, when the
 * workspace plugin is disabled).
 */
import { useEffect, useState } from 'react';
import { coreRefs } from '../../framework/core_refs';

export const CLOUDWATCH_ICON_ASSET_PATH = '/plugins/workspace/assets/cloudwatch_logo.svg';
export const CLOUDWATCH_ICON_FALLBACK = 'logoAWS';

type LoadState = 'idle' | 'loading' | 'loaded' | 'failed';
let loadState: LoadState = 'idle';
const listeners = new Set<() => void>();

/** The logo URL under the server base path (static assets are not served per workspace). */
export function cloudWatchIconUrl(): string {
  const basePath = coreRefs.http?.basePath;
  return basePath
    ? basePath.prepend(CLOUDWATCH_ICON_ASSET_PATH, { withoutClientBasePath: true })
    : CLOUDWATCH_ICON_ASSET_PATH;
}

function currentIconType(): string {
  return loadState === 'loaded' ? cloudWatchIconUrl() : CLOUDWATCH_ICON_FALLBACK;
}

function loadIcon() {
  if (loadState !== 'idle') return;
  loadState = 'loading';
  const settle = (next: LoadState) => {
    loadState = next;
    listeners.forEach((listener) => listener());
  };
  const img = new Image();
  img.onload = () => settle('loaded');
  img.onerror = () => settle('failed');
  img.src = cloudWatchIconUrl();
}

/** The EuiIcon type for CloudWatch: the logo URL once it has loaded, else `logoAWS`. */
export function useCloudWatchIconType(): string {
  const [iconType, setIconType] = useState(currentIconType);
  useEffect(() => {
    const listener = () => setIconType(currentIconType());
    listeners.add(listener);
    loadIcon();
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return iconType;
}

/** Test hook: forget the load result so the next render loads the logo again. */
export function resetCloudWatchIconForTests() {
  loadState = 'idle';
}
