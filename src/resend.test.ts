import { describe, expect, test } from "bun:test";
import type { EmailDeliveryRequest } from "./delivery.js";
import type { RenderedEmail } from "./presentation/email.js";
import { createResendEmailTransportWithFetch } from "./resend-internal.js";

type CapturedRequest = {
  input: RequestInfo | URL;
  init: RequestInit | undefined;
};
type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function email(overrides: Partial<RenderedEmail> = {}): RenderedEmail {
  return {
    subject: "Pre-Call Brief",
    html: "<p>Brief</p>",
    text: "Brief",
    attachments: [],
    ...overrides,
  };
}

function request(overrides: Partial<EmailDeliveryRequest> = {}): EmailDeliveryRequest {
  return {
    recipient: "trusted@example.test",
    email: email(),
    ...overrides,
  };
}

function successfulFetch(captured: CapturedRequest[], status = 200): TestFetch {
  return async (input, init) => {
    captured.push({ input, init });
    return new Response("provider body must stay private", { status });
  };
}

function jsonBody(captured: CapturedRequest[]): Record<string, unknown> {
  const body = captured[0]?.init?.body;
  if (typeof body !== "string") throw new Error("expected a JSON request body");
  return JSON.parse(body) as Record<string, unknown>;
}

describe("createResendEmailTransport", () => {
  test("rejects blank, whitespace-only, and line-break credentials", () => {
    for (const apiKey of ["", " \t", "key\nvalue", "key\rvalue"]) {
      expect(() =>
        createResendEmailTransportWithFetch(
          { apiKey, from: "briefs@example.test" },
          successfulFetch([]),
        ),
      ).toThrow(TypeError);
    }

    for (const from of ["", " \t", "briefs\n@example.test", "briefs\r@example.test"]) {
      expect(() =>
        createResendEmailTransportWithFetch({ apiKey: "secret-key", from }, successfulFetch([])),
      ).toThrow(TypeError);
    }
  });

  test("maps the exact endpoint, request, bodies, trusted recipient, attachment bytes, and signal", async () => {
    const captured: CapturedRequest[] = [];
    const transport = createResendEmailTransportWithFetch(
      { apiKey: "secret-key", from: "briefs@example.test" },
      successfulFetch(captured),
    );
    const controller = new AbortController();
    const attachmentBytes = Uint8Array.from([0, 255, 10, 128, 34]);
    const requestValue = request({
      recipient: "trusted@example.test",
      email: email({
        html: "<p>\r\nBcc: attacker@example.test ☃</p>",
        text: "Header: not a header\r\nattacker@example.test",
        attachments: [
          {
            filename: "submission.json",
            contentType: "application/json",
            bytes: attachmentBytes,
          },
        ],
      }),
      signal: controller.signal,
    });

    await transport.send(requestValue);

    expect(captured).toHaveLength(1);
    expect(captured[0]?.input).toBe("https://api.resend.com/emails");
    expect(captured[0]?.init?.method).toBe("POST");
    expect(captured[0]?.init?.headers).toEqual({
      Authorization: "Bearer secret-key",
      "Content-Type": "application/json",
    });
    expect(captured[0]?.init?.signal).toBe(controller.signal);

    const payload = jsonBody(captured);
    expect(payload).toEqual({
      from: "briefs@example.test",
      to: ["trusted@example.test"],
      subject: "Pre-Call Brief",
      html: "<p>\r\nBcc: attacker@example.test ☃</p>",
      text: "Header: not a header\r\nattacker@example.test",
      attachments: [
        {
          filename: "submission.json",
          content: "AP8KgCI=",
          content_type: "application/json",
        },
      ],
    });

    const encoded = (payload.attachments as Array<{ content: string }>)[0]?.content;
    if (encoded === undefined) throw new Error("expected attachment content");
    expect(Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))).toEqual(
      attachmentBytes,
    );
  });

  test("omits attachments when the rendered email has none", async () => {
    const captured: CapturedRequest[] = [];
    const transport = createResendEmailTransportWithFetch(
      { apiKey: "secret-key", from: "briefs@example.test" },
      successfulFetch(captured),
    );

    await transport.send(request({ email: email({ attachments: [] }) }));

    const payload = jsonBody(captured);
    expect(Object.hasOwn(payload, "attachments")).toBe(false);
  });

  test("snapshots credentials at factory creation", async () => {
    const captured: CapturedRequest[] = [];
    const options = { apiKey: "original-key", from: "original@example.test" };
    const transport = createResendEmailTransportWithFetch(options, successfulFetch(captured));
    options.apiKey = "mutated-key";
    options.from = "mutated@example.test";

    await transport.send(request());

    const payload = jsonBody(captured);
    expect(payload.from).toBe("original@example.test");
    expect(captured[0]?.init?.headers).toMatchObject({ Authorization: "Bearer original-key" });
  });

  test("rejects non-2xx responses opaquely after one fetch attempt", async () => {
    const captured: CapturedRequest[] = [];
    const transport = createResendEmailTransportWithFetch(
      { apiKey: "secret-key", from: "briefs@example.test" },
      successfulFetch(captured, 422),
    );

    const error = await transport.send(request()).catch((value: unknown) => value);

    expect(captured).toHaveLength(1);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Resend email request failed");
    expect((error as Error).message).not.toContain("secret-key");
    expect((error as Error).message).not.toContain("provider body");
  });

  test("does not attempt fetch when already aborted and propagates the exact reason", async () => {
    const captured: CapturedRequest[] = [];
    const reason = new Error("caller cancelled");
    const controller = new AbortController();
    controller.abort(reason);
    const transport = createResendEmailTransportWithFetch(
      { apiKey: "secret-key", from: "briefs@example.test" },
      successfulFetch(captured),
    );

    await expect(transport.send(request({ signal: controller.signal }))).rejects.toBe(reason);
    expect(captured).toHaveLength(0);
  });

  test("forwards in-flight abort and makes one fetch attempt", async () => {
    const captured: CapturedRequest[] = [];
    const transport = createResendEmailTransportWithFetch(
      { apiKey: "secret-key", from: "briefs@example.test" },
      (async (input, init) => {
        captured.push({ input, init });
        return await new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
        });
      }) satisfies TestFetch,
    );
    const controller = new AbortController();
    const sending = transport.send(request({ signal: controller.signal }));
    controller.abort(new Error("caller cancelled"));

    await expect(sending).rejects.toMatchObject({ message: "caller cancelled" });
    expect(captured).toHaveLength(1);
    expect(captured[0]?.init?.signal).toBe(controller.signal);
  });
});
