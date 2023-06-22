/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExclusiveUnion } from '@elastic/eui';
import {
  OuiSelectableGroupLabelOption,
  OuiSelectableLIOption,
} from '@elastic/eui/src/components/selectable/selectable_option';

export interface IDatasourceListOption {
  title: string;
}

export interface ISelectedSourceOption {
  title: string;
}

export type IDatasourceSelectableOption = ExclusiveUnion<
  OuiSelectableGroupLabelOption<IDatasourceListOption>,
  OuiSelectableLIOption<IDatasourceListOption>
>;

export interface IDatasourcePickerProps {
  datasourceList: IDatasourceListOption[];
  selectedSource: ISelectedSourceOption;
  onSelect: (selectedSource: ISelectedSourceOption) => void;
  styles?: IDatasourcePickerUIStyles;
}

export interface IDatasourcePickerUIStyles {
  pickerBtnWidth: string;
  sourceSelectorPanelWidth: string;
}
