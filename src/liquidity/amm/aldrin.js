import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import * as borsh from '@project-serum/borsh'
import { blob } from 'buffer-layout'
import { TokenProgramService } from 'common/pool/tokenProgramService'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { instructionDiscriminator } from '../utils'

export const ALDRIN_POOLS_PROGRAM_ADDRESS = new PublicKey(
  'CURVGoZn8zycx6FXwwevgBTB2gVvdbGTEpvMJDbgs2t4'
)

export const Side = {
  Bid: 0,
  Ask: 1
}

const FEES_LAYOUT = borsh.struct(
  [
    borsh.u64('tradeFeeNumerator'),
    borsh.u64('tradeFeeDenominator'),
    borsh.u64('ownerTradeFeeNumerator'),
    borsh.u64('ownerTradeFeeDenominator'),
    borsh.u64('ownerWithdrawFeeNumerator'),
    borsh.u64('ownerWithdrawFeeDenominator')
  ],
  'fees'
)

const POOL_FIELDS_COMMON = [
  blob(8, 'padding'),
  borsh.publicKey('lpTokenFreezeVault'),
  borsh.publicKey('poolMint'),
  borsh.publicKey('baseTokenVault'),
  borsh.publicKey('baseTokenMint'),
  borsh.publicKey('quoteTokenVault'),
  borsh.publicKey('quoteTokenMint'),
  borsh.publicKey('poolSigner'),
  borsh.u8('poolSignerNonce'),
  borsh.publicKey('authority'),
  borsh.publicKey('initializerAccount'),
  borsh.publicKey('feeBaseAccount'),
  borsh.publicKey('feeQuoteAccount'),
  borsh.publicKey('feePoolTokenAccount'),
  FEES_LAYOUT
]

export const SWAP_INSTRUCTION_LAYOUT = borsh.struct([
  blob(8, 'instruction'),
  borsh.u64('tokens'),
  borsh.u64('minTokens'),
  borsh.u8('side')
])

export const CURVE = {
  PRODUCT: 0,
  STABLE: 1
}

export const POOL_LAYOUT = borsh.struct(POOL_FIELDS_COMMON)

export const POOL_V2_LAYOUT = borsh.struct([
  ...POOL_FIELDS_COMMON,
  borsh.u8('curveType'),
  borsh.publicKey('curve')
])

export default class AldrinSwapService {
  static async buildSwapInstruction (connection, router, userAuthority) {
    const userSource = await TokenProgramService.findAssociatedTokenAddress(
      userAuthority,
      router.sourceToken
    )
    const userDestination = await TokenProgramService.findAssociatedTokenAddress(
      userAuthority,
      router.destinationToken
    )

    const poolInfo = await AldrinSwapService.getPoolAccountInfo(
      connection,
      router.poolAddress
    )

    const isInverted = poolInfo.quoteTokenMint.equals(router.destinationToken)
    const data = Buffer.alloc(33)

    SWAP_INSTRUCTION_LAYOUT.encode(
      {
        instruction: instructionDiscriminator('swap'),
        tokens: router.amountIn,
        minTokens: router.amountOut,
        side: isInverted ? Side.Ask : Side.Bid
      },
      data
    )

    const [poolSigner] = await PublicKey.findProgramAddress(
      [router.poolAddress.toBuffer()],
      ALDRIN_POOLS_PROGRAM_ADDRESS
    )

    const keys = [
      { pubkey: router.poolAddress, isSigner: false, isWritable: false },
      { pubkey: poolSigner, isSigner: false, isWritable: false },
      { pubkey: poolInfo.poolMint, isSigner: false, isWritable: true },
      { pubkey: poolInfo.baseTokenVault, isSigner: false, isWritable: true },
      { pubkey: poolInfo.quoteTokenVault, isSigner: false, isWritable: true },
      {
        pubkey: poolInfo.feePoolTokenAccount,
        isSigner: false,
        isWritable: true
      },
      { pubkey: userAuthority, isSigner: true, isWritable: false },
      { pubkey: isInverted ? userSource : userDestination, isSigner: false, isWritable: true },
      { pubkey: isInverted ? userDestination : userSource, isSigner: false, isWritable: true },
      { pubkey: poolInfo.curve, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
    ]

    return new TransactionInstruction({
      keys,
      data,
      programId: ALDRIN_POOLS_PROGRAM_ADDRESS
    })
  }

  static async getPoolAccountInfo (connection, poolAddress) {
    const accountInfo = await connection.getAccountInfo(poolAddress)
    const poolInfo = AldrinSwapService.decodePoolAccount(accountInfo.data)
    return poolInfo
  }

  static decodePoolAccount (data) {
    const dataDecoded = POOL_V2_LAYOUT.decode(data)

    return dataDecoded
  }
}
