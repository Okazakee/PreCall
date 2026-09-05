import type { PreCallResult } from "../result.js";
import { createSubmissionAttachment, type SubmissionAttachment } from "./attachment.js";
import type { RenderedBrief } from "./render.js";
import { renderPreCallResult } from "./render.js";

export type EmailPackagingOptions = {
  attachRawSubmission?: boolean;
};

export type RenderedEmail = {
  subject: "Pre-Call Brief";
  html: string;
  text: string;
  attachments: SubmissionAttachment[];
};

export function createRenderedEmail(
  result: PreCallResult,
  options?: EmailPackagingOptions,
): RenderedEmail {
  const brief: RenderedBrief = renderPreCallResult(result);
  const attachments =
    options?.attachRawSubmission === false ? [] : [createSubmissionAttachment(result)];

  return {
    subject: "Pre-Call Brief",
    html: brief.html,
    text: brief.text,
    attachments,
  };
}
