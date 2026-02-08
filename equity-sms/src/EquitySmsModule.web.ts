import { registerWebModule, NativeModule } from 'expo';

import { EquitySmsModuleEvents } from './EquitySms.types';

class EquitySmsModule extends NativeModule<EquitySmsModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(EquitySmsModule, 'EquitySmsModule');
