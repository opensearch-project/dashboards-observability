/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * W4.8 — tombstone badge + explicit confirmation modal.
 *
 * Per the orchestrator's provenance-trust guardrail: never auto-clear a
 * tombstone. Clicking the badge opens a modal requiring the operator to
 * click "I understand this was deliberately deleted" before `onConfirm`
 * is invoked. The Recover call should only be fired from `onConfirm`.
 */

import React, { useState, useCallback } from 'react';
import { EuiBadge, EuiConfirmModal, EuiOverlayMask, EuiText, EuiSpacer } from '@elastic/eui';

export interface TombstoneBadgeProps {
  /** ISO-8601 timestamp of the tombstone. Rendered verbatim (no relative format). */
  createdAt?: string;
  /** Fired when the user accepts the modal confirmation. */
  onConfirm: () => void;
  /** Disable the click/opening behaviour (e.g. while a recover call is in flight). */
  disabled?: boolean;
  /** Optional — identifies this row in the test-subj for disambiguation. */
  testSubjSuffix?: string;
}

function formatTombstoneDate(iso?: string): string {
  if (!iso) return 'Deliberately deleted';
  // Display the date portion to keep the badge readable. Full ISO stays in the modal.
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Deliberately deleted';
  return `Deliberately deleted ${date.toISOString().slice(0, 10)}`;
}

export const TombstoneBadge: React.FC<TombstoneBadgeProps> = ({
  createdAt,
  onConfirm,
  disabled,
  testSubjSuffix,
}) => {
  const [open, setOpen] = useState(false);
  const subj = testSubjSuffix ? `-${testSubjSuffix}` : '';

  const openModal = useCallback(() => {
    if (!disabled) setOpen(true);
  }, [disabled]);
  const closeModal = useCallback(() => setOpen(false), []);
  const accept = useCallback(() => {
    setOpen(false);
    onConfirm();
  }, [onConfirm]);

  return (
    <>
      <EuiBadge
        color="danger"
        iconType="trash"
        onClick={openModal}
        onClickAriaLabel="Review tombstone before recovery"
        data-test-subj={`sloAdoption-tombstoneBadge${subj}`}
        isDisabled={disabled}
      >
        {formatTombstoneDate(createdAt)}
      </EuiBadge>
      {open ? (
        <EuiOverlayMask>
          <EuiConfirmModal
            title="This SLO was deliberately deleted"
            onCancel={closeModal}
            onConfirm={accept}
            cancelButtonText={
              <span data-test-subj={`sloAdoption-tombstoneBadge-cancel${subj}`}>Cancel</span>
            }
            confirmButtonText={
              <span data-test-subj={`sloAdoption-tombstoneBadge-confirm${subj}`}>
                I understand this was deliberately deleted
              </span>
            }
            defaultFocusedButton="cancel"
            buttonColor="danger"
            data-test-subj={`sloAdoption-tombstoneBadge-modal${subj}`}
          >
            <EuiText size="s">
              <p>
                A tombstone was recorded for this SLO
                {createdAt ? <> on {createdAt}</> : null}. Recovering it will re-adopt the existing
                recording rules and clear the tombstone.
              </p>
            </EuiText>
            <EuiSpacer size="s" />
            <EuiText size="s" color="subdued">
              <p>
                Confirm only if you intend to bring the rules back under management — this is not
                the usual path for day-to-day SLO operations.
              </p>
            </EuiText>
          </EuiConfirmModal>
        </EuiOverlayMask>
      ) : null}
    </>
  );
};
