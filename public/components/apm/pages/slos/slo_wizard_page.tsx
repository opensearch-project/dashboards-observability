/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Minimal create-SLO wizard — one template (HTTP availability), one
 * objective. Fuller multi-section wizard with probe-SLI, advanced section,
 * and exclusion windows lands in later PRs.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Prompt, useHistory } from 'react-router-dom';
import { i18n } from '@osd/i18n';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiFieldNumber,
  EuiFieldText,
  EuiForm,
  EuiFormRow,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiSpacer,
  EuiTextArea,
} from '@elastic/eui';
import type { ChromeStart, NotificationsStart } from '../../../../../../../src/core/public';
import type { SloCreateInput, SloSpec } from '../../../../../common/slo/slo_types';
import { DEFAULT_MWMBR_TIERS } from '../../../../../common/slo/slo_promql_generator';
import { SloApiClient, extractRulerErrorEnvelope, extractServerMessage } from './slo_api_client';

export interface SloWizardPageProps {
  apiClient: SloApiClient;
  chrome: ChromeStart;
  notifications: NotificationsStart;
  parentBreadcrumb: { text: string; href: string };
}

const I18N = {
  breadcrumbSlos: i18n.translate('observability.slo.wizard.breadcrumbSlos', {
    defaultMessage: 'SLOs',
  }),
  breadcrumbCreate: i18n.translate('observability.slo.wizard.breadcrumbCreate', {
    defaultMessage: 'Create',
  }),
  labelName: i18n.translate('observability.slo.wizard.labelName', {
    defaultMessage: 'Name',
  }),
  labelService: i18n.translate('observability.slo.wizard.labelService', {
    defaultMessage: 'Service',
  }),
  labelTeam: i18n.translate('observability.slo.wizard.labelTeam', {
    defaultMessage: 'Owner team',
  }),
  labelDatasource: i18n.translate('observability.slo.wizard.labelDatasource', {
    defaultMessage: 'Datasource ID',
  }),
  helpDatasource: i18n.translate('observability.slo.wizard.helpDatasource', {
    defaultMessage: 'The registered Prometheus / AMP DirectQuery connection.',
  }),
  labelMetric: i18n.translate('observability.slo.wizard.labelMetric', {
    defaultMessage: 'Metric',
  }),
  helpMetric: i18n.translate('observability.slo.wizard.helpMetric', {
    defaultMessage: 'Prometheus counter metric used to compute availability.',
  }),
  labelTarget: i18n.translate('observability.slo.wizard.labelTarget', {
    defaultMessage: 'Target (%)',
  }),
  helpTarget: i18n.translate('observability.slo.wizard.helpTarget', {
    defaultMessage: 'Between 50 and 99.999.',
  }),
  labelDescription: i18n.translate('observability.slo.wizard.labelDescription', {
    defaultMessage: 'Description',
  }),
  cancel: i18n.translate('observability.slo.wizard.cancel', {
    defaultMessage: 'Cancel',
  }),
  create: i18n.translate('observability.slo.wizard.create', {
    defaultMessage: 'Create',
  }),
  toastCreated: (name: string) =>
    i18n.translate('observability.slo.wizard.toastCreated', {
      defaultMessage: 'Created SLO "{name}"',
      values: { name },
    }),
  toastRulerRejected: (code: string) =>
    i18n.translate('observability.slo.wizard.toastRulerRejected', {
      defaultMessage: 'Ruler rejected the rule group ({code})',
      values: { code },
    }),
  toastCreateFailed: i18n.translate('observability.slo.wizard.toastCreateFailed', {
    defaultMessage: 'Failed to create SLO',
  }),
  unsavedChangesPrompt: i18n.translate('observability.slo.wizard.unsavedChangesPrompt', {
    defaultMessage:
      'You have unsaved changes. Are you sure you want to leave this page? Your form will be lost.',
  }),
  errorRequired: i18n.translate('observability.slo.wizard.errorRequired', {
    defaultMessage: 'Required',
  }),
  errorTargetRange: i18n.translate('observability.slo.wizard.errorTargetRange', {
    defaultMessage: 'Target must be between 50 and 99.999',
  }),
};

interface FormState {
  name: string;
  service: string;
  team: string;
  datasourceId: string;
  metric: string;
  // `target` is the raw text from `EuiFieldNumber` so an empty input
  // doesn't collapse to `0` mid-edit. Parsed at validation/submit time.
  target: string;
  description: string;
}

const INITIAL: FormState = {
  name: '',
  service: '',
  team: '',
  datasourceId: '',
  metric: 'http_requests_total',
  target: '99.9',
  description: '',
};

