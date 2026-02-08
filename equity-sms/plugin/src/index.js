const { withAndroidManifest, withPlugins } = require('@expo/config-plugins');

/**
 * Expo Config Plugin for Equity SMS Module.
 * Adds required permissions and receivers to the main app's Android manifest.
 */
function withEquitySmsPermissions(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application?.[0];

    if (!mainApplication) {
      console.warn('No application found in AndroidManifest.xml');
      return config;
    }

    // Ensure uses-permission array exists
    if (!androidManifest.manifest['uses-permission']) {
      androidManifest.manifest['uses-permission'] = [];
    }

    // Required permissions for SMS listening
    const permissions = [
      'android.permission.RECEIVE_SMS',
      'android.permission.READ_SMS',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
      'android.permission.WAKE_LOCK',
    ];

    // Add permissions if not already present
    permissions.forEach((permission) => {
      const exists = androidManifest.manifest['uses-permission'].some(
        (p) => p.$?.['android:name'] === permission
      );
      
      if (!exists) {
        androidManifest.manifest['uses-permission'].push({
          $: { 'android:name': permission },
        });
      }
    });

    return config;
  });
}

/**
 * Main plugin export.
 * Can be extended with additional configuration options.
 */
module.exports = function withEquitySms(config, props = {}) {
  return withPlugins(config, [
    withEquitySmsPermissions,
  ]);
};
