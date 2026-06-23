/**
 * Error codes enumeration
 */
export enum ErrorCode {
  UNKNOWN = 'UNKNOWN',
  ACCOUNT_BALANCES = 'ACCOUNT_BALANCES',
  WDK_MANAGER_INIT = 'WDK_MANAGER_INIT',
  BAD_REQUEST = 'BAD_REQUEST'
}

/**
 * RPC exception payload
 */
export interface RpcExceptionPayload {
  code?: ErrorCode;
  message?: string;
  error: unknown;
}

/**
 * RPC exception response
 */
export interface RpcExceptionResponse {
  code: ErrorCode;
  message: string;
  error: string;
}