function parseTarget(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function buildSpec(form: FormState): SloSpec {
  // Clamp target from percentage input (99.9) to the ratio the server stores (0.999).
  const targetPct = parseTarget(form.target);
  const target = Math.min(0.99999, Math.max(0.5, targetPct / 100));
  return {
    datasourceId: form.datasourceId.trim(),
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    enabled: true,
    mode: 'active',
    service: form.service.trim(),
    owner: { teams: [form.team.trim()] },
    sli: {
      type: 'single',
      definition: {
        backend: 'prometheus',
        type: 'availability',
        calcMethod: 'events',
        metric: form.metric.trim(),
      },
      dimensions: [{ name: 'service', value: form.service.trim() }],
    },
    objectives: [{ name: 'availability', target }],
    budgetWarningThresholds: [{ threshold: 0.5, severity: 'warning' }],
    window: { type: 'rolling', duration: '28d' },
    alerting: { strategy: 'mwmbr', burnRates: DEFAULT_MWMBR_TIERS.map((t) => ({ ...t })) },
    alarms: {
      sliHealth: { enabled: false },
      attainmentBreach: { enabled: false },
      budgetWarning: { enabled: true },
      noData: { enabled: false, forDuration: '10m' },
      resolved: { enabled: false },
    },
    exclusionWindows: [],
    labels: {},
    annotations: {},
  };
}

export const SloWizardPage: React.FC<SloWizardPageProps> = ({
  apiClient,
  chrome,
  notifications,
  parentBreadcrumb,
}) => {
  const history = useHistory();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Mirrors the `generationRef` cancellation pattern from the listing page:
  // submit completes asynchronously, and a parent unmount (browser back,
  // breadcrumb click) before the response lands would otherwise call
  // setState on an unmounted component. Tick this on unmount to drop late
  // resolutions silently.
  const submitGenerationRef = useRef(0);

  useEffect(() => {
    return () => {
      submitGenerationRef.current++;
    };
  }, []);

  useEffect(() => {
    chrome.setBreadcrumbs([
      parentBreadcrumb,
      { text: I18N.breadcrumbSlos, href: '#/slos' },
      { text: I18N.breadcrumbCreate, href: '#/slos/create' },
    ]);
  }, [chrome, parentBreadcrumb]);

  const onField = <K extends keyof FormState>(k: K) => (v: FormState[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  };

  const targetPct = parseTarget(form.target);
  const validations = useMemo(
    () => ({
      name: form.name.trim().length > 0,
      service: form.service.trim().length > 0,
      team: form.team.trim().length > 0,
      datasource: form.datasourceId.trim().length > 0,
      metric: form.metric.trim().length > 0,
      target: Number.isFinite(targetPct) && targetPct >= 50 && targetPct <= 99.999,
    }),
    [form, targetPct]
  );
  const valid = Object.values(validations).every(Boolean);

  const dirty = useMemo(() => {
    return (
      form.name !== INITIAL.name ||
      form.service !== INITIAL.service ||
      form.team !== INITIAL.team ||
      form.datasourceId !== INITIAL.datasourceId ||
      form.metric !== INITIAL.metric ||
      form.target !== INITIAL.target ||
      form.description !== INITIAL.description
    );
  }, [form]);

  const onSubmit = useCallback(async () => {
    if (!valid) {
      setSubmitted(true);
      return;
    }
    const myGen = ++submitGenerationRef.current;
    setSubmitting(true);
    setSubmitted(true);
    try {
      const input: SloCreateInput = { spec: buildSpec(form) };
      const doc = await apiClient.create(input);
      if (myGen !== submitGenerationRef.current) return;
      notifications.toasts.addSuccess(I18N.toastCreated(doc.spec.name));
      // Redirect to the detail page so the user sees the spec they authored
      // and so a new SLO on page 2 of a paginated listing doesn't "disappear".
      history.push(`/slos/${encodeURIComponent(doc.id)}`);
    } catch (err) {
      if (myGen !== submitGenerationRef.current) return;
      const ruler = extractRulerErrorEnvelope(err);
      if (ruler) {
        notifications.toasts.addDanger({
          title: I18N.toastRulerRejected(ruler.code),
          text: ruler.rawBody || ruler.error,
        });
      } else {
        notifications.toasts.addDanger({
          title: I18N.toastCreateFailed,
          text: extractServerMessage(err),
        });
      }
    } finally {
      if (myGen === submitGenerationRef.current) setSubmitting(false);
    }
  }, [apiClient, form, history, notifications, valid]);

  // Show field errors only after the user attempted submit OR after they
  // touched the field — avoids blasting the form red on first render.
  const showError = submitted;
  return (
    <EuiPage>
      <EuiPageBody>
        <EuiPageContent>
          {/*
            Block in-app navigation when the form is dirty and we haven't
            successfully submitted yet. `submitting` is allowed through so
            the post-create `history.push('/slos/<id>')` redirect lands.
          */}
          <Prompt when={dirty && !submitting} message={I18N.unsavedChangesPrompt} />
          <EuiForm
            component="form"
            onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
              // Default form submit reloads the page when the form has no
              // explicit `action` — which the wizard doesn't, since submit
              // is handled by the create button below.
              e.preventDefault();
              if (!submitting) onSubmit();
            }}
          >
            <EuiFormRow
              label={I18N.labelName}
              fullWidth
              isInvalid={showError && !validations.name}
              error={showError && !validations.name ? I18N.errorRequired : undefined}
            >
              <EuiFieldText
                value={form.name}
                onChange={(e) => onField('name')(e.target.value)}
                isInvalid={showError && !validations.name}
                data-test-subj="sloWizardName"
                fullWidth
              />
            </EuiFormRow>
            <EuiFormRow
              label={I18N.labelService}
              fullWidth
              isInvalid={showError && !validations.service}
              error={showError && !validations.service ? I18N.errorRequired : undefined}
            >
              <EuiFieldText
                value={form.service}
                onChange={(e) => onField('service')(e.target.value)}
                isInvalid={showError && !validations.service}
                data-test-subj="sloWizardService"
                fullWidth
              />
            </EuiFormRow>
            <EuiFormRow
              label={I18N.labelTeam}
              fullWidth
              isInvalid={showError && !validations.team}
              error={showError && !validations.team ? I18N.errorRequired : undefined}
            >
              <EuiFieldText
                value={form.team}
                onChange={(e) => onField('team')(e.target.value)}
                isInvalid={showError && !validations.team}
                data-test-subj="sloWizardTeam"
                fullWidth
              />
            </EuiFormRow>
            <EuiFormRow
              label={I18N.labelDatasource}
              helpText={I18N.helpDatasource}
              fullWidth
              isInvalid={showError && !validations.datasource}
              error={showError && !validations.datasource ? I18N.errorRequired : undefined}
            >
              <EuiFieldText
                value={form.datasourceId}
                onChange={(e) => onField('datasourceId')(e.target.value)}
                isInvalid={showError && !validations.datasource}
                data-test-subj="sloWizardDatasource"
                fullWidth
              />
            </EuiFormRow>
            <EuiFormRow
              label={I18N.labelMetric}
              helpText={I18N.helpMetric}
              fullWidth
              isInvalid={showError && !validations.metric}
              error={showError && !validations.metric ? I18N.errorRequired : undefined}
            >
              <EuiFieldText
                value={form.metric}
                onChange={(e) => onField('metric')(e.target.value)}
                isInvalid={showError && !validations.metric}
                data-test-subj="sloWizardMetric"
                fullWidth
              />
            </EuiFormRow>
            <EuiFormRow
              label={I18N.labelTarget}
              helpText={I18N.helpTarget}
              fullWidth
              isInvalid={showError && !validations.target}
              error={showError && !validations.target ? I18N.errorTargetRange : undefined}
            >
              <EuiFieldNumber
                // Store the raw text in form state — `Number('')` collapses
                // to `0`, which would silently overwrite the user's edit
                // when they clear the field to retype.
                value={form.target}
                onChange={(e) => onField('target')(e.target.value)}
                min={50}
                max={99.999}
                step={0.001}
                isInvalid={showError && !validations.target}
                data-test-subj="sloWizardTarget"
                fullWidth
              />
            </EuiFormRow>
            <EuiFormRow label={I18N.labelDescription} fullWidth>
              <EuiTextArea
                value={form.description}
                onChange={(e) => onField('description')(e.target.value)}
                data-test-subj="sloWizardDescription"
                fullWidth
              />
            </EuiFormRow>
            <EuiSpacer />
            <EuiButtonEmpty onClick={() => history.push('/slos')}>{I18N.cancel}</EuiButtonEmpty>
            <EuiButton
              fill
              type="submit"
              isDisabled={submitting}
              isLoading={submitting}
              data-test-subj="sloWizardSubmit"
            >
              {I18N.create}
            </EuiButton>
          </EuiForm>
        </EuiPageContent>
      </EuiPageBody>
    </EuiPage>
  );
};
