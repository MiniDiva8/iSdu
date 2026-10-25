import { runtimeConfig } from '../../config/runtime';

export type CloudInitializationStatus = 'disabled' | 'failed' | 'initialized' | 'unavailable';

let currentStatus: CloudInitializationStatus = 'disabled';

export function initializeCloudForRuntime(): CloudInitializationStatus {
  if (!runtimeConfig.cloudEnabled) {
    currentStatus = 'disabled';
    return currentStatus;
  }

  if (!wx.cloud || typeof wx.cloud.init !== 'function') {
    currentStatus = 'unavailable';
    return currentStatus;
  }

  if (currentStatus === 'initialized') {
    return currentStatus;
  }

  try {
    wx.cloud.init({ traceUser: runtimeConfig.cloudTraceUser });
    currentStatus = 'initialized';
  } catch {
    currentStatus = 'failed';
  }

  return currentStatus;
}

export function getCloudInitializationStatus(): CloudInitializationStatus {
  return currentStatus;
}
