import type {
  CallMethodRequest,
  CallMethodResponse,
  DisposeRequest,
  LogRequest,
  WorkletStartRequest,
  WorkletStartResponse,
} from './rpc';

export interface RPCStream {
  data?: unknown;
  [key: string]: unknown;
}

export interface RPCRequestStream {
  [key: string]: unknown;
}

export class HRPC {
  constructor(stream: unknown);

  log(args: LogRequest): void;
  workletStart(args: WorkletStartRequest): Promise<WorkletStartResponse>;
  dispose(args: DisposeRequest): void;
  callMethod(args: CallMethodRequest): Promise<CallMethodResponse>;

  onLog(responseFn: (request: LogRequest) => void | Promise<void>): void;
  onWorkletStart(
    responseFn: (request: WorkletStartRequest) => WorkletStartResponse | Promise<WorkletStartResponse>,
  ): void;
  onDispose(responseFn: (request: DisposeRequest) => void | Promise<void>): void;
  onCallMethod(
    responseFn: (request: CallMethodRequest) => CallMethodResponse | Promise<CallMethodResponse>,
  ): void;
}

export default HRPC;
