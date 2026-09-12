import { describe, expect, test } from "bun:test";
import { IntakeValidationError } from "../intake/normalize.js";
import { CostEstimationCurrencySchema, resolveCostEstimationConfiguration } from "./config.js";

describe("CostEstimationCurrencySchema", () => {
  test("accepts exactly three uppercase ASCII letters", () => {
    for (const currency of ["EUR", "USD", "GBP", "XYZ"]) {
      expect(CostEstimationCurrencySchema.safeParse(currency)).toEqual({
        success: true,
        data: currency,
      });
    }
  });

  test("rejects lowercase, mixed-case, wrong-length, and non-ASCII values", () => {
    for (const currency of ["eur", "EuR", "EUr", "EURO", "EU", "", "€UR", "ÉUR", "ＥＵＲ"]) {
      expect(CostEstimationCurrencySchema.safeParse(currency).success).toBe(false);
    }
  });
});

describe("resolveCostEstimationConfiguration", () => {
  test("leaves estimation disabled when configuration is undefined", () => {
    expect(resolveCostEstimationConfiguration()).toBeUndefined();
    expect(resolveCostEstimationConfiguration(undefined)).toBeUndefined();
  });

  test("returns a frozen detached currency snapshot", () => {
    const callerConfiguration: { currency: string } = { currency: "EUR" };
    const snapshot = resolveCostEstimationConfiguration(callerConfiguration);

    expect(snapshot).toEqual({ currency: "EUR" });
    expect(Object.isFrozen(snapshot)).toBe(true);

    callerConfiguration.currency = "USD";
    expect(snapshot).toEqual({ currency: "EUR" });
  });

  test("rejects every invalid configuration with invalid_configuration", () => {
    const invalidConfigurations: unknown[] = [
      "EUR",
      {},
      { currency: "eur" },
      { currency: "EURO" },
      { currency: "E1R" },
      { currency: "€" },
      { currency: 1 },
      { currency: "EUR", extra: true },
      null,
    ];

    for (const configuration of invalidConfigurations) {
      expect(() => resolveCostEstimationConfiguration(configuration)).toThrow(
        IntakeValidationError,
      );
      try {
        resolveCostEstimationConfiguration(configuration);
        throw new Error("expected invalid configuration");
      } catch (error) {
        expect(error).toBeInstanceOf(IntakeValidationError);
        expect((error as IntakeValidationError).code).toBe("invalid_configuration");
      }
    }
  });
});
