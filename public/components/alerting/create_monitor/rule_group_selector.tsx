/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * RuleGroupSelector — the shared rule group combo box used by both the
 * Alert Manager "Create metrics rule" flyout and the Metrics page
 * "Create alert rule" flyout.
 *
 * Offers existing rule groups (fetched live from the datasource's ruler)
 * as dropdown options and lets the user type a new name to create one.
 */
import React, { useEffect, useState } from 'react';
import { EuiComboBox } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { AlertingPromResourcesService } from '../query_services/alerting_prom_resources_service';

export const RuleGroupSelector: React.FC<{
  /** Datasource to fetch existing rule group names from. */
  datasourceId?: string;
  /** Currently selected/typed group name ('' = none). */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  fullWidth?: boolean;
  'data-test-subj'?: string;
}> = ({ datasourceId, value, onChange, placeholder, fullWidth = true, ...rest }) => {
  const [options, setOptions] = useState<Array<{ label: string }>>([]);

  // Fetch existing rule groups when the datasource changes. The `stale`
  // flag guards against out-of-order responses; the try/catch tolerates
  // environments without an http client (the dropdown is progressive
  // enhancement — typing a new group name always works).
  useEffect(() => {
    if (!datasourceId) return;
    let stale = false;
    try {
      const service = new AlertingPromResourcesService(datasourceId);
      service
        .listRuleGroupNames()
        .then(({ groups }) => {
          if (!stale) setOptions(groups.map((g) => ({ label: g })));
        })
        .catch(() => {
          /* non-critical — user can still type a new group name */
        });
    } catch (_e) {
      /* http client unavailable — same fallback */
    }
    return () => {
      stale = true;
    };
  }, [datasourceId]);

  return (
    <EuiComboBox
      placeholder={
        placeholder ||
        i18n.translate('observability.alerting.ruleGroupSelector.placeholder', {
          defaultMessage: 'Enter a rule group name (defaults to rule name)',
        })
      }
      options={options}
      selectedOptions={value ? [{ label: value }] : []}
      onChange={(opts) => onChange(opts.length > 0 ? opts[0].label : '')}
      onCreateOption={(created) => onChange(created)}
      singleSelection={{ asPlainText: true }}
      compressed
      isClearable
      fullWidth={fullWidth}
      // Double templating on purpose: i18n substitutes the literal
      // '{searchValue}' back in, yielding the exact template string
      // EUI interpolates with the user's typed text at render time.
      customOptionText={i18n.translate('observability.alerting.ruleGroupSelector.createOption', {
        defaultMessage: 'Create group: {searchValue}',
        values: { searchValue: '{searchValue}' },
      })}
      {...rest}
    />
  );
};
