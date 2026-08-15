import { initializeCloudForRuntime } from './cloud-initializer';

export type CloudFunctionPayload = Readonly<Record<string, unknown>>;

export interface CloudFunctionClient {
  call(functionName: string, action: string, payload?: CloudFunctionPayload): Promise<unknown>;
}

export class CloudFunctionClientError extends Error {
  readonly code: 'CLOUD_DISABLED' | 'CLOUD_UNAVAILABLE' | 'FUNCTION_CALL_FAILED';

  constructor(code: CloudFunctionClientError['code'], message: string) {
    super(message);
    this.name = 'CloudFunctionClientError';
    this.code = code;
  }
}

export class WechatCloudFunctionClient implements CloudFunctionClient {
  async call(
    functionName: string,
    action: string,
    payload: CloudFunctionPayload = {},
  ): Promise<unknown> {
    const status = initializeCloudForRuntime();

    if (status === 'disabled') {
      throw new CloudFunctionClientError('CLOUD_DISABLED', '云端模式尚未启用');
    }

    if (status !== 'initialized') {
      throw new CloudFunctionClientError('CLOUD_UNAVAILABLE', '当前微信环境无法初始化云能力');
    }

    try {
      const response = await wx.cloud.callFunction({
        name: functionName,
        data: { action, payload },
      });
      return response.result;
    } catch {
      throw new CloudFunctionClientError('FUNCTION_CALL_FAILED', '云端服务暂时不可用，请稍后重试');
    }
  }
}

export const wechatCloudFunctionClient = new WechatCloudFunctionClient();
