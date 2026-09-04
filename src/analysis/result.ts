import { z } from "zod";

/** A required string that preserves its input while rejecting empty text. */
export const NonBlankStringSchema = z.string().regex(/\S/u);

export const ClarityLevelSchema = z.enum(["high", "medium", "low"]);
export const ConfidenceLevelSchema = z.enum(["high", "medium", "low", "insufficient_information"]);
export const ImpactSchema = z.enum(["high", "medium", "low"]);
export const SeveritySchema = z.enum(["high", "medium", "low"]);
export const UnknownPrioritySchema = z.enum(["critical", "important", "minor"]);
export const DiscoveryPrioritySchema = z.enum(["critical", "important", "secondary"]);
export const RoadmapStatusSchema = z.enum(["available", "limited", "insufficient_information"]);

function uniqueNonBlankStringArraySchema() {
  return z
    .array(NonBlankStringSchema)
    .min(1)
    .check((ctx) => {
      const values = ctx.value;
      const seen = new Set<string>();
      for (const value of values) {
        if (seen.has(value)) {
          ctx.issues.push({
            code: "custom",
            message: "Values must be unique",
            input: values,
          });
          return;
        }
        seen.add(value);
      }
    })
    .meta({ uniqueItems: true });
}

export const ClaritySchema = z
  .object({
    level: ClarityLevelSchema,
    reason: NonBlankStringSchema,
  })
  .strict();

export type Clarity = z.infer<typeof ClaritySchema>;

export const FactSchema = z
  .object({
    text: NonBlankStringSchema,
    sourceFieldKeys: uniqueNonBlankStringArraySchema(),
  })
  .strict();

export type Fact = z.infer<typeof FactSchema>;

export const InferenceSchema = z
  .object({
    text: NonBlankStringSchema,
    confidence: ClarityLevelSchema,
    reason: NonBlankStringSchema,
    basedOnFieldKeys: uniqueNonBlankStringArraySchema(),
    needsValidation: NonBlankStringSchema.optional(),
  })
  .strict();

export type Inference = z.infer<typeof InferenceSchema>;

export const AssumptionSchema = z
  .object({
    text: NonBlankStringSchema,
    impact: ImpactSchema.optional(),
  })
  .strict();

export type Assumption = z.infer<typeof AssumptionSchema>;

export const UnknownSchema = z
  .object({
    text: NonBlankStringSchema,
    priority: UnknownPrioritySchema,
    whyItMatters: NonBlankStringSchema,
  })
  .strict();

export type Unknown = z.infer<typeof UnknownSchema>;

export const RiskSchema = z
  .object({
    text: NonBlankStringSchema,
    reason: NonBlankStringSchema,
    severity: SeveritySchema.optional(),
    needsValidation: NonBlankStringSchema.optional(),
  })
  .strict();

export type Risk = z.infer<typeof RiskSchema>;

export const DiscoveryQuestionSchema = z
  .object({
    question: NonBlankStringSchema,
    priority: DiscoveryPrioritySchema,
    reason: NonBlankStringSchema,
  })
  .strict();

export type DiscoveryQuestion = z.infer<typeof DiscoveryQuestionSchema>;

export const RoadmapPhaseSchema = z
  .object({
    name: NonBlankStringSchema,
    purpose: NonBlankStringSchema,
  })
  .strict();

export type RoadmapPhase = z.infer<typeof RoadmapPhaseSchema>;

export const RoadmapSchema = z
  .object({
    status: RoadmapStatusSchema,
    note: NonBlankStringSchema.optional(),
    phases: z.array(RoadmapPhaseSchema).min(1),
  })
  .strict();

export type Roadmap = z.infer<typeof RoadmapSchema>;

export const ConfidenceSchema = z
  .object({
    level: ConfidenceLevelSchema,
    reason: NonBlankStringSchema,
  })
  .strict();

export type Confidence = z.infer<typeof ConfidenceSchema>;

export const AnalysisResultSchema = z
  .object({
    summary: NonBlankStringSchema,
    clarity: ClaritySchema,
    facts: z.array(FactSchema),
    inferences: z.array(InferenceSchema),
    assumptions: z.array(AssumptionSchema),
    unknowns: z.array(UnknownSchema),
    risks: z.array(RiskSchema),
    discoveryQuestions: z.array(DiscoveryQuestionSchema),
    roadmap: RoadmapSchema,
    confidence: ConfidenceSchema,
  })
  .strict();

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
