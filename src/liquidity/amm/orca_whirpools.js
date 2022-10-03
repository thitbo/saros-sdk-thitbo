import { PublicKey, TransactionInstruction } from '@solana/web3.js'

import * as borsh from '@project-serum/borsh'
import { ZERO } from './utils'
import { getAmountDeltaA, getAmountDeltaB } from './token-math'
import { getNextSqrtPrices, sqrtPriceX64ToTickIndex } from './sqrt-math'
import { TickArraySequence } from './tick-array'
import BN from 'bn.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { TokenProgramService } from 'common/pool/tokenProgramService'
import { BorshService } from 'common/pool/borshService'

export const MAX_SWAP_TICK_ARRAYS = 3
export const TICK_ARRAY_SIZE = 88
export const MIN_TICK_INDEX = -443636
const PDA_TICK_ARRAY_SEED = 'tick_array'
export const MAX_SQRT_PRICE = '79226673515401279992447579055'
export const MIN_SQRT_PRICE = '4295048016'

export const FEE_RATE_MUL_VALUE = new BN(1000000)
export const PROTOCOL_FEE_RATE_MUL_VALUE = new BN(10000)

const PROGRAM_ID = new PublicKey('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc')

const WHIRLPOOL_LAYOUT = borsh.struct([
  borsh.publicKey('whirlpoolsConfig'),
  borsh.u8('whirlpoolBump'),
  borsh.u16('tickSpacing'),
  borsh.array(borsh.u8(), 2, 'tickSpacingSeed'),
  borsh.u16('feeRate'),
  borsh.u16('protocolFeeRate'),
  borsh.u128('liquidity'),
  borsh.u128('sqrtPrice'),
  borsh.i32('tickCurrentIndex'),
  borsh.u64('protocolFeeOwedA'),
  borsh.u64('protocolFeeOwedB'),
  borsh.publicKey('tokenMintA'),
  borsh.publicKey('tokenVaultA'),
  borsh.u128('feeGrowthGlobalA'),
  borsh.publicKey('tokenMintB'),
  borsh.publicKey('tokenVaultB'),
  borsh.u128('feeGrowthGlobalB'),
  borsh.u64('rewardLastUpdateTimestamp')
  // dont care to reward info
])

const TICK_LAYOUT = borsh.struct([
  borsh.bool('initialized'),
  borsh.i128('liquidityNet'),
  borsh.u128('liquidityGross'),
  borsh.u128('feeGrowthOutsideA'),
  borsh.u128('feeGrowthOutsideB'),
  borsh.array(borsh.u128(), 3, 'rewardGrowthsOutside')
])

const TICK_ARRAY_LAYOUT = borsh.struct([
  borsh.i32('startTickIndex'),
  borsh.array(TICK_LAYOUT, TICK_ARRAY_SIZE, 'ticks'),
  borsh.publicKey('whirlpool')
])

const SWAP_LAYOUT = borsh.struct([
  borsh.u64('amount'),
  borsh.u64('otherAmountThreshold'),
  borsh.u128('sqrtPriceLimit'),
  borsh.bool('amountSpecifiedIsInput'),
  borsh.bool('aToB')
])

function getNextSqrtPriceFromARoundUp (
  sqrtPrice,
  currLiquidity,
  amount,
  amountSpecifiedIsInput
) {
  if (amount.eq(ZERO)) {
    return sqrtPrice
  }

  const p = sqrtPrice.mul(amount)
  const numerator = currLiquidity.mul(sqrtPrice).shln(64)

  const currLiquidityShiftLeft = currLiquidity.shln(64)

  const denominator = amountSpecifiedIsInput
    ? currLiquidityShiftLeft.add(p)
    : currLiquidityShiftLeft.sub(p)

  const price = numerator.divRound(denominator)

  return price
}

function getNextSqrtPriceFromBRoundDown (
  sqrtPrice,
  currLiquidity,
  amount,
  amountSpecifiedIsInput
) {
  const amountX64 = amount.shln(64)

  const delta = amountX64.div(currLiquidity)
  if (!amountSpecifiedIsInput) {
    delta.add(new BN(1))
  }

  if (amountSpecifiedIsInput) {
    sqrtPrice = sqrtPrice.add(delta)
  } else {
    sqrtPrice = sqrtPrice.sub(delta)
  }

  return sqrtPrice
}

