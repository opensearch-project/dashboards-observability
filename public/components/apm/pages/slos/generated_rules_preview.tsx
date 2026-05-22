/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Wizard-side preview of the Prometheus rule group that will be deployed.
 *
 * Calls the server `/preview` endpoint with a debounced input so typing in the
 * wizard doesn't generate a request per keystroke. The server runs the same
 * `generateSloRuleGroup` as the deploy path — what the preview shows is
 * what will land in the ruler.
 *
 * The server response carries the rendered YAML on `yaml`; this component
 * renders it verbatim rather than recomputing client-side.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiCallOut,
  EuiCodeBlock,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import type { GeneratedRuleGroup, SloCreateInput } from '../../../../../common/slo/slo_types';
import { SLO_RULER_NAMESPACE } from '../../../../../common/slo/slo_promql_generator';
import type { SloApiClient } from './slo_api_client';
import { findSectionForKey, scrollToErrorKey } from './wizard_sections';

export const PREVIEW_DEBOUNCE_MS = 500;

export interface GeneratedRulesPreviewProps {
  apiClient: Pick<SloApiClient, 'preview'>;
  /**
   * Current wizard input. Pass `null` when the form isn't yet ready for
   * preview (e.g. no template selected); the component will render a hint.
   */
  input: SloCreateInput | null;
  /**
   * Live client-side validation errors keyed by validator path. When set,
   * the empty-state prompt lists the missing fields as clickable links that
   * scroll the user to the right section.
   */
  errors?: Record<string, string>;
}

interface PreviewState {
  status: 'idle' | 'loading' | 'success' | 'error';
  group?: GeneratedRuleGroup;
  error?: string;
  /**
   * `true` when the catch payload was structurally a validation envelope
   * (`body.error === 'Validation failed'` or `body.errors` shaped like
   * `Record<string,string>` from the route). Detected at the catch site
   * so the renderer doesn't substring-match `error.message`, which would
   * misclassify any 5xx whose body happens to mention "validation".
   */
  isValidation?: boolean;
}

const INITIAL: PreviewState = { status: 'idle' };

