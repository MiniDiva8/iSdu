import type { CloudImageUploadPlan, UploadedCloudImage } from '../../models/cloud-memory';
import { initializeCloudForRuntime } from './cloud-initializer';

export interface CloudImageServiceApi {
  uploadPlannedFiles(
    plan: CloudImageUploadPlan,
    localPaths: readonly string[],
  ): Promise<UploadedCloudImage[]>;
}

export class CloudImageService implements CloudImageServiceApi {
  async uploadPlannedFiles(
    plan: CloudImageUploadPlan,
    localPaths: readonly string[],
  ): Promise<UploadedCloudImage[]> {
    if (plan.files.length !== localPaths.length) {
      throw new Error('云端图片上传计划与本地照片数量不一致');
    }

    if (Date.parse(plan.expiresAt) <= Date.now()) {
      throw new Error('云端图片上传计划已过期，请重试');
    }

    if (initializeCloudForRuntime() !== 'initialized') {
      throw new Error('云能力尚未就绪，无法上传照片');
    }

    const uploaded: UploadedCloudImage[] = [];
    for (const [index, target] of plan.files.entries()) {
      const filePath = localPaths[index];
      if (!filePath) {
        throw new Error('本地照片路径缺失');
      }

      try {
        const result = await wx.cloud.uploadFile({ cloudPath: target.cloudPath, filePath });
        uploaded.push({ fileId: result.fileID, imageId: target.imageId });
      } catch {
        throw new Error(`第 ${index + 1} 张照片上传失败，已上传文件将由云端过期清理`);
      }
    }

    return uploaded;
  }
}

export const cloudImageService = new CloudImageService();
