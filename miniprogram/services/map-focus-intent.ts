export type MapFocusIntentSource = 'detail' | 'friend-timeline' | 'timeline';

export interface MapFocusIntent {
  readonly mapXRatio: number;
  readonly mapYRatio: number;
  readonly memoryId: string;
  readonly source: MapFocusIntentSource;
}

let pendingIntent: MapFocusIntent | null = null;

export function setMapFocusIntent(intent: MapFocusIntent): void {
  pendingIntent = { ...intent };
}

export function consumeMapFocusIntent(): MapFocusIntent | null {
  const intent = pendingIntent;
  pendingIntent = null;
  return intent;
}
