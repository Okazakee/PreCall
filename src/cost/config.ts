import { z } from "zod";
import { copyConfigRecord, IntakeValidationError } from "../intake/normalize.js";

/** A narrow currency representation: three uppercase ASCII letters such as `EUR`. */
export const CostEstimationCurrencySchema = z.string().regex(/^[A-Z]{3}$/u);

/** Trusted application configuration for the optional preliminary cost estimate. */
export type CostEstimationConfig = {
  /**
   * Three uppercase ASCII letters (for example `EUR`) used verbatim for rendering. PreCall never
   * converts between currencies and never accepts a currency from submitted content.
   */
  currency: string;
};

const CostEstimationConfigSchema = z.object({ currency: CostEstimationCurrencySchema }).strict();

/**
 * Validate and detach the optional trusted cost-estimation configuration.
 *
 * `undefined` means cost estimation is disabled and preserves the analysis-only behavior. The
 * returned snapshot is frozen, so neither later caller mutation nor adapter code can change the
 * configured currency.
 */
export function resolveCostEstimationConfiguration(
  value: unknown = undefined,
): CostEstimationConfig | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed = CostEstimationConfigSchema.parse(copyConfigRecord(value));
    return Object.freeze({ currency: parsed.currency });
  } catch (error) {
    if (error instanceof IntakeValidationError) throw error;
    throw new IntakeValidationError("invalid_configuration");
  }
}
