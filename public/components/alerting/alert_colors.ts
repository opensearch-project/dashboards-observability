/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { euiThemeVars } from '@osd/ui-shared-deps/theme';
import type {
  UnifiedAlertKind,
  UnifiedAlertSeverity,
  UnifiedAlertState,
} from '../../../common/types/alerting';

/**
 * Theme-derived colors for alert severity, state, and row kind.
 *
 * Alert surfaces previously hand-rolled these as literal hex — which pinned them
 * to the light theme (so dark mode rendered near-invisible swatches) and let each
 * component drift from the next. `euiThemeVars` gives the palette for the theme
 * that was active when this module loaded, so consumers get the right value for
 * light or dark. Like the sibling `apm/common/constants.ts`, the maps are
 * resolved once at import time and rely on the app reloading on a theme change —
 * a runtime light/dark toggle without a reload would keep the load-time palette.
 *
 * Use these where a raw CSS color is unavoidable (chart series, custom swatches).
 * Where an OUI component takes a semantic color name — `EuiHealth`, `EuiBadge` —
 * prefer the semantic maps in `shared_constants.ts` instead.
 */

/** Severity → theme color. Ramps danger → warning → primary → subdued. */
export const SEVERITY_HEX: Record<UnifiedAlertSeverity, string> = {
  critical: euiThemeVars.euiColorDanger,
  high: euiThemeVars.euiColorWarning,
  medium: euiThemeVars.euiColorPrimary,
  low: euiThemeVars.euiColorMediumShade,
  info: euiThemeVars.euiColorLightShade,
};

/** Alert state → theme color. */
export const STATE_HEX: Record<UnifiedAlertState, string> = {
  active: euiThemeVars.euiColorDanger,
  pending: euiThemeVars.euiColorWarning,
  acknowledged: euiThemeVars.euiColorPrimary,
  silenced: euiThemeVars.euiColorMediumShade,
  resolved: euiThemeVars.euiColorSuccess,
  error: euiThemeVars.euiColorDanger,
};

/**
 * Row kind → theme color. Anomaly rows use the darker warning tone so they read
 * as distinct from a `high`-severity alert rather than merely similar.
 */
export const ALERT_KIND_HEX: Record<UnifiedAlertKind, string> = {
  alert: euiThemeVars.euiColorPrimary,
  anomaly: euiThemeVars.euiColorWarningText,
};

/**
 * Fallback for a value the UI doesn't recognise — subdued rather than alarming.
 *
 * Intentional asymmetry with {@link getStateLabel}: an unmapped state is still
 * humanized to readable text (so the cell isn't blank) but gets this neutral
 * swatch rather than a guessed semantic color. Coloring an unknown state as if
 * it were `active` (danger) or `resolved` (success) would assert a severity the
 * UI can't actually infer, so the muted swatch signals "recognised, but not a
 * known state" on purpose.
 */
export const UNKNOWN_HEX = euiThemeVars.euiColorMediumShade;

/** Severity color, falling back to a subdued tone for unrecognised values. */
export function getSeverityHex(severity?: string | null): string {
  if (!severity) return UNKNOWN_HEX;
  return SEVERITY_HEX[severity as UnifiedAlertSeverity] ?? UNKNOWN_HEX;
}

/**
 * State color. `anomaly` is not an alert state but appears in the same column of
 * the alerts table, so it is resolved here too.
 */
export function getStateHex(state?: string | null): string {
  if (!state) return UNKNOWN_HEX;
  const kindHex = ALERT_KIND_HEX[state as UnifiedAlertKind];
  return STATE_HEX[state as UnifiedAlertState] ?? kindHex ?? UNKNOWN_HEX;
}
