export enum LogType {
  INFO = 1,
  ERROR = 2,
  DEBUG = 3,
}

export interface LogRequest {
  type?: LogType;
  data?: string | null;
}

export interface WorkletStartRequest {
  enableDebugLogs?: number;
  seedPhrase?: string | null;
  seedBuffer?: string | null;
  config: string;
}

export interface WorkletStartResponse {
  status?: string | null;
}

export interface DisposeRequest {}

export interface CallMethodRequest {
  methodName: string;
  network: string;
  accountIndex: number;
  args?: string | null;
}

export interface CallMethodResponse {
  result?: string | null;
}

export interface NetworkConfigs {
  [networkName: string]: unknown;
}
