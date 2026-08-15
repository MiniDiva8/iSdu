import { runtimeConfig } from './config/runtime';
import { initializeCloudForRuntime } from './services/cloud/cloud-initializer';

App({
  onLaunch() {
    initializeCloudForRuntime();
  },
  globalData: {
    runtimeMode: runtimeConfig.mode,
  },
});
