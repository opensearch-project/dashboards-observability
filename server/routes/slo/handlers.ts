/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Framework-agnostic SLO handlers. Route adapters translate the returned
 * { status, body } into OSD response shapes.
 *
 * PR 1 exposes the CRUD-plus-preview surface only. Repair, rule_health,
 * reconcile, aggregate, adoption, and probe-sli endpoints land in later PRs.
 */

import type { Logger } from '../../../../../src/core/server';
import {
  SloDeployContext,
  SloNotFoundError,
  SloRulerError,
  SloRulerTeardownRequiredError,
  SloStatusAggregationContext,
  SloValidationError,
  SloVersionConflictError,
  SloService,
} from '../../../common/slo/slo_service';
import type { SloCreateInput, SloListFilters, SloUpdateInput } from '../../../common/slo/slo_types';
import type { HandlerResult } from '../alerting/route_utils';
import { toHandlerResult } from '../alerting/route_utils';

function toSloError(e: unknown, logger?: Logger): HandlerResult {
  if (e instanceof SloValidationError) {
    if (logger) logger.warn(e.message);
    return { status: 400, body: { error: 'Validation failed', errors: e.errors } };
  }
  if (e instanceof SloNotFoundError) {
    return { status: 404, body: { error: e.message } };
  }
  if (e instanceof SloVersionConflictError) {
    return {
      status: 409,
      body: {
        error: e.message,
        current: e.current,
        attemptedVersion: e.attemptedVersion,
      },
    };
  }
  if (e instanceof SloRulerError) {
    if (logger) logger.warn(`Ruler dual-write failed: ${e.code} (HTTP ${e.httpStatus})`);
    // Surface upstream status verbatim when available (4xx) so the wizard can
    // show Cortex's own diagnostic. 0 (unreachable) maps to 502 — closest
    // semantic match (upstream gateway failure).
    const status = e.httpStatus >= 400 && e.httpStatus < 600 ? e.httpStatus : 502;
    return {
      status,
      body: {
        error: e.message,
        code: e.code,
        httpStatus: e.httpStatus,
        rawBody: e.rawBody,
      },
    };
  }
  if (e instanceof SloRulerTeardownRequiredError) {
    if (logger) logger.warn(e.message);
    return {
      status: 409,
      body: {
        error: e.message,
        code: 'RULER_TEARDOWN_REQUIRED',
        sloId: e.sloId,
        datasourceId: e.datasourceId,
      },
    };
  }
  return toHandlerResult(e, logger);
}

export async function handleListSLOs(
  svc: SloService,
  filters: SloListFilters,
  logger?: Logger,
  statusCtx?: SloStatusAggregationContext
): Promise<HandlerResult> {
  try {
    const result = await svc.getPaginated(filters, statusCtx);
    return { status: 200, body: result };
  } catch (e) {
    return toSloError(e, logger);
  }
}

export async function handleCreateSLO(
  svc: SloService,
  input: SloCreateInput,
  createdBy: string,
  logger?: Logger,
  deploy?: SloDeployContext
): Promise<HandlerResult> {
  try {
    const doc = await svc.create(input, createdBy, deploy);
    return { status: 201, body: doc };
  } catch (e) {
    return toSloError(e, logger);
  }
}

export async function handleGetSLO(
  svc: SloService,
  id: string,
  logger?: Logger,
  statusCtx?: SloStatusAggregationContext
): Promise<HandlerResult> {
  try {
    const doc = await svc.get(id);
    if (!doc) return { status: 404, body: { error: 'SLO not found' } };
    const liveStatus = await svc.getStatus(id, statusCtx);
    return { status: 200, body: { ...doc, liveStatus } };
  } catch (e) {
    return toSloError(e, logger);
  }
}

export async function handleUpdateSLO(
  svc: SloService,
  id: string,
  input: SloUpdateInput,
  updatedBy: string,
  logger?: Logger,
  deploy?: SloDeployContext
): Promise<HandlerResult> {
  try {
    const doc = await svc.update(id, input, updatedBy, deploy);
    return { status: 200, body: doc };
  } catch (e) {
    return toSloError(e, logger);
  }
}

export async function handleDeleteSLO(
  svc: SloService,
  id: string,
  logger?: Logger,
  deploy?: SloDeployContext
): Promise<HandlerResult> {
  try {
    const result = await svc.delete(id, deploy);
    if (!result.deleted) return { status: 404, body: { error: 'SLO not found' } };
    return { status: 200, body: { deleted: true } };
  } catch (e) {
    return toSloError(e, logger);
  }
}

export async function handleEnableSLO(
  svc: SloService,
  id: string,
  updatedBy: string,
  logger?: Logger,
  deploy?: SloDeployContext
): Promise<HandlerResult> {
  try {
    const doc = await svc.setEnabled(id, true, updatedBy, deploy);
    return { status: 200, body: doc };
  } catch (e) {
    return toSloError(e, logger);
  }
}

export async function handleDisableSLO(
  svc: SloService,
  id: string,
  updatedBy: string,
  logger?: Logger,
  deploy?: SloDeployContext
): Promise<HandlerResult> {
  try {
    const doc = await svc.setEnabled(id, false, updatedBy, deploy);
    return { status: 200, body: doc };
  } catch (e) {
    return toSloError(e, logger);
  }
}

export async function handlePreviewSLORules(
  svc: SloService,
  input: SloCreateInput,
  logger?: Logger
): Promise<HandlerResult> {
  try {
    const group = svc.previewRules(input);
    return { status: 200, body: group };
  } catch (e) {
    return toSloError(e, logger);
  }
}

export async function handleGetSLOStatuses(
  svc: SloService,
  ids: string[],
  logger?: Logger,
  statusCtx?: SloStatusAggregationContext
): Promise<HandlerResult> {
  try {
    if (!ids || ids.length === 0) {
      return { status: 400, body: { error: 'ids parameter is required' } };
    }
    const statuses = await svc.getStatuses(ids, statusCtx);
    return { status: 200, body: { statuses } };
  } catch (e) {
    return toSloError(e, logger);
  }
}
