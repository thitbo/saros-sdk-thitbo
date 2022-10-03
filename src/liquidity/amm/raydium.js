import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import * as borsh from '@project-serum/borsh'
import { blob } from 'buffer-layout'
import { TokenProgramService } from 'common/pool/tokenProgramService'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { BorshService } from 'common/pool/borshService'

const RAYDIUM_PROGRAM_ID = new PublicKey(
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'
)

export const LIQUIDITY_STATE_LAYOUT_V4 = borsh.struct([
  borsh.u64('status'),
  borsh.u64('nonce'),
  borsh.u64('maxOrder'),
  borsh.u64('depth'),
  borsh.u64('baseDecimal'),
  borsh.u64('quoteDecimal'),
  borsh.u64('state'),
  borsh.u64('resetFlag'),
  borsh.u64('minSize'),
  borsh.u64('volMaxCutRatio'),
  borsh.u64('amountWaveRatio'),
  borsh.u64('baseLotSize'),
  borsh.u64('quoteLotSize'),
  borsh.u64('minPriceMultiplier'),
  borsh.u64('maxPriceMultiplier'),
  borsh.u64('systemDecimalValue'),
  borsh.u64('minSeparateNumerator'),
  borsh.u64('minSeparateDenominator'),
  borsh.u64('tradeFeeNumerator'),
  borsh.u64('tradeFeeDenominator'),
  borsh.u64('pnlNumerator'),
  borsh.u64('pnlDenominator'),
  borsh.u64('swapFeeNumerator'),
  borsh.u64('swapFeeDenominator'),
  borsh.u64('baseNeedTakePnl'),
  borsh.u64('quoteNeedTakePnl'),
  borsh.u64('quoteTotalPnl'),
  borsh.u64('baseTotalPnl'),
  borsh.u128('quoteTotalDeposited'),
  borsh.u128('baseTotalDeposited'),
  borsh.u128('swapBaseInAmount'),
  borsh.u128('swapQuoteOutAmount'),
  borsh.u64('swapBase2QuoteFee'),
  borsh.u128('swapQuoteInAmount'),
  borsh.u128('swapBaseOutAmount'),
  borsh.u64('swapQuote2BaseFee'),
  // amm vault
  borsh.publicKey('baseVault'),
  borsh.publicKey('quoteVault'),
  // mint
  borsh.publicKey('baseMint'),
  borsh.publicKey('quoteMint'),
  borsh.publicKey('lpMint'),
  // market
  borsh.publicKey('openOrders'),
  borsh.publicKey('marketId'),
  borsh.publicKey('marketProgramId'),
  borsh.publicKey('targetOrders'),
  borsh.publicKey('withdrawQueue'),
  borsh.publicKey('lpVault'),
  borsh.publicKey('owner'),
  // true circulating supply without lock up
  borsh.u64('lpReserve')
  // borsh.seq(borsh.u64(), 3, "padding"),
])
export const MARKET_STATE_LAYOUT_V3 = borsh.struct([
  blob(5),

  blob(8), // accountFlagsLayout('accountFlags'),

  borsh.publicKey('ownAddress'),

  borsh.u64('vaultSignerNonce'),

  borsh.publicKey('baseMint'),
  borsh.publicKey('quoteMint'),

  borsh.publicKey('baseVault'),
  borsh.u64('baseDepositsTotal'),
  borsh.u64('baseFeesAccrued'),

  borsh.publicKey('quoteVault'),
  borsh.u64('quoteDepositsTotal'),
  borsh.u64('quoteFeesAccrued'),

  borsh.u64('quoteDustThreshold'),

  borsh.publicKey('requestQueue'),
  borsh.publicKey('eventQueue'),

  borsh.publicKey('bids'),
  borsh.publicKey('asks'),

  borsh.u64('baseLotSize'),
  borsh.u64('quoteLotSize'),

  borsh.u64('feeRateBps'),

  borsh.u64('referrerRebatesAccrued'),
  blob(7)
])

const SWAP_LAYOUT = borsh.struct([
  borsh.u8('instruction'),
  borsh.u64('amountIn'),
  borsh.u64('minAmountOut')
])

