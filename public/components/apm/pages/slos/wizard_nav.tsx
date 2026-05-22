/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sticky left-rail anchor nav for the create wizard. One entry per visible
 * section; an IntersectionObserver tracks which section's panel is closest
 * to the top of the viewport so the corresponding entry is marked selected.
 *
 * Scroll-to-section is `scrollIntoView({ behavior: 'smooth', block: 'start' })`
 * against the section's anchor element (the wrapper `<div id={anchorId}>`
 * emitted around each panel in slo_wizard_page.tsx).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiIcon, EuiSideNav } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import {
  WIZARD_SECTIONS,
  WizardSection,
  WizardSectionId,
  sectionsWithErrors,
} from './wizard_sections';

export interface WizardNavProps {
  errors: Record<string, string>;
  /**
   * Section ids whose panels are currently mounted. PromQL and Exclusion
   * Windows are conditional; excluded ids won't render a nav entry.
   */
  visibleSectionIds: readonly WizardSectionId[];
}

const SCROLL_OFFSET_PX = 16;

export const WizardNav: React.FC<WizardNavProps> = ({ errors, visibleSectionIds }) => {
  const sections = useMemo(() => WIZARD_SECTIONS.filter((s) => visibleSectionIds.includes(s.id)), [
    visibleSectionIds,
  ]);
  const [activeId, setActiveId] = useState<WizardSectionId | null>(null);
  const errorSections = useMemo(() => sectionsWithErrors(errors), [errors]);

  useScrollSpy(sections, setActiveId);

  const onPick = useCallback((section: WizardSection) => {
    const el = document.getElementById(section.anchorId);
    if (!el) return;
    // CSS `scroll-margin-top` on the anchor (set in slo_wizard_page.tsx)
    // gives us the offset for free without firing a second scrollBy that
    // races the smooth-scroll already in flight.
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const items = sections.map((section) => {
    const hasError = errorSections.has(section.id);
    return {
      id: section.id,
      name: (
        <EuiFlexGroup
          gutterSize="xs"
          alignItems="center"
          responsive={false}
          data-test-subj={`slosWizardNavItem-${section.id}`}
        >
          {hasError && (
            <EuiFlexItem grow={false}>
              <EuiIcon
                type="alert"
                color="danger"
                size="s"
                data-test-subj={`slosWizardNavError-${section.id}`}
              />
            </EuiFlexItem>
          )}
          <EuiFlexItem grow={false}>{section.label}</EuiFlexItem>
        </EuiFlexGroup>
      ),
      isSelected: activeId === section.id,
      onClick: () => onPick(section),
      'data-test-subj': `slosWizardNavItemRoot-${section.id}`,
    };
  });

  return (
    <div
      data-test-subj="slosWizardNav"
      style={{
        position: 'sticky',
        top: 8,
        alignSelf: 'flex-start',
        width: 180,
      }}
    >
      <EuiSideNav
        aria-label={i18n.translate('observability.apm.slo.wizard.nav.ariaLabel', {
          defaultMessage: 'SLO wizard sections',
        })}
        items={[
          {
            id: 'slosWizardNavRoot',
            name: i18n.translate('observability.apm.slo.wizard.nav.rootName', {
              defaultMessage: 'Sections',
            }),
            items,
          },
        ]}
      />
    </div>
  );
};

/**
 * Watch the section anchors and pick the one closest to the viewport top. A
 * small debounce keeps the selected indicator from thrashing while the user
 * scrolls fast.
 */
function useScrollSpy(
  sections: readonly WizardSection[],
  setActive: (id: WizardSectionId | null) => void
) {
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (sections.length === 0) return;

    const computeActive = () => {
      let best: { id: WizardSectionId; distance: number } | null = null;
      for (const section of sections) {
        const el = document.getElementById(section.anchorId);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        // Pick the section whose top edge is closest to (and not below) the
        // visual header — a section that is scrolled just past the top beats
        // the next one sitting halfway down the viewport.
        const top = rect.top - SCROLL_OFFSET_PX;
        const distance = top <= 0 ? -top : Number.POSITIVE_INFINITY;
        if (best === null || distance < best.distance) {
          best = { id: section.id, distance };
        }
      }
      // Nothing has scrolled past yet: default to the first section.
      if (best === null || best.distance === Number.POSITIVE_INFINITY) {
        setActive(sections[0].id);
      } else {
        setActive(best.id);
      }
    };

    const schedule = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        computeActive();
      });
    };

    computeActive();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [sections, setActive]);
}
