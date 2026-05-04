/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alertmanager route handlers for the OSD plugin.
 * Each handler takes a PrometheusBackend and returns { status, body }.
 */
import yaml from 'js-yaml';
import type {
  AlertingOSClient,
  AlertmanagerSilence,
  Datasource,
  Logger,
  PrometheusBackend,
} from '../../../common/types/alerting';
import { isStatusCode } from '../../services/alerting';
import { toHandlerResult } from './route_utils';
import type { HandlerResult } from './route_utils';

/**
 * Discriminates the body shape of the Alertmanager config route so the UI
 * can distinguish "not configured" from "unauthorized" from a real upstream
 * failure. Before, every failure was reflected as `{ available: false }`
 * with HTTP 200, which masked authz denials as config state.
 */
type AlertmanagerConfigCode = 'ok' | 'not_configured' | 'unauthorized' | 'upstream_error';

// ============================================================================
// Alertmanager API v2 Handlers
// ============================================================================

export async function handleGetAlertmanagerAlerts(
  promBackend: PrometheusBackend,
  client: AlertingOSClient,
  ds: Datasource
): Promise<HandlerResult> {
  try {
    if (!promBackend.getAlertmanagerAlerts) {
      return { status: 501, body: { error: 'Alertmanager not configured' } };
    }
    const alerts = await promBackend.getAlertmanagerAlerts(client, ds);
    return { status: 200, body: { alerts } };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleGetAlertmanagerSilences(
  promBackend: PrometheusBackend,
  client: AlertingOSClient,
  ds: Datasource
): Promise<HandlerResult> {
  try {
    if (!promBackend.getSilences) {
      return { status: 501, body: { error: 'Alertmanager not configured' } };
    }
    const silences = await promBackend.getSilences(client, ds);
    return { status: 200, body: { silences } };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleCreateAlertmanagerSilence(
  promBackend: PrometheusBackend,
  client: AlertingOSClient,
  ds: Datasource,
  body: AlertmanagerSilence
): Promise<HandlerResult> {
  try {
    if (!promBackend.createSilence) {
      return { status: 501, body: { error: 'Alertmanager not configured' } };
    }
    const silenceId = await promBackend.createSilence(client, ds, body);
    return { status: 200, body: { silenceID: silenceId } };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleDeleteAlertmanagerSilence(
  promBackend: PrometheusBackend,
  client: AlertingOSClient,
  ds: Datasource,
  id: string
): Promise<HandlerResult> {
  try {
    if (!promBackend.deleteSilence) {
      return { status: 501, body: { error: 'Alertmanager not configured' } };
    }
    const ok = await promBackend.deleteSilence(client, ds, id);
    return { status: 200, body: { success: ok } };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleGetAlertmanagerStatus(
  promBackend: PrometheusBackend,
  client: AlertingOSClient,
  ds: Datasource
): Promise<HandlerResult> {
  try {
    if (!promBackend.getAlertmanagerStatus) {
      return { status: 501, body: { error: 'Alertmanager not configured' } };
    }
    const status = await promBackend.getAlertmanagerStatus(client, ds);
    return { status: 200, body: status };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleGetAlertmanagerReceivers(
  promBackend: PrometheusBackend,
  client: AlertingOSClient,
  ds: Datasource
): Promise<HandlerResult> {
  try {
    if (!promBackend.getAlertmanagerReceivers) {
      return { status: 501, body: { error: 'Alertmanager receivers not available' } };
    }
    const receivers = await promBackend.getAlertmanagerReceivers(client, ds);
    return { status: 200, body: { receivers } };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleGetAlertmanagerAlertGroups(
  promBackend: PrometheusBackend,
  client: AlertingOSClient,
  ds: Datasource
): Promise<HandlerResult> {
  try {
    if (!promBackend.getAlertmanagerAlertGroups) {
      return { status: 501, body: { error: 'Alertmanager alert groups not available' } };
    }
    const groups = await promBackend.getAlertmanagerAlertGroups(client, ds);
    return { status: 200, body: { groups } };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

// ============================================================================
// Alertmanager Config (parsed YAML)
// ============================================================================

/**
 * Extract integration types from a receiver's *_configs keys.
 * Shared config parsing helper. Receiver objects come from user YAML, so
 * the inner config shapes are dynamic — keep them as Record<string, unknown>.
 */
export function extractReceiverIntegrations(
  receiver: Record<string, unknown>
): Array<{ type: string; summary: string }> {
  const integrations: Array<{ type: string; summary: string }> = [];
  const configKeys = [
    'webhook_configs',
    'slack_configs',
    'email_configs',
    'pagerduty_configs',
    'opsgenie_configs',
    'victorops_configs',
    'pushover_configs',
    'wechat_configs',
    'sns_configs',
    'telegram_configs',
    'msteams_configs',
    'webex_configs',
  ];
  for (const key of configKeys) {
    const entries = receiver[key];
    if (Array.isArray(entries)) {
      for (const raw of entries) {
        const cfg = (raw as Record<string, unknown>) || {};
        const typeName = key.replace('_configs', '');
        const pick = (k: string): string | undefined => {
          const v = cfg[k];
          return typeof v === 'string' ? v : undefined;
        };
        let summary = '';
        if (typeName === 'webhook') summary = pick('url') || pick('url_file') || 'webhook';
        else if (typeName === 'slack') summary = pick('channel') || 'slack';
        else if (typeName === 'email') summary = pick('to') || 'email';
        else if (typeName === 'pagerduty')
          summary = pick('service_key') || pick('api_url') || 'pagerduty';
        else summary = pick('url') || pick('api_url') || typeName;
        integrations.push({ type: typeName, summary: String(summary) });
      }
    }
  }
  if (integrations.length === 0) {
    integrations.push({ type: 'none', summary: 'No integrations' });
  }
  return integrations;
}

/**
 * Fetch Alertmanager status, parse the YAML config, and return structured data.
 */
export async function handleGetAlertmanagerConfig(
  promBackend: PrometheusBackend,
  client: AlertingOSClient,
  ds: Datasource,
  logger?: Logger
): Promise<HandlerResult> {
  const codeNotConfigured: AlertmanagerConfigCode = 'not_configured';
  const codeUnauthorized: AlertmanagerConfigCode = 'unauthorized';
  const codeUpstreamError: AlertmanagerConfigCode = 'upstream_error';
  const codeOk: AlertmanagerConfigCode = 'ok';

  try {
    if (!promBackend.getAlertmanagerStatus) {
      return {
        status: 200,
        body: {
          available: false,
          code: codeNotConfigured,
          error: 'Alertmanager not configured',
        },
      };
    }
    const status = await promBackend.getAlertmanagerStatus(client, ds);
    const rawYaml = status.config?.original || '';

    let parsedConfig: Record<string, unknown> | undefined;
    let configParseError: string | undefined;

    if (rawYaml) {
      try {
        // js-yaml v4: yaml.load() defaults to safe DEFAULT_SCHEMA (no code execution).
        const parsed = yaml.load(rawYaml) as Record<string, unknown> | null;
        if (parsed && typeof parsed === 'object') {
          const rawReceivers = Array.isArray(parsed.receivers) ? parsed.receivers : [];
          const receivers = rawReceivers.map((raw) => {
            const r = (raw as Record<string, unknown>) || {};
            return {
              name: typeof r.name === 'string' ? r.name : '',
              integrations: extractReceiverIntegrations(r),
            };
          });

          parsedConfig = {
            global: parsed.global || {},
            route: parsed.route || null,
            receivers,
            inhibitRules: parsed.inhibit_rules || [],
          };
        }
      } catch (yamlErr: unknown) {
        configParseError = `Failed to parse YAML: ${String(yamlErr)}`;
      }
    }

    return {
      status: 200,
      body: {
        available: true,
        code: codeOk,
        cluster: {
          status: status.cluster?.status || 'unknown',
          peers: status.cluster?.peers || [],
          peerCount: (status.cluster?.peers || []).length,
        },
        uptime: status.uptime,
        versionInfo: status.versionInfo || {},
        config: parsedConfig,
        configParseError,
        raw: rawYaml,
      },
    };
  } catch (e: unknown) {
    // Log the full upstream error server-side; never reflect its `message`
    // to the browser (may contain cluster URLs / stack fragments / index names).
    if (logger) logger.error(e instanceof Error ? e.message : String(e));

    if (isStatusCode(e, 401) || isStatusCode(e, 403)) {
      const upstreamStatus = isStatusCode(e, 401) ? 401 : 403;
      return {
        status: upstreamStatus,
        body: {
          available: false,
          code: codeUnauthorized,
          error: upstreamStatus === 401 ? 'Unauthorized' : 'Forbidden',
        },
      };
    }

    return {
      status: 500,
      body: {
        available: false,
        code: codeUpstreamError,
        error: 'Failed to fetch Alertmanager config',
      },
    };
  }
}