export default class RaydiumSwapService {
  static async buildSwapInstruction (connection, router, userAuthority) {
    const data = Buffer.alloc(SWAP_LAYOUT.span)
    SWAP_LAYOUT.encode(
      {
        instruction: 9,
        amountIn: router.amountIn,
        minAmountOut: router.amountOut
      },
      data
    )

    const poolInfo = await RaydiumSwapService.getPoolAccountInfo(
      connection,
      router.poolAddress
    )
    const marketInfo = await RaydiumSwapService.getMarketAccountInfo(
      connection,
      poolInfo.marketId
    )
    const [poolAuthority] = await RaydiumSwapService.getPoolAuthority({
      programId: RAYDIUM_PROGRAM_ID
    })
    const [marketAuthority] = await RaydiumSwapService.getMarketAuthority(
      poolInfo.marketId,
      poolInfo.marketProgramId
    )

    const userSource = await TokenProgramService.findAssociatedTokenAddress(
      userAuthority,
      router.sourceToken
    )
    const userDestination =
      await TokenProgramService.findAssociatedTokenAddress(
        userAuthority,
        router.destinationToken
      )
    console.log({ poolInfo, marketInfo, marketAuthority, userSource, userDestination, router })

    const keys = [
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },

      { pubkey: router.poolAddress, isSigner: false, isWritable: true },
      { pubkey: poolAuthority, isSigner: false, isWritable: false },

      { pubkey: poolInfo.openOrders, isSigner: false, isWritable: true },
      // { pubkey: poolInfo.targetOrders, isSigner: false, isWritable: true },
      { pubkey: poolInfo.baseVault, isSigner: false, isWritable: true },
      { pubkey: poolInfo.quoteVault, isSigner: false, isWritable: true },

      { pubkey: poolInfo.marketProgramId, isSigner: false, isWritable: false },
      { pubkey: poolInfo.marketId, isSigner: false, isWritable: true },

      { pubkey: marketInfo.bids, isSigner: false, isWritable: true },
      { pubkey: marketInfo.asks, isSigner: false, isWritable: true },
      { pubkey: marketInfo.eventQueue, isSigner: false, isWritable: true },
      { pubkey: marketInfo.baseVault, isSigner: false, isWritable: true },
      { pubkey: marketInfo.quoteVault, isSigner: false, isWritable: true },
      { pubkey: marketAuthority, isSigner: false, isWritable: false },

      { pubkey: userSource, isSigner: false, isWritable: true },
      { pubkey: userDestination, isSigner: false, isWritable: true },
      { pubkey: userAuthority, isSigner: true, isWritable: false }
    ]

    return new TransactionInstruction({
      keys,
      data,
      programId: RAYDIUM_PROGRAM_ID
    })
  }

  static async getMarketAccountInfo (connection, marketId) {
    const accountInfo = await connection.getAccountInfo(marketId)

    const poolInfo = RaydiumSwapService.decodeMarketAccount(accountInfo.data)
    return poolInfo
  }

  static decodeMarketAccount (data) {
    const dataDecoded = MARKET_STATE_LAYOUT_V3.decode(data)

    return dataDecoded
  }

  static async getPoolAccountInfo (connection, poolAddress) {
    const accountInfo = await connection.getAccountInfo(poolAddress)

    const poolInfo = RaydiumSwapService.decodePoolAccount(accountInfo.data)
    return poolInfo
  }

  static decodePoolAccount (data) {
    const dataDecoded = BorshService.deserialize(
      LIQUIDITY_STATE_LAYOUT_V4,
      data
    )

    return dataDecoded
  }

  static async getMarketAuthority (marketId, programId) {
    const seeds = [marketId.toBuffer()]

    let nonce = 0
    let publicKey

    while (nonce < 100) {
      try {
        // Buffer.alloc(7) nonce u64
        const seedsWithNonce = seeds.concat(
          Buffer.from([nonce]),
          Buffer.alloc(7)
        )
        publicKey = await PublicKey.createProgramAddress(
          seedsWithNonce,
          programId
        )
      } catch (err) {
        if (err instanceof TypeError) {
          throw err
        }
        nonce++
        continue
      }
      return [publicKey, nonce]
    }
  }

  static async getPoolAuthority ({ programId }) {
    return PublicKey.findProgramAddress(
      // new Uint8Array(Buffer.from('amm authority'.replace('\u00A0', ' '), 'utf-8'))
      [
        Buffer.from([
          97, 109, 109, 32, 97, 117, 116, 104, 111, 114, 105, 116, 121
        ])
      ],
      programId
    )
  }
}
