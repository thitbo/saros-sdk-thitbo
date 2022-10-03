import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import * as borsh from '@project-serum/borsh'
import { TokenProgramService } from 'common/pool/tokenProgramService'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { BorshService } from 'common/pool/borshService'
import BN from 'bn.js'
import { computeY } from './utils'

export const MERCURIAL_PROGRAM_ID = new PublicKey(
  'MERLuDFBMmsHnsBPZw2sDQZHvXFMwp8EdjudcU2HKky'
)

export const MAX_N_COINS = 4

const SWAP_LAYOUT = borsh.struct([
  borsh.u8('instruction'),
  borsh.u64('amountIn'),
  borsh.u64('minimumAmountOut')
])

export const ADMIN_SETTINGS_LAYOUT = borsh.struct([
  borsh.bool('swapEnabled'),
  borsh.bool('addLiquidityEnabled')
])

export const SWAP_STATE = borsh.struct([
  borsh.u8('version'),
  borsh.bool('isInitialized'),
  borsh.u8('nonce'),
  borsh.u64('amplificationCoefficient'),
  borsh.u64('feeNumerator'),
  borsh.u64('adminFeeNumerator'),
  borsh.u32('tokenAccountsLength'),
  borsh.u64('precisionFactor'),
  borsh.array(borsh.u64(), MAX_N_COINS, 'precisionMultipliers'),
  borsh.array(borsh.publicKey(), MAX_N_COINS, 'tokenAccounts'),
  borsh.publicKey('poolMint'),
  borsh.publicKey('adminTokenMint'),
  ADMIN_SETTINGS_LAYOUT.replicate('adminSettings')
])

export default class MercurialSwapService {
  static async buildSwapInstruction (connection, router, userAuthority) {
    const data = Buffer.alloc(SWAP_LAYOUT.span)
    SWAP_LAYOUT.encode(
      {
        instruction: 4, // Swap instruction
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

    const poolInfo = await MercurialSwapService.getPoolAccountInfo(
      connection,
      router.poolAddress
    )
    const tokenAccounts = poolInfo.tokenAccounts.filter(
      (item) => item.toString() !== '11111111111111111111111111111111'
    )

    const keys = [
      { pubkey: router.poolAddress, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: router.poolAuthority, isSigner: false, isWritable: false },
      { pubkey: userAuthority, isSigner: true, isWritable: false },
      ...tokenAccounts.map((tokenAccount) => ({
        pubkey: tokenAccount,
        isSigner: false,
        isWritable: true
      })),
      { pubkey: userSource, isSigner: false, isWritable: true },
      { pubkey: userDestination, isSigner: false, isWritable: true }
    ]
    return new TransactionInstruction({
      keys,
      data,
      programId: MERCURIAL_PROGRAM_ID
    })
  }

  static async getRate (poolInfo, amountIn, amountPools, fromIndex, toIndex) {
    // const accountInfo = await connection.getAccountInfo(poolAddress)
    // const poolInfo = MercurialSwapService.decodePoolAccount(accountInfo.data)

    if (amountIn.toString() === '0') {
      return new BN(0)
    }
    const precisionFactor = new BN(10 ** poolInfo.precisionFactor.toNumber())
    const xp = amountPools.map((item, index) => item.mul(poolInfo.precisionMultipliers[index].mul(precisionFactor)).div(precisionFactor))
    const x = xp[fromIndex].add(amountIn.mul(poolInfo.precisionMultipliers[fromIndex].mul(precisionFactor)).div(precisionFactor))
    const y = computeY(poolInfo.amplificationCoefficient, fromIndex, toIndex, x, xp)

    const dy = xp[toIndex].sub(y)
    return dy
  }

  static async getPoolAccountInfo (connection, poolAddress) {
    const accountInfo = await connection.getAccountInfo(poolAddress)

    const poolInfo = MercurialSwapService.decodePoolAccount(accountInfo.data)
    return poolInfo
  }

  static decodePoolAccount (data) {
    const dataDecoded = BorshService.deserialize(SWAP_STATE, data)

    return dataDecoded
  }
}