export function getNextSqrtPrice (
  sqrtPrice,
  currLiquidity,
  amount,
  amountSpecifiedIsInput,
  aToB
) {
  if (amountSpecifiedIsInput === aToB) {
    return getNextSqrtPriceFromARoundUp(
      sqrtPrice,
      currLiquidity,
      amount,
      amountSpecifiedIsInput
    )
  } else {
    return getNextSqrtPriceFromBRoundDown(
      sqrtPrice,
      currLiquidity,
      amount,
      amountSpecifiedIsInput
    )
  }
}

export function computeSwapStep (
  amountRemaining,
  feeRate,
  currLiquidity,
  currSqrtPrice,
  targetSqrtPrice,
  amountSpecifiedIsInput,
  aToB
) {
  let amountFixedDelta = getAmountFixedDelta(
    currSqrtPrice,
    targetSqrtPrice,
    currLiquidity,
    amountSpecifiedIsInput,
    aToB
  )

  let amountCalc = amountRemaining
  if (amountSpecifiedIsInput) {
    const result = amountRemaining
      .mul(FEE_RATE_MUL_VALUE.sub(new BN(feeRate)))
      .div(FEE_RATE_MUL_VALUE)
    amountCalc = result
  }

  const nextSqrtPrice = amountCalc.gte(amountFixedDelta)
    ? targetSqrtPrice
    : getNextSqrtPrice(
      currSqrtPrice,
      currLiquidity,
      amountCalc,
      amountSpecifiedIsInput,
      aToB
    )

  const isMaxSwap = nextSqrtPrice.eq(targetSqrtPrice)

  const amountUnfixedDelta = getAmountUnfixedDelta(
    currSqrtPrice,
    nextSqrtPrice,
    currLiquidity,
    amountSpecifiedIsInput,
    aToB
  )

  if (!isMaxSwap) {
    amountFixedDelta = getAmountFixedDelta(
      currSqrtPrice,
      nextSqrtPrice,
      currLiquidity,
      amountSpecifiedIsInput,
      aToB
    )
  }

  const amountIn = amountSpecifiedIsInput
    ? amountFixedDelta
    : amountUnfixedDelta
  let amountOut = amountSpecifiedIsInput
    ? amountUnfixedDelta
    : amountFixedDelta

  if (!amountSpecifiedIsInput && amountOut.gt(amountRemaining)) {
    amountOut = amountRemaining
  }

  let feeAmount
  if (amountSpecifiedIsInput && !isMaxSwap) {
    feeAmount = amountRemaining.sub(amountIn)
  } else {
    const feeRateBN = new BN(feeRate)
    feeAmount = amountIn
      .mul(feeRateBN)
      .div(FEE_RATE_MUL_VALUE.sub(feeRateBN))
      .add(new BN(1))
  }

  return {
    amountIn,
    amountOut,
    nextPrice: nextSqrtPrice,
    feeAmount
  }
}

function getAmountFixedDelta (
  currSqrtPrice,
  targetSqrtPrice,
  currLiquidity,
  amountSpecifiedIsInput,
  aToB
) {
  if (aToB === amountSpecifiedIsInput) {
    return getAmountDeltaA(
      currSqrtPrice,
      targetSqrtPrice,
      currLiquidity,
      amountSpecifiedIsInput
    )
  } else {
    return getAmountDeltaB(
      currSqrtPrice,
      targetSqrtPrice,
      currLiquidity,
      amountSpecifiedIsInput
    )
  }
}

function getAmountUnfixedDelta (
  currSqrtPrice,
  targetSqrtPrice,
  currLiquidity,
  amountSpecifiedIsInput,
  aToB
) {
  if (aToB === amountSpecifiedIsInput) {
    return getAmountDeltaB(
      currSqrtPrice,
      targetSqrtPrice,
      currLiquidity,
      !amountSpecifiedIsInput
    )
  } else {
    return getAmountDeltaA(
      currSqrtPrice,
      targetSqrtPrice,
      currLiquidity,
      !amountSpecifiedIsInput
    )
  }
}

