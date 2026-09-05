import type { EmailTransport } from "./delivery.js";
import {
  createResendEmailTransportWithFetch,
  type ResendEmailTransportOptions,
} from "./resend-internal.js";

export type { ResendEmailTransportOptions } from "./resend-internal.js";

/** Creates a provider-neutral EmailTransport backed by Resend's fixed email endpoint. */
export function createResendEmailTransport(options: ResendEmailTransportOptions): EmailTransport {
  return createResendEmailTransportWithFetch(options, fetch);
}
