import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export async function invokeBackend<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return invoke<T>(command, args)
}

export function hasTauriBackend() {
  return isTauri()
}

export async function listenBackendEvent<T>(
  eventName: string,
  handler: (payload: T) => void,
) {
  if (!hasTauriBackend()) {
    return () => undefined
  }

  return listen<T>(eventName, (event) => {
    handler(event.payload)
  })
}
