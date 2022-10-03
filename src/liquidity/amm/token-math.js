import BN from 'bn.js'

export const ZERO = new BN(0)
export const ONE = new BN(1)

export function getAmountDeltaA (
  currSqrtPrice,
  targetSqrtPrice,
  currLiquidity,
  roundUp
) {
  const [sqrtPriceLower, sqrtPriceUpper] = toIncreasingPriceOrder(
    currSqrtPrice,
    targetSqrtPrice
  )
  const sqrtPriceDiff = sqrtPriceUpper.sub(sqrtPriceLower)

  const numerator = currLiquidity.mul(sqrtPriceDiff).shln(64)
  const denominator = sqrtPriceLower.mul(sqrtPriceUpper)

  const quotient = numerator.div(denominator)
  const remainder = numerator.mod(denominator)

  const result =
    roundUp && !remainder.eq(ZERO) ? quotient.add(new BN(1)) : quotient

  return result
}

export function getAmountDeltaB (
  currSqrtPrice,
  targetSqrtPrice,
  currLiquidity,
  roundUp
) {
  const [sqrtPriceLower, sqrtPriceUpper] = toIncreasingPriceOrder(
    currSqrtPrice,
    targetSqrtPrice
  )
  const sqrtPriceDiff = sqrtPriceUpper.sub(sqrtPriceLower)
  return roundUp
    ? currLiquidity.mul(sqrtPriceDiff).add(ONE)
    : currLiquidity.mul(sqrtPriceDiff)
}

function toIncreasingPriceOrder (sqrtPrice0, sqrtPrice1) {
  if (sqrtPrice0.gt(sqrtPrice1)) {
    return [sqrtPrice1, sqrtPrice0]
  } else {
    return [sqrtPrice0, sqrtPrice1]
  }
}
