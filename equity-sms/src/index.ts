// Export the native module
export { default as EquitySmsModule } from './EquitySmsModule';

// Export all types
export * from './EquitySms.types';

// Re-export the module as default for convenience
import EquitySmsModule from './EquitySmsModule';
export default EquitySmsModule;

// Legacy exports for backward compatibility
export { default as EquitySmsView } from './EquitySmsView';
