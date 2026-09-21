/**
 * Pure fee-line split used by Builder Offers.
 * Kept free of Stripe so unit tests can import it safely.
 * paymentHold.js re-exports computeSplitFromLines from here for runtime.
 */
export const PLATFORM_FEE_RATE = 0.15;

export function computeSplitFromLines(lines = []) {
  let builderTotal = 0;
  let platformFeeTotal = 0;
  let providerPayoutTotal = 0;
  let passThroughTotal = 0;
  const lineResults = [];

  for (const line of lines) {
    const amount = Math.max(0, Number(line?.amount) || 0);
    const feeEligible = line?.feeEligible !== false;
    builderTotal += amount;

    let platformFee = 0;
    let providerPayout = amount;
    if (feeEligible) {
      platformFee = amount * PLATFORM_FEE_RATE;
      providerPayout = amount - platformFee;
    } else {
      passThroughTotal += amount;
    }

    platformFeeTotal += platformFee;
    providerPayoutTotal += providerPayout;
    lineResults.push({
      amount,
      feeEligible,
      platformFee,
      providerPayout,
    });
  }

  return {
    builderTotal,
    platformFeeTotal,
    providerPayoutTotal,
    passThroughTotal,
    lineResults,
  };
}