export const GeneratedRulesPreview: React.FC<GeneratedRulesPreviewProps> = ({
  apiClient,
  input,
  errors,
}) => {
  // Debounce on the serialized input so equivalent objects don't retrigger
  // fetches (stable JSON → stable effect dep). Unlike useDebouncedValue, we
  // never seed the debounced value from the initial prop — the first preview
  // request should wait out the debounce window just like subsequent ones.
  const serialized = useMemo(() => (input ? JSON.stringify(input) : null), [input]);
  const [debouncedSerialized, setDebouncedSerialized] = useState<string | null>(null);
  const [state, setState] = useState<PreviewState>(INITIAL);

  useEffect(() => {
    if (serialized === null) {
      setDebouncedSerialized(null);
      return;
    }
    const t = setTimeout(() => setDebouncedSerialized(serialized), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [serialized]);

  useEffect(() => {
    if (!debouncedSerialized) {
      setState(INITIAL);
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    apiClient
      .preview(JSON.parse(debouncedSerialized) as SloCreateInput)
      .then((group) => {
        if (cancelled) return;
        setState({ status: 'success', group });
      })
      .catch((e) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        setState({ status: 'error', error: message, isValidation: isValidationEnvelope(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient, debouncedSerialized]);

  return (
    <EuiPanel data-test-subj="slosWizardPreview">
      <EuiText size="m">
        <h4>
          {i18n.translate('observability.apm.slo.wizard.rulesPreview.heading', {
            defaultMessage: 'Rule preview',
          })}
        </h4>
      </EuiText>
      <EuiText size="s" color="subdued">
        {i18n.translate('observability.apm.slo.wizard.rulesPreview.description', {
          defaultMessage: 'The Prometheus rule group that will be deployed when you click Create.',
        })}
      </EuiText>
      <EuiSpacer size="s" />
      {renderBody(state, input, errors ?? {})}
    </EuiPanel>
  );
};

function renderBody(
  state: PreviewState,
  input: SloCreateInput | null,
  errors: Record<string, string>
): JSX.Element {
  if (state.status === 'idle') {
    return renderEmptyPrompt(input, errors);
  }
  if (state.status === 'loading') {
    return (
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiLoadingSpinner size="m" data-test-subj="slosWizardPreviewLoading" />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="s" color="subdued">
            {i18n.translate('observability.apm.slo.wizard.rulesPreview.generating', {
              defaultMessage: 'Generating preview…',
            })}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }
  if (state.status === 'error') {
    // Server-side validation failures (400-class) route to the same empty-state
    // prompt so the fix path is consistent with "form isn't valid yet". Genuine
    // upstream failures (ruler unreachable, 5xx) keep the warning callout.
    if (state.isValidation) {
      return renderEmptyPrompt(input, errors, state.error);
    }
    return (
      <EuiCallOut
        title={i18n.translate('observability.apm.slo.wizard.rulesPreview.errorTitle', {
          defaultMessage: 'Preview unavailable',
        })}
        color="warning"
        iconType="alert"
        size="s"
        data-test-subj="slosWizardPreviewError"
      >
        <EuiText size="s">
          {state.error ??
            i18n.translate('observability.apm.slo.wizard.rulesPreview.errorFallback', {
              defaultMessage: 'Unable to generate preview.',
            })}
        </EuiText>
      </EuiCallOut>
    );
  }
  const group = state.group!;
  return (
    <div data-test-subj="slosWizardPreviewSuccess">
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiBadge color="primary" data-test-subj="slosWizardPreviewRuleCount">
            {i18n.translate('observability.apm.slo.wizard.rulesPreview.ruleCount', {
              defaultMessage: '{count, plural, one {# rule} other {# rules}}',
              values: { count: group.rules.length },
            })}
          </EuiBadge>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="s" data-test-subj="slosWizardPreviewGroupName">
            <code>{group.groupName}</code>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued" data-test-subj="slosWizardPreviewNamespace">
            {i18n.translate('observability.apm.slo.wizard.rulesPreview.namespacePrefix', {
              defaultMessage: 'namespace ',
            })}
            <code>{SLO_RULER_NAMESPACE}</code>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            {i18n.translate('observability.apm.slo.wizard.rulesPreview.evalInterval', {
              defaultMessage: 'eval interval {interval}s',
              values: { interval: group.interval },
            })}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiAccordion
        id="slosWizardPreviewYaml"
        buttonContent={i18n.translate('observability.apm.slo.wizard.rulesPreview.showYamlButton', {
          defaultMessage: 'Show rule-group YAML',
        })}
        paddingSize="s"
        data-test-subj="slosWizardPreviewYamlToggle"
      >
        <EuiCodeBlock
          language="yaml"
          paddingSize="s"
          isCopyable
          overflowHeight={320}
          data-test-subj="slosWizardPreviewYaml"
        >
          {group.yaml}
        </EuiCodeBlock>
      </EuiAccordion>
    </div>
  );
}

/**
 * Detect a route-shaped validation envelope. The OSD HTTP client wraps a
 * 400 from `res.customError({ statusCode: 400, body: { ... } })` as an
 * IHttpFetchError with `.body` matching the route's body. Our SLO route
 * emits `{ error: 'Validation failed', errors: Record<string,string> }`
 * for SloValidationError. Substring-matching the message string is fragile
 * — any 5xx whose body mentions "validation" would slip through. Inspect
 * the structured shape instead.
 */
function isValidationEnvelope(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const rec = e as { body?: unknown; response?: { status?: number } };
  const body = rec.body as
    | { error?: unknown; errors?: unknown; attributes?: { errors?: unknown } }
    | undefined;
  if (!body || typeof body !== 'object') return false;
  if (body.error === 'Validation failed') return true;
  if (body.errors && typeof body.errors === 'object' && !Array.isArray(body.errors)) {
    return true;
  }
  if (
    body.attributes &&
    typeof body.attributes === 'object' &&
    body.attributes.errors &&
    typeof body.attributes.errors === 'object'
  ) {
    return true;
  }
  return false;
}

function renderEmptyPrompt(
  input: SloCreateInput | null,
  errors: Record<string, string>,
  serverMessage?: string
): JSX.Element {
  const missingEntries = Object.entries(errors);
  const body =
    missingEntries.length > 0 ? (
      <>
        <EuiText size="s" color="subdued">
          {i18n.translate('observability.apm.slo.wizard.rulesPreview.missingFieldsLabel', {
            defaultMessage: 'Missing or invalid fields:',
          })}
        </EuiText>
        <ul data-test-subj="slosWizardPreviewMissingList">
          {missingEntries.map(([key, msg]) => {
            const section = findSectionForKey(key);
            return (
              <li key={key}>
                <EuiLink
                  onClick={() => scrollToErrorKey(key)}
                  data-test-subj={`slosWizardPreviewMissing-${key}`}
                >
                  <strong>{section?.label ?? key}:</strong> {msg}
                </EuiLink>
              </li>
            );
          })}
        </ul>
      </>
    ) : (
      <EuiText size="s" color="subdued">
        {input === null
          ? i18n.translate('observability.apm.slo.wizard.rulesPreview.pickTemplate', {
              defaultMessage: 'Pick a template to start building the rule set.',
            })
          : i18n.translate('observability.apm.slo.wizard.rulesPreview.fillFields', {
              defaultMessage: 'Fill in the required fields to see the generated rules.',
            })}
      </EuiText>
    );
  return (
    <EuiEmptyPrompt
      iconType="inspect"
      titleSize="xs"
      title={
        <h4>
          {i18n.translate('observability.apm.slo.wizard.rulesPreview.emptyTitle', {
            defaultMessage: 'Preview renders once the form is valid',
          })}
        </h4>
      }
      body={
        <>
          {body}
          {serverMessage && (
            <>
              <EuiSpacer size="s" />
              <EuiText size="xs" color="subdued" data-test-subj="slosWizardPreviewServerMsg">
                {i18n.translate('observability.apm.slo.wizard.rulesPreview.serverMessage', {
                  defaultMessage: 'Server message: {message}',
                  values: { message: serverMessage },
                })}
              </EuiText>
            </>
          )}
        </>
      }
      data-test-subj="slosWizardPreviewEmpty"
    />
  );
}
