import {
  createRenderedEmail,
  type EmailPackagingOptions,
  type RenderedEmail,
} from "./presentation/email.js";
import type { PreCallResult } from "./result.js";

export type EmailDeliveryRequest = {
  recipient: string;
  email: RenderedEmail;
  signal?: AbortSignal;
};

export interface EmailTransport {
  send(request: EmailDeliveryRequest): Promise<void>;
}

export type DeliveryOutcome = { status: "sent" } | { status: "failed"; reason: "transport_error" };

export type DeliverPreCallResultRequest = {
  result: PreCallResult;
  recipient: string;
  transport: EmailTransport;
  email?: EmailPackagingOptions;
  signal?: AbortSignal;
};

function validateRecipient(recipient: string): void {
  if (recipient.trim().length === 0 || recipient.includes("\r") || recipient.includes("\n")) {
    throw new TypeError("recipient must be non-empty and contain no line breaks");
  }
}

export async function deliverPreCallResult(
  transport: EmailTransport,
  recipient: string,
  result: PreCallResult,
  emailOptions?: EmailPackagingOptions,
  signal?: AbortSignal,
): Promise<DeliveryOutcome> {
  signal?.throwIfAborted();
  validateRecipient(recipient);

  const email = createRenderedEmail(result, emailOptions);
  signal?.throwIfAborted();

  const request: EmailDeliveryRequest = { recipient, email };
  if (signal !== undefined) request.signal = signal;

  try {
    await transport.send(request);
    signal?.throwIfAborted();
    return { status: "sent" };
  } catch {
    signal?.throwIfAborted();
    return { status: "failed", reason: "transport_error" };
  }
}
