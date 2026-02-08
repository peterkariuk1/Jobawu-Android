import * as React from 'react';

import { EquitySmsViewProps } from './EquitySms.types';

export default function EquitySmsView(props: EquitySmsViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
