import { initializeCloudForRuntime } from './cloud-initializer';

export type CloudFunctionPayload = Readonly<Record<string, unknown>>;

export interface CloudFunctionClient {
  call(functionName: string, action: string, payload?: CloudFunctionPayload): Promise<unknown>;
}

export class CloudFunctionClientError extends Error {
  readonly code:
    'CLOUD_DISABLED' | 'CLOUD_UNAVAILABLE' | 'FUNCTION_CALL_FAILED' | 'FUNCTION_NOT_FOUND';

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
    } catch (error: unknown) {
      const detail =
        typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {};
      const code = typeof detail.code === 'string' ? detail.code : '';
      const message =
        typeof detail.errMsg === 'string'
          ? detail.errMsg
          : typeof detail.message === 'string'
            ? detail.message
            : '';
      const explicitlyMissing =
        /\b(?:FUNCTIONS?_NOT_FOUND|ResourceNotFound\.Function(?:Name)?)\b/iu.test(
          code + ' ' + message,
        ) ||
        /\bFunctionName\s+(?:parameter\s+)?could not be found\b/iu.test(message) ||
        /\bfunction\s+(?:[\w-]+\s+)?(?:not found|does not exist)\b/iu.test(message) ||
        /云函数不存在|未找到指定云函数/iu.test(message);
      if (explicitlyMissing) {
        throw new CloudFunctionClientError(
          'FUNCTION_NOT_FOUND',
          '云端功能尚未部署，请联系管理员完成配置',
        );
      }
      throw new CloudFunctionClientError('FUNCTION_CALL_FAILED', '云端服务暂时不可用，请稍后重试');
    }
  }
}

export const wechatCloudFunctionClient = new WechatCloudFunctionClient();