export function computeSwap (
  whirlpoolData,
  tickSequence,
  tokenAmount,
  sqrtPriceLimit,
  amountSpecifiedIsInput,
  aToB
) {
  let amountRemaining = tokenAmount
  let amountCalculated = ZERO
  let currSqrtPrice = whirlpoolData.sqrtPrice
  let currLiquidity = whirlpoolData.liquidity
  let currTickIndex = whirlpoolData.tickCurrentIndex
  let totalFeeAmount = ZERO
  const feeRate = whirlpoolData.feeRate
  const protocolFeeRate = whirlpoolData.protocolFeeRate
  let currProtocolFee = new BN(0)
  let currFeeGrowthGlobalInput = aToB
    ? whirlpoolData.feeGrowthGlobalA
    : whirlpoolData.feeGrowthGlobalB

  while (amountRemaining.gt(ZERO) && !sqrtPriceLimit.eq(currSqrtPrice)) {
    const { nextIndex: nextTickIndex } =
      tickSequence.findNextInitializedTickIndex(currTickIndex)

    const { nextTickPrice, nextSqrtPriceLimit: targetSqrtPrice } =
      getNextSqrtPrices(nextTickIndex, sqrtPriceLimit, aToB)

    const swapComputation = computeSwapStep(
      amountRemaining,
      feeRate,
      currLiquidity,
      currSqrtPrice,
      targetSqrtPrice,
      amountSpecifiedIsInput,
      aToB
    )

    totalFeeAmount = totalFeeAmount.add(swapComputation.feeAmount)

    if (amountSpecifiedIsInput) {
      amountRemaining = amountRemaining.sub(swapComputation.amountIn)
      amountRemaining = amountRemaining.sub(swapComputation.feeAmount)
      amountCalculated = amountCalculated.add(swapComputation.amountOut)
    } else {
      amountRemaining = amountRemaining.sub(swapComputation.amountOut)
      amountCalculated = amountCalculated.add(swapComputation.amountIn)
      amountCalculated = amountCalculated.add(swapComputation.feeAmount)
    }

    const { nextProtocolFee, nextFeeGrowthGlobalInput } = calculateFees(
      swapComputation.feeAmount,
      protocolFeeRate,
      currLiquidity,
      currProtocolFee,
      currFeeGrowthGlobalInput
    )
    currProtocolFee = nextProtocolFee
    currFeeGrowthGlobalInput = nextFeeGrowthGlobalInput

    if (swapComputation.nextPrice.eq(nextTickPrice)) {
      const nextTick = tickSequence.getTick(nextTickIndex)
      if (nextTick.initialized) {
        currLiquidity = calculateNextLiquidity(
          nextTick.liquidityNet,
          currLiquidity,
          aToB
        )
      }
      currTickIndex = aToB ? nextTickIndex - 1 : nextTickIndex
    } else {
      currTickIndex = sqrtPriceX64ToTickIndex(swapComputation.nextPrice)
    }

    currSqrtPrice = swapComputation.nextPrice
  }

  const { amountA, amountB } = calculateEstTokens(
    tokenAmount,
    amountRemaining,
    amountCalculated,
    aToB,
    amountSpecifiedIsInput
  )

  return {
    amountA,
    amountB,
    nextTickIndex: currTickIndex,
    nextSqrtPrice: currSqrtPrice,
    totalFeeAmount
  }
}

function calculateFees (
  feeAmount,
  protocolFeeRate,
  currLiquidity,
  currProtocolFee,
  currFeeGrowthGlobalInput
) {
  let nextProtocolFee = currProtocolFee
  const nextFeeGrowthGlobalInput = currFeeGrowthGlobalInput
  let globalFee = feeAmount

  if (protocolFeeRate > 0) {
    const delta = calculateProtocolFee(globalFee, protocolFeeRate)
    globalFee = globalFee.sub(delta)
    nextProtocolFee = nextProtocolFee.add(currProtocolFee)
  }

  return {
    nextProtocolFee,
    nextFeeGrowthGlobalInput
  }
}

function calculateProtocolFee (globalFee, protocolFeeRate) {
  return globalFee.mul(
    new BN(protocolFeeRate).div(PROTOCOL_FEE_RATE_MUL_VALUE)
  )
}

function calculateEstTokens (
  amount,
  amountRemaining,
  amountCalculated,
  aToB,
  amountSpecifiedIsInput
) {
  return aToB === amountSpecifiedIsInput
    ? {
      amountA: amount.sub(amountRemaining),
      amountB: amountCalculated
    }
    : {
      amountA: amountCalculated,
      amountB: amount.sub(amountRemaining)
    }
}

function calculateNextLiquidity (tickNetLiquidity, currLiquidity, aToB) {
  return aToB
    ? currLiquidity.sub(tickNetLiquidity)
    : currLiquidity.add(tickNetLiquidity)
}

