import type { EmailDeliveryRequest, EmailTransport } from "./delivery.js";

export type ResendEmailTransportOptions = {
  apiKey: string;
  from: string;
};

type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function validateCredential(name: "apiKey" | "from", value: string): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.includes("\r") ||
    value.includes("\n")
  ) {
    throw new TypeError(`${name} must be non-empty and contain no line breaks`);
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK_SIZE = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    const chunk = bytes.subarray(offset, Math.min(offset + CHUNK_SIZE, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function createPayload(request: EmailDeliveryRequest, from: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    from,
    to: [request.recipient],
    subject: request.email.subject,
    html: request.email.html,
    text: request.email.text,
  };

  if (request.email.attachments.length > 0) {
    payload.attachments = request.email.attachments.map((attachment) => ({
      filename: attachment.filename,
      content: encodeBase64(attachment.bytes),
      content_type: attachment.contentType,
    }));
  }

  return payload;
}

export function createResendEmailTransportWithFetch(
  options: ResendEmailTransportOptions,
  fetchImplementation: FetchImplementation,
): EmailTransport {
  if (typeof options !== "object" || options === null) {
    throw new TypeError("options must be an object");
  }
  if (typeof fetchImplementation !== "function") {
    throw new TypeError("fetchImplementation must be callable");
  }
  validateCredential("apiKey", options.apiKey);
  validateCredential("from", options.from);
  const apiKey = options.apiKey;
  const from = options.from;

  return {
    async send(request) {
      request.signal?.throwIfAborted();
      const response = await fetchImplementation(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createPayload(request, from)),
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      });

      if (!response.ok) {
        throw new Error("Resend email request failed");
      }
    },
  };
}
