/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Wizard-side preview of the Prometheus rule group that will be deployed.
 *
 * Calls the server `/preview` endpoint with a debounced input so typing in the
 * wizard doesn't generate a request per keystroke. The server runs the same
 * `generateSloRuleGroup` as the deploy path — what the preview shows is what
 * will land in the ruler.
 *
 * The server response carries the rendered YAML on `yaml`; this component
 * renders it verbatim rather than recomputing client-side.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { i18n } from '@osd/i18n';
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
import type { GeneratedRuleGroup, SloCreateInput } from '../../../../../common/slo/slo_types';
import type { SloApiClient } from './slo_api_client';
import { findSectionForKey, scrollToErrorKey } from './wizard_sections';

const I18N = {
  heading: i18n.translate('observability.slo.rulesPreview.heading', {
    defaultMessage: 'Rule preview',
  }),
  description: i18n.translate('observability.slo.rulesPreview.description', {
    defaultMessage: 'The Prometheus rule group that will be deployed when you click Create.',
  }),
  generating: i18n.translate('observability.slo.rulesPreview.generating', {
    defaultMessage: 'Generating preview…',
  }),
  errorTitle: i18n.translate('observability.slo.rulesPreview.errorTitle', {
    defaultMessage: 'Preview unavailable',
  }),
  errorFallback: i18n.translate('observability.slo.rulesPreview.errorFallback', {
    defaultMessage: 'Unable to generate preview.',
  }),
  ruleSingular: i18n.translate('observability.slo.rulesPreview.ruleSingular', {
    defaultMessage: 'rule',
  }),
  rulePlural: i18n.translate('observability.slo.rulesPreview.rulePlural', {
    defaultMessage: 'rules',
  }),
  ruleCount: (count: number, ruleWord: string) =>
    i18n.translate('observability.slo.rulesPreview.ruleCount', {
      defaultMessage: '{count} {ruleWord}',
      values: { count, ruleWord },
    }),
  namespacePrefix: i18n.translate('observability.slo.rulesPreview.namespacePrefix', {
    defaultMessage: 'namespace',
  }),
  evalInterval: (interval: number) =>
    i18n.translate('observability.slo.rulesPreview.evalInterval', {
      defaultMessage: 'eval interval {interval}s',
      values: { interval },
    }),
  yamlToggle: i18n.translate('observability.slo.rulesPreview.yamlToggle', {
    defaultMessage: 'Show rule-group YAML',
  }),
  emptyTitle: i18n.translate('observability.slo.rulesPreview.emptyTitle', {
    defaultMessage: 'Preview renders once the form is valid',
  }),
  missingHeader: i18n.translate('observability.slo.rulesPreview.missingHeader', {
    defaultMessage: 'Missing or invalid fields:',
  }),
  pickTemplate: i18n.translate('observability.slo.rulesPreview.pickTemplate', {
    defaultMessage: 'Pick a template to start building the rule set.',
  }),
  fillRequired: i18n.translate('observability.slo.rulesPreview.fillRequired', {
    defaultMessage: 'Fill in the required fields to see the generated rules.',
  }),
  serverMessage: (serverMessage: string) =>
    i18n.translate('observability.slo.rulesPreview.serverMessage', {
      defaultMessage: 'Server message: {serverMessage}',
      values: { serverMessage },
    }),
};

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
        setState({ status: 'error', error: message });
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient, debouncedSerialized]);

  return (
    <EuiPanel data-test-subj="slosWizardPreview">
      <EuiText size="m">
        <h4>{I18N.heading}</h4>
      </EuiText>
      <EuiText size="s" color="subdued">
        {I18N.description}
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
            {I18N.generating}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }
  if (state.status === 'error') {
    // Server-side validation failures (400-class) route to the same empty-state
    // prompt so the fix path is consistent with "form isn't valid yet". Genuine
    // upstream failures (ruler unreachable, 5xx) keep the warning callout.
    if (isValidationStyleError(state.error)) {
      return renderEmptyPrompt(input, errors, state.error);
    }
    return (
      <EuiCallOut
        title={I18N.errorTitle}
        color="warning"
        iconType="alert"
        size="s"
        data-test-subj="slosWizardPreviewError"
      >
        <EuiText size="s">{state.error ?? I18N.errorFallback}</EuiText>
      </EuiCallOut>
    );
  }
  const group = state.group!;
  return (
    <div data-test-subj="slosWizardPreviewSuccess">
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiBadge color="primary" data-test-subj="slosWizardPreviewRuleCount">
            {I18N.ruleCount(
              group.rules.length,
              group.rules.length === 1 ? I18N.ruleSingular : I18N.rulePlural
            )}
          </EuiBadge>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="s" data-test-subj="slosWizardPreviewGroupName">
            <code>{group.groupName}</code>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued" data-test-subj="slosWizardPreviewNamespace">
            {I18N.namespacePrefix} <code>{group.rulerNamespace}</code>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            {I18N.evalInterval(group.interval)}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiAccordion
        id="slosWizardPreviewYaml"
        buttonContent={I18N.yamlToggle}
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

function isValidationStyleError(msg: string | undefined): boolean {
  if (!msg) return false;
  return /bad request|400|validation/i.test(msg);
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
          {I18N.missingHeader}
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
        {input === null ? I18N.pickTemplate : I18N.fillRequired}
      </EuiText>
    );
  return (
    <EuiEmptyPrompt
      iconType="inspect"
      titleSize="xs"
      title={<h4>{I18N.emptyTitle}</h4>}
      body={
        <>
          {body}
          {serverMessage && (
            <>
              <EuiSpacer size="s" />
              <EuiText size="xs" color="subdued" data-test-subj="slosWizardPreviewServerMsg">
                {I18N.serverMessage(serverMessage)}
              </EuiText>
            </>
          )}
        </>
      }
      data-test-subj="slosWizardPreviewEmpty"
    />
  );
}
