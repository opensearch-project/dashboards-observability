/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Minimal create-SLO wizard — one template (HTTP availability), one
 * objective. Fuller multi-section wizard with probe-SLI, advanced section,
 * and exclusion windows lands in later PRs.
 */

import React, { useCallback, useState } from 'react';
import { useHistory } from 'react-router-dom';
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
  EuiPageHeader,
  EuiSpacer,
  EuiTextArea,
  EuiTitle,
} from '@elastic/eui';
import type { ChromeStart, NotificationsStart } from '../../../../../../../src/core/public';
import type { SloCreateInput, SloSpec } from '../../../../../common/slo/slo_types';
import { DEFAULT_MWMBR_TIERS } from '../../../../../common/slo/slo_promql_generator';
import { SloApiClient, extractRulerErrorEnvelope } from './slo_api_client';

export interface SloWizardPageProps {
  apiClient: SloApiClient;
  chrome: ChromeStart;
  notifications: NotificationsStart;
  parentBreadcrumb: { text: string; href: string };
}

interface FormState {
  name: string;
  service: string;
  team: string;
  datasourceId: string;
  metric: string;
  target: number;
  description: string;
}

const INITIAL: FormState = {
  name: '',
  service: '',
  team: '',
  datasourceId: '',
  metric: 'http_requests_total',
  target: 99.9,
  description: '',
};

function buildSpec(form: FormState): SloSpec {
  // Clamp target from percentage input (99.9) to the ratio the server stores (0.999).
  const target = Math.min(0.99999, Math.max(0.5, form.target / 100));
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
}) => {
  const history = useHistory();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    chrome.setBreadcrumbs([
      { text: 'SLOs', href: '#/slos' },
      { text: 'Create', href: '#/slos/create' },
    ]);
  }, [chrome]);

  const onField = <K extends keyof FormState>(k: K) => (v: FormState[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  };

  const onSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      const input: SloCreateInput = { spec: buildSpec(form) };
      const doc = await apiClient.create(input);
      notifications.toasts.addSuccess(`Created SLO "${doc.spec.name}"`);
      history.push('/slos');
    } catch (err) {
      const ruler = extractRulerErrorEnvelope(err);
      if (ruler) {
        notifications.toasts.addDanger({
          title: `Ruler rejected the rule group (${ruler.code})`,
          text: ruler.rawBody || ruler.error,
        });
      } else {
        notifications.toasts.addError(err as Error, { title: 'Failed to create SLO' });
      }
    } finally {
      setSubmitting(false);
    }
  }, [apiClient, form, history, notifications]);

  const valid =
    form.name.trim().length > 0 &&
    form.service.trim().length > 0 &&
    form.team.trim().length > 0 &&
    form.datasourceId.trim().length > 0 &&
    form.metric.trim().length > 0 &&
    form.target > 50 &&
    form.target < 100;

  return (
    <EuiPage>
      <EuiPageBody>
        <EuiPageHeader>
          <EuiTitle size="l">
            <h1>Create SLO</h1>
          </EuiTitle>
        </EuiPageHeader>
        <EuiPageContent>
          <EuiForm component="form">
            <EuiFormRow label="Name" fullWidth>
              <EuiFieldText
                value={form.name}
                onChange={(e) => onField('name')(e.target.value)}
                data-test-subj="sloWizardName"
                fullWidth
              />
            </EuiFormRow>
            <EuiFormRow label="Service" fullWidth>
              <EuiFieldText
                value={form.service}
                onChange={(e) => onField('service')(e.target.value)}
                data-test-subj="sloWizardService"
                fullWidth
              />
            </EuiFormRow>
            <EuiFormRow label="Owner team" fullWidth>
              <EuiFieldText
                value={form.team}
                onChange={(e) => onField('team')(e.target.value)}
                data-test-subj="sloWizardTeam"
                fullWidth
              />
            </EuiFormRow>
            <EuiFormRow
              label="Datasource ID"
              helpText="The registered Prometheus / AMP DirectQuery connection."
              fullWidth
            >
              <EuiFieldText
                value={form.datasourceId}
                onChange={(e) => onField('datasourceId')(e.target.value)}
                data-test-subj="sloWizardDatasource"
                fullWidth
              />
            </EuiFormRow>
            <EuiFormRow
              label="Metric"
              helpText="Prometheus counter metric used to compute availability."
              fullWidth
            >
              <EuiFieldText
                value={form.metric}
                onChange={(e) => onField('metric')(e.target.value)}
                data-test-subj="sloWizardMetric"
                fullWidth
              />
            </EuiFormRow>
            <EuiFormRow label="Target (%)" helpText="Between 50 and 99.999." fullWidth>
              <EuiFieldNumber
                value={form.target}
                onChange={(e) => onField('target')(Number(e.target.value))}
                min={50}
                max={99.999}
                step={0.001}
                data-test-subj="sloWizardTarget"
                fullWidth
              />
            </EuiFormRow>
            <EuiFormRow label="Description" fullWidth>
              <EuiTextArea
                value={form.description}
                onChange={(e) => onField('description')(e.target.value)}
                data-test-subj="sloWizardDescription"
                fullWidth
              />
            </EuiFormRow>
            <EuiSpacer />
            <EuiButtonEmpty onClick={() => history.push('/slos')}>Cancel</EuiButtonEmpty>
            <EuiButton
              fill
              isDisabled={!valid || submitting}
              isLoading={submitting}
              onClick={onSubmit}
              data-test-subj="sloWizardSubmit"
            >
              Create
            </EuiButton>
          </EuiForm>
        </EuiPageContent>
      </EuiPageBody>
    </EuiPage>
  );
};
