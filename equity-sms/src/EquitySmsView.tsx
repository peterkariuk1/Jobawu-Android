import { requireNativeView } from 'expo';
import * as React from 'react';

import { EquitySmsViewProps } from './EquitySms.types';

const NativeView: React.ComponentType<EquitySmsViewProps> =
  requireNativeView('EquitySms');

export default function EquitySmsView(props: EquitySmsViewProps) {
  return <NativeView {...props} />;
}
