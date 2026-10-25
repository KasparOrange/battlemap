/**
 * The server API seam: typed calls for files, the shared library, game backups and link fetch.
 * `api` is the app's client for the configured server; `createApi` builds one for tests or
 * another server.
 *
 * @see ./client.ts for the routes and the behaviour (timeouts, retries, logging)
 */
import { appConfig } from '../config.ts';
import { log } from '../log.ts';
import { createApi, type Api } from './client.ts';

export { createApi, DEFAULT_TIMEOUTS } from './client.ts';
export type { Api, ApiOptions, ApiTimeouts, BackupApi, FetchedLink, LibraryApi, StoreAs, UploadOptions, UploadResult } from './client.ts';
export { ApiError, describeError } from './errors.ts';
export type { ApiErrorKind } from './errors.ts';
export { DEFAULT_RETRY } from './retry.ts';
export type { RetryPolicy } from './retry.ts';
export { defaultTransport, fetchTransport, xhrTransport } from './transport.ts';
export type { HttpRequest, HttpResponse, Progress, Transport } from './transport.ts';

/** The app's API client, for the server in `appConfig().serverUrl`. */
export const api: Api = createApi({ serverUrl: appConfig().serverUrl, log });
