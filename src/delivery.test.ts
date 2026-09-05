import { describe, expect, test } from "bun:test";
import {
  deliverPreCallResult,
  type EmailDeliveryRequest,
  type EmailTransport,
} from "./delivery.js";
import type { RenderedEmail } from "./presentation/email.js";
import type { PreCallResult } from "./result.js";

type SendBehavior = (request: EmailDeliveryRequest) => Promise<void>;

function recordingTransport(behavior: SendBehavior = async () => {}): {
  transport: EmailTransport;
  requests: EmailDeliveryRequest[];
} {
  const requests: EmailDeliveryRequest[] = [];
  const transport: EmailTransport = {
    async send(request) {
      requests.push(request);
      await behavior(request);
    },
  };
  return { transport, requests };
}

function preCallResult(): PreCallResult {
  return {
    request: { original: { goal: "Clarify the launch goal" }, fields: [] },
    analysis: { status: "unavailable", reason: "no_input" },
  };
}

function email(): RenderedEmail {
  return {
    subject: "Pre-Call Brief",
    html: "<p>Brief</p>",
    text: "Brief",
    attachments: [],
  };
}

describe("EmailTransport", () => {
  test("forwards the exact recipient and rendered email in one invocation", async () => {
    const { transport, requests } = recordingTransport();
    const request: EmailDeliveryRequest = {
      recipient: "recipient@example.test",
      email: email(),
    };

    await transport.send(request);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toBe(request);
    expect(requests[0]?.recipient).toBe("recipient@example.test");
    expect(requests[0]?.email).toBe(request.email);
  });

  test("forwards a supplied AbortSignal by identity", async () => {
    const { transport, requests } = recordingTransport();
    const controller = new AbortController();
    const request: EmailDeliveryRequest = {
      recipient: "recipient@example.test",
      email: email(),
      signal: controller.signal,
    };

    await transport.send(request);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.signal).toBe(controller.signal);
  });

  test("leaves an omitted signal absent as an own property", async () => {
    const { transport, requests } = recordingTransport();
    const request: EmailDeliveryRequest = {
      recipient: "recipient@example.test",
      email: email(),
    };

    await transport.send(request);

    expect(requests).toHaveLength(1);
    expect(Object.hasOwn(requests[0] as object, "signal")).toBe(false);
  });
});

describe("deliverPreCallResult", () => {
  test("sends an unavailable result with the default attachment packaging", async () => {
    const { transport, requests } = recordingTransport();
    const result = preCallResult();

    const outcome = await deliverPreCallResult(transport, "recipient@example.test", result);

    expect(outcome).toEqual({ status: "sent" });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.recipient).toBe("recipient@example.test");
    expect(requests[0]?.email.attachments).toHaveLength(1);
    expect(Object.hasOwn(requests[0] as object, "signal")).toBe(false);
  });

  test("forwards false attachment packaging and preserves the trusted recipient verbatim", async () => {
    const { transport, requests } = recordingTransport();
    const recipient = "  trusted@example.test  ";

    const outcome = await deliverPreCallResult(transport, recipient, preCallResult(), {
      attachRawSubmission: false,
    });

    expect(outcome).toEqual({ status: "sent" });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.recipient).toBe(recipient);
    expect(requests[0]?.email.attachments).toEqual([]);
  });

  test("forwards the supplied signal by identity", async () => {
    const { transport, requests } = recordingTransport();
    const controller = new AbortController();

    const outcome = await deliverPreCallResult(
      transport,
      "recipient@example.test",
      preCallResult(),
      undefined,
      controller.signal,
    );

    expect(outcome).toEqual({ status: "sent" });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.signal).toBe(controller.signal);
  });

  test("rejects empty, whitespace-only, and line-break recipients before transport", async () => {
    const { transport, requests } = recordingTransport();

    for (const recipient of ["", " \t\n", "recipient\n@example.test", "recipient\r@example.test"]) {
      await expect(
        deliverPreCallResult(transport, recipient, preCallResult()),
      ).rejects.toBeInstanceOf(TypeError);
    }

    expect(requests).toHaveLength(0);
  });

  test("redacts ordinary transport errors and makes one attempt", async () => {
    const transportError = new Error("provider secret");
    const { transport, requests } = recordingTransport(async () => {
      throw transportError;
    });

    const outcome = await deliverPreCallResult(
      transport,
      "recipient@example.test",
      preCallResult(),
    );

    expect(outcome).toEqual({ status: "failed", reason: "transport_error" });
    expect(requests).toHaveLength(1);
    expect(outcome).not.toBe(transportError);
  });

  test("rethrows the exact pre-aborted reason before recipient validation", async () => {
    const reason = new Error("caller cancelled");
    const controller = new AbortController();
    controller.abort(reason);
    const { transport, requests } = recordingTransport();

    await expect(
      deliverPreCallResult(transport, " \n", preCallResult(), undefined, controller.signal),
    ).rejects.toBe(reason);
    expect(requests).toHaveLength(0);
  });

  test("rethrows the exact reason when a send rejects after abort", async () => {
    const controller = new AbortController();
    const reason = new Error("caller cancelled");
    let rejectSend: ((error?: unknown) => void) | undefined;
    const { transport, requests } = recordingTransport(
      () =>
        new Promise<void>((_, reject) => {
          rejectSend = reject;
        }),
    );
    const delivery = deliverPreCallResult(
      transport,
      "recipient@example.test",
      preCallResult(),
      undefined,
      controller.signal,
    );

    controller.abort(reason);
    if (rejectSend === undefined) throw new Error("send was not started");
    rejectSend(new Error("provider failure"));

    await expect(delivery).rejects.toBe(reason);
    expect(requests).toHaveLength(1);
  });

  test("rethrows the exact reason when a fulfilled send is aborted while pending", async () => {
    const controller = new AbortController();
    const reason = new Error("caller cancelled");
    let resolveSend: (() => void) | undefined;
    const { transport, requests } = recordingTransport(
      () =>
        new Promise<void>((resolve) => {
          resolveSend = resolve;
        }),
    );
    const delivery = deliverPreCallResult(
      transport,
      "recipient@example.test",
      preCallResult(),
      undefined,
      controller.signal,
    );

    controller.abort(reason);
    if (resolveSend === undefined) throw new Error("send was not started");
    resolveSend();

    await expect(delivery).rejects.toBe(reason);
    expect(requests).toHaveLength(1);
  });

  test("rethrows the exact reason when abort occurs as send fulfills", async () => {
    const controller = new AbortController();
    const reason = new Error("caller cancelled");
    const { transport, requests } = recordingTransport(async () => {
      controller.abort(reason);
    });

    const delivery = deliverPreCallResult(
      transport,
      "recipient@example.test",
      preCallResult(),
      undefined,
      controller.signal,
    );

    await expect(delivery).rejects.toBe(reason);
    expect(requests).toHaveLength(1);
  });

  test("does not mutate the result while delivering", async () => {
    const result = preCallResult();
    const snapshot = structuredClone(result);
    const { transport } = recordingTransport();

    await deliverPreCallResult(transport, "recipient@example.test", result);

    expect(result).toEqual(snapshot);
  });
});
