

export interface FetchOptions extends Omit<any, "signal"> {
  proxy?: string
  headers?: Record<string, string>
  // node-fetch中的signal声明与ts自带的有点冲突，以ts的为准
  signal?: AbortSignal
}

