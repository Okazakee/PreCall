import type { PreCallResult } from "../result.js";

export type SubmissionAttachment = {
  filename: "submission.json";
  contentType: "application/json";
  bytes: Uint8Array;
};

const JSON_INDENT = 2;
const TEXT_ENCODER = new TextEncoder();

export function createSubmissionAttachment(result: PreCallResult): SubmissionAttachment {
  const members: string[] = [];
  for (const field of result.request.fields) {
    if (field.includeInOutput !== true) continue;

    const serializedValue = JSON.stringify(field.value, null, JSON_INDENT);
    if (serializedValue === undefined) continue;
    members.push(`  ${JSON.stringify(field.key)}: ${serializedValue.replace(/\n/g, "\n  ")}`);
  }

  const json = members.length === 0 ? "{}\n" : `{\n${members.join(",\n")}\n}\n`;
  return {
    filename: "submission.json",
    contentType: "application/json",
    bytes: TEXT_ENCODER.encode(json),
  };
}
