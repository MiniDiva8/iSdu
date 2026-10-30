import { memoryService } from './services/memory-service';
import { cloudModeService } from './services/cloud/cloud-mode-service';
import { runtimeConfig } from './config/runtime';
import { initializeCloudForRuntime } from './services/cloud/cloud-initializer';

App({
  onLaunch() {
    initializeCloudForRuntime();
    try {
      if (cloudModeService.getState().mode === 'cloud') {
        // Start the same deduplicated read used by the first page while its view is created.
        void memoryService.listMemories().catch(() => undefined);
      }
    } catch {
      // Prefetch is optional; a storage failure must not prevent the app from launching.
    }
  },
  globalData: {
    runtimeMode: runtimeConfig.mode,
  },
});
