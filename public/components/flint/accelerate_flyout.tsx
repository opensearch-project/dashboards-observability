/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import _ from 'lodash';
import {
  EuiFlyout,
  EuiFlyoutBody,
} from '@elastic/eui';
import React, { useState } from 'react';
import { Accelerate } from './accelerate_page';

interface AccelerateFlyoutProps {
  onClose: () => void;
}

export function AccelerateFlyout(props: AccelerateFlyoutProps) {
  return (
    <EuiFlyout data-test-subj="accelerateFlyout" onClose={props.onClose} size="m">
        <Accelerate isFlyout={true}/>
    </EuiFlyout>
  );
}
