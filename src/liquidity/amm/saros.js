import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import * as borsh from '@project-serum/borsh'
import { TokenProgramService } from 'common/pool/tokenProgramService'
import { TOKEN_PROGRAM_ID } from '../programId'
import { BorshService } from 'common/pool/borshService'

export const SAROS_SWAP_PROGRAM_ADDRESS_V1 = new PublicKey(
  'SSwapUtytfBdBn1b9NUGG6foMVPtcWgpRU32HToDUZr'
)

const TOKEN_SWAP_LAYOUT = borsh.struct([
  borsh.u8('version'),
  borsh.u8('isInitialized'),
  borsh.u8('bumpSeed'),
  borsh.publicKey('tokenProgramId'),
  borsh.publicKey('tokenAccountA'),
  borsh.publicKey('tokenAccountB'),
  borsh.publicKey('tokenPool'),
  borsh.publicKey('mintA'),
  borsh.publicKey('mintB'),
  borsh.publicKey('feeAccount'),
  borsh.u64('tradeFeeNumerator'),
  borsh.u64('tradeFeeDenominator'),
  borsh.u64('ownerTradeFeeNumerator'),
  borsh.u64('ownerTradeFeeDenominator'),
  borsh.u64('ownerWithdrawFeeNumerator'),
  borsh.u64('ownerWithdrawFeeDenominator'),
  borsh.u64('hostFeeNumerator'),
  borsh.u64('hostFeeDenominator'),
  borsh.u8('curveType'),
  borsh.array(borsh.u8(), 32, 'curveParameters')
])

export default class SarosAmmService {
  static async buildSwapInstruction (connection, router, userAuthority) {
    const dataLayout = borsh.struct([
      borsh.u8('instruction'),
      borsh.u64('amountIn'),
      borsh.u64('minimumAmountOut'),
      borsh.u8('keyCoin98')
    ])
    const data = SarosAmmService.serialize(
      dataLayout,
      {
        instruction: 1, // Swap instruction
        amountIn: router.amountIn,
        minimumAmountOut: router.amountOut,
        keyCoin98: 98
      },
      128
    )

    const poolInfo = await SarosAmmService.getPoolAccountInfo(
      connection,
      router.poolAddress
    )

    const [poolAuthorityAddress] =
      await SarosAmmService.findPoolAuthorityAddress(
        router.poolAddress,
        SAROS_SWAP_PROGRAM_ADDRESS_V1
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

    const keys = [
      { pubkey: router.poolAddress, isSigner: false, isWritable: false },
      { pubkey: poolAuthorityAddress, isSigner: false, isWritable: false },
      { pubkey: userAuthority, isSigner: true, isWritable: false },
      { pubkey: userSource, isSigner: false, isWritable: true },
      {
        pubkey:
          router.sourceToken.toString() === poolInfo.token0Mint.toString()
            ? poolInfo.token0Account
            : poolInfo.token1Account,
        isSigner: false,
        isWritable: true
      },

      {
        pubkey:
          router.destinationToken.toString() === poolInfo.token1Mint.toString()
            ? poolInfo.token1Account
            : poolInfo.token0Account,
        isSigner: false,
        isWritable: true
      },
      { pubkey: userDestination, isSigner: false, isWritable: true },
      { pubkey: poolInfo.lpTokenMint, isSigner: false, isWritable: true },
      { pubkey: poolInfo.feeAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
    ]

    return new TransactionInstruction({
      keys,
      programId: SAROS_SWAP_PROGRAM_ADDRESS_V1,
      data
    })
  }

  static async getPoolAccountInfo (connection, poolAddress) {
    const accountInfo = await connection.getAccountInfo(poolAddress)

    const poolInfo = SarosAmmService.decodePoolAccount(accountInfo.data)
    return poolInfo
  }

  static decodePoolAccount (data) {
    const dataDecoded = BorshService.deserialize(TOKEN_SWAP_LAYOUT, data)
    return {
      version: dataDecoded.version,
      isInitialized: dataDecoded.isInitialized !== 0,
      nonce: dataDecoded.bumpSeed,
      tokenProgramId: dataDecoded.tokenProgramId,
      lpTokenMint: dataDecoded.tokenPool,
      feeAccount: dataDecoded.feeAccount,
      token0Mint: dataDecoded.mintA,
      token0Account: dataDecoded.tokenAccountA,
      token1Mint: dataDecoded.mintB,
      token1Account: dataDecoded.tokenAccountB,
      tradeFeeNumerator: dataDecoded.tradeFeeNumerator,
      tradeFeeDenominator: dataDecoded.tradeFeeDenominator,
      ownerTradeFeeNumerator: dataDecoded.ownerTradeFeeNumerator,
      ownerTradeFeeDenominator: dataDecoded.ownerTradeFeeDenominator,
      ownerWithdrawFeeNumerator: dataDecoded.ownerWithdrawFeeNumerator,
      ownerWithdrawFeeDenominator: dataDecoded.ownerWithdrawFeeDenominator,
      hostFeeNumerator: dataDecoded.hostFeeNumerator,
      hostFeeDenominator: dataDecoded.hostFeeDenominator,
      curveType: dataDecoded.curveType,
      curveParameters: dataDecoded.curveParameters
    }
  }

  static serialize (layout, data, maxSpan) {
    const buffer = Buffer.alloc(maxSpan)
    const span = layout.encode(data, buffer)
    return buffer.slice(0, span)
  }

  static async findPoolAuthorityAddress (poolAddress, tokenSwapProgramId) {
    return PublicKey.findProgramAddress(
      [poolAddress.toBuffer()],
      tokenSwapProgramId
    )
  }
}
