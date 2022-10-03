import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import * as borsh from '@project-serum/borsh'
import { TokenProgramService } from 'common/pool/tokenProgramService'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { BorshService } from 'common/pool/borshService'

const CREMA_PROGRAM_ID = new PublicKey(
  '6MLxLqiXaaSUpkgMnWDTuejNZEz3kE7k2woyHGVFw319'
)

const SWAP_LAYOUT = borsh.struct([
  borsh.u8('instruction'),
  borsh.u64('amountIn'),
  borsh.u64('minimumAmountOut')
])

export const ADMIN_SETTINGS_LAYOUT = borsh.struct([
  borsh.bool('swapEnabled'),
  borsh.bool('addLiquidityEnabled')
])

export const TOKEN_SWAP_ACCOUNT_LAYOUT = borsh.struct(
  [
    borsh.u8('version'),
    borsh.publicKey('tokenSwapKey'),
    borsh.u8('accountType'),
    borsh.u8('isInitialized'),
    borsh.u8('nonce'),
    borsh.publicKey('tokenProgramId'),
    borsh.publicKey('manager'),
    borsh.publicKey('managerTokenA'),
    borsh.publicKey('managerTokenB'),
    borsh.publicKey('swapTokenA'),
    borsh.publicKey('swapTokenB'),
    borsh.publicKey('tokenAMint'),
    borsh.publicKey('tokenBMint'),
    borsh.publicKey('ticksKey'),
    borsh.publicKey('positionsKey')
    /// ignore
    /*
    u8("curveType"),
    decimalU64("fee", 12),
    decimalU64("managerFee", 12),
    u32("tickSpace"),
    decimalU128("currentSqrtPrice", 12),
    decimalU128("currentLiquity"),
    decimalU128("feeGrowthGlobal0", 16),
    decimalU128("feeGrowthGlobal1", 16),
    decimalU128("managerFeeA"),
    decimalU128("managerFeeB"),
    */
  ],
  'tokenSwapAccount'
)

export default class CremaSwapService {
  static async buildSwapInstruction (connection, router, userAuthority) {
    const data = Buffer.alloc(SWAP_LAYOUT.span)
    SWAP_LAYOUT.encode(
      {
        instruction: 1, // Swap instruction
        amountIn: router.amountIn,
        minimumAmountOut: router.amountOut
      },
      data
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

    const poolInfo = await CremaSwapService.getPoolAccountInfo(
      connection,
      router.poolAddress
    )
    const [authority] = await PublicKey.findProgramAddress(
      [poolInfo.tokenSwapKey.toBuffer()],
      CREMA_PROGRAM_ID
    )

    const keys = [
      { pubkey: router.poolAddress, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: false, isWritable: false },
      { pubkey: userAuthority, isSigner: true, isWritable: false },
      { pubkey: userSource, isSigner: false, isWritable: true },
      { pubkey: userDestination, isSigner: false, isWritable: true },
      { pubkey: router.poolSource, isSigner: false, isWritable: true },
      { pubkey: router.poolDestination, isSigner: false, isWritable: true },
      { pubkey: poolInfo.ticksKey, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
    ]

    console.log({ userSource, poolInfo, keys })

    return new TransactionInstruction({
      keys,
      data,
      programId: CREMA_PROGRAM_ID
    })
  }

  static async getPoolAccountInfo (connection, poolAddress) {
    const accountInfo = await connection.getAccountInfo(poolAddress)

    const poolInfo = CremaSwapService.decodePoolAccount(accountInfo.data)
    return poolInfo
  }

  static decodePoolAccount (data) {
    const dataDecoded = BorshService.deserialize(
      TOKEN_SWAP_ACCOUNT_LAYOUT,
      data
    )

    return dataDecoded
  }
}