export default class OrcaWhirlpoolSwapService {
  static getTickArrayPublicKeys (
    tickCurrentIndex,
    tickSpacing,
    aToB,
    programId,
    whirlpoolAddress
  ) {
    let offset = 0
    const tickArrayAddresses = []
    for (let i = 0; i < MAX_SWAP_TICK_ARRAYS; i++) {
      let startIndex
      try {
        startIndex = OrcaWhirlpoolSwapService.getStartTickIndex(
          tickCurrentIndex,
          tickSpacing,
          offset
        )
      } catch {
        return tickArrayAddresses
      }

      const pda = OrcaWhirlpoolSwapService.getTickArray(
        programId,
        whirlpoolAddress,
        startIndex
      )
      tickArrayAddresses.push(pda[0])
      offset = aToB ? offset - 1 : offset + 1
    }

    return tickArrayAddresses
  }

  static getStartTickIndex (tickIndex, tickSpacing, offset = 0) {
    const realIndex = Math.floor(tickIndex / tickSpacing / TICK_ARRAY_SIZE)
    const startTickIndex = (realIndex + offset) * tickSpacing * TICK_ARRAY_SIZE

    return startTickIndex
  }

  static getTickArray (programId, whirlpoolAddress, startTick) {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from(PDA_TICK_ARRAY_SEED),
        whirlpoolAddress.toBuffer(),
        Buffer.from(startTick.toString())
      ],
      programId
    )
  }

  static async getTickArrays (
    connection,
    tickCurrentIndex,
    tickSpacing,
    aToB,
    programId,
    whirlpoolAddress
  ) {
    const addresses = OrcaWhirlpoolSwapService.getTickArrayPublicKeys(
      tickCurrentIndex,
      tickSpacing,
      aToB,
      programId,
      whirlpoolAddress
    )
    const data = []
    for (const address of addresses) {
      const tickArray = await OrcaWhirlpoolSwapService.getTickArrayAccountInfo(
        connection,
        address
      )
      data.push(tickArray)
    }
    return addresses.map((addr, index) => {
      return {
        address: addr,
        data: data[index]
      }
    })
  }

  static remapAndAdjustTokens (amountA, amountB, aToB) {
    const estimatedAmountIn = aToB ? amountA : amountB
    const estimatedAmountOut = aToB ? amountB : amountA
    return {
      estimatedAmountIn,
      estimatedAmountOut
    }
  }

  static simulateSwap (params) {
    const {
      aToB,
      whirlpoolData,
      tickArrays,
      tokenAmount,
      sqrtPriceLimit,
      otherAmountThreshold,
      amountSpecifiedIsInput
    } = params

    if (
      sqrtPriceLimit.gt(
        new BN(MAX_SQRT_PRICE) || sqrtPriceLimit.lt(new BN(MIN_SQRT_PRICE))
      )
    ) {
      throw new Error('Provided SqrtPriceLimit is out of bounds.')
    }

    if (
      (aToB && sqrtPriceLimit.gt(whirlpoolData.sqrtPrice)) ||
      (!aToB && sqrtPriceLimit.lt(whirlpoolData.sqrtPrice))
    ) {
      throw new Error(
        'Provided SqrtPriceLimit is in the opposite direction of the trade.'
      )
    }

    if (tokenAmount.eq(ZERO)) {
      throw new Error('Provided tokenAmount is zero.')
    }

    const tickSequence = new TickArraySequence(
      tickArrays,
      whirlpoolData.tickSpacing,
      aToB
    )

    const swapResults = computeSwap(
      whirlpoolData,
      tickSequence,
      tokenAmount,
      sqrtPriceLimit,
      amountSpecifiedIsInput,
      aToB
    )

    if (amountSpecifiedIsInput) {
      if (
        (aToB && otherAmountThreshold.gt(swapResults.amountB)) ||
        (!aToB && otherAmountThreshold.gt(swapResults.amountA))
      ) {
        throw new Error(
          'Quoted amount for the other token is below the otherAmountThreshold.'
        )
      }
    } else {
      if (
        (aToB && otherAmountThreshold.lt(swapResults.amountA)) ||
        (!aToB && otherAmountThreshold.lt(swapResults.amountB))
      ) {
        throw new Error(
          'Quoted amount for the other token is above the otherAmountThreshold.'
        )
      }
    }

    const { estimatedAmountIn, estimatedAmountOut } =
      OrcaWhirlpoolSwapService.remapAndAdjustTokens(
        swapResults.amountA,
        swapResults.amountB,
        aToB
      )

    const numOfTickCrossings = tickSequence.getNumOfTouchedArrays()
    if (numOfTickCrossings > MAX_SWAP_TICK_ARRAYS) {
      throw new Error(
        `Input amount causes the quote to traverse more than the allowable amount of tick-arrays ${numOfTickCrossings}`
      )
    }

    const touchedArrays = tickSequence.getTouchedArrays(MAX_SWAP_TICK_ARRAYS)

    return {
      estimatedAmountIn,
      estimatedAmountOut,
      estimatedEndTickIndex: swapResults.nextTickIndex,
      estimatedEndSqrtPrice: swapResults.nextSqrtPrice,
      estimatedFeeAmount: swapResults.totalFeeAmount,
      amount: tokenAmount,
      amountSpecifiedIsInput,
      aToB,
      otherAmountThreshold,
      sqrtPriceLimit,
      tickArray0: touchedArrays[0],
      tickArray1: touchedArrays[1],
      tickArray2: touchedArrays[2]
    }
  }

  static async buildSwapInstruction (connection, router, userAuthority) {
    const poolInfo = await OrcaWhirlpoolSwapService.getPoolAccountInfo(
      connection,
      router.poolAddress
    )
    const aToB =
      poolInfo.tokenMintA.toString() === router.sourceToken.toString()

    const tickArrays = await OrcaWhirlpoolSwapService.getTickArrays(
      connection,
      poolInfo.tickCurrentIndex,
      poolInfo.tickSpacing,
      aToB,
      PROGRAM_ID,
      router.poolAddress
    )

    const quote = OrcaWhirlpoolSwapService.simulateSwap({
      whirlpoolData: poolInfo,
      tokenAmount: router.amountIn,
      aToB,
      amountSpecifiedIsInput: true,
      sqrtPriceLimit: new BN(aToB ? MIN_SQRT_PRICE : MAX_SQRT_PRICE),
      otherAmountThreshold: ZERO,
      tickArrays
    })

    console.log(quote)

    const request = {
      amount: quote.estimatedAmountIn,
      otherAmountThreshold: quote.estimatedAmountOut,
      sqrtPriceLimit: quote.sqrtPriceLimit,
      amountSpecifiedIsInput: quote.amountSpecifiedIsInput,
      aToB: quote.aToB
    }

    const data = BorshService.anchorSerialize('swap', SWAP_LAYOUT, request, 50)

    const userTokenAccountA = await TokenProgramService.findAssociatedTokenAddress(
      userAuthority,
      poolInfo.tokenMintA
    )
    const userTokenAccountB = await TokenProgramService.findAssociatedTokenAddress(
      userAuthority,
      poolInfo.tokenMintB
    )

    const [oracleAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from('oracle'), router.poolAddress.toBytes()],
      PROGRAM_ID
    )

    const keys = [
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: userAuthority, isSigner: true, isWritable: false },
      { pubkey: router.poolAddress, isSigner: false, isWritable: true },
      { pubkey: userTokenAccountA, isSigner: false, isWritable: true },
      { pubkey: poolInfo.tokenVaultA, isSigner: false, isWritable: true },
      { pubkey: userTokenAccountB, isSigner: false, isWritable: true },
      { pubkey: poolInfo.tokenVaultB, isSigner: false, isWritable: true },
      { pubkey: quote.tickArray0, isSigner: false, isWritable: true },
      { pubkey: quote.tickArray1, isSigner: false, isWritable: true },
      { pubkey: quote.tickArray2, isSigner: false, isWritable: true },
      { pubkey: oracleAddress, isSigner: false, isWritable: true }
    ]

    return new TransactionInstruction({
      keys,
      data,
      programId: PROGRAM_ID
    })
  }

  static async getPoolAccountInfo (connection, poolAddress) {
    const accountInfo = await connection.getAccountInfo(poolAddress)

    const poolInfo = OrcaWhirlpoolSwapService.decodePoolAccount(
      accountInfo.data
    )
    return poolInfo
  }

  static decodePoolAccount (data) {
    const dataDecoded =
      BorshService.anchorDeserialize(WHIRLPOOL_LAYOUT, data)

    return dataDecoded
  }

  static async getTickArrayAccountInfo (connection, tickArrayAddress) {
    const accountInfo = await connection.getAccountInfo(tickArrayAddress)

    const info = OrcaWhirlpoolSwapService.decodeTickArrayAccount(
      accountInfo.data
    )
    return info
  }

  static decodeTickArrayAccount (data) {
    const dataDecoded =
      BorshService.anchorDeserialize(TICK_ARRAY_LAYOUT, data)

    return dataDecoded
  }
}
