import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import * as borsh from '@project-serum/borsh'
import { computeY } from './utils'
import BN from 'bn.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { BorshService } from 'common/pool/borshService'
import { TokenProgramService } from 'common/pool/tokenProgramService'

const SABER_PROGRAM_ID = new PublicKey('SSwpkEEcbUqx4vtoEByFjSkhKdCT862DNVb52nZg1UZ')

const N_COIN = new BN(2)

const ONE = new BN(1)
const ZERO = new BN(0)

const STABLE_SWAP_LAYOUT = borsh.struct([
  borsh.u8('isInitialized'),
  borsh.u8('isPaused'),
  borsh.u8('nonce'),
  borsh.u64('initialAmpFactor'),
  borsh.u64('targetAmpFactor'),
  borsh.i64('startRampTs'),
  borsh.i64('stopRampTs'),
  borsh.i64('futureAdminDeadline'),
  borsh.publicKey('futureAdminAccount'),
  borsh.publicKey('adminAccount'),
  borsh.publicKey('tokenAccountA'),
  borsh.publicKey('tokenAccountB'),
  borsh.publicKey('tokenPool'),
  borsh.publicKey('mintA'),
  borsh.publicKey('mintB'),
  borsh.publicKey('adminFeeAccountA'),
  borsh.publicKey('adminFeeAccountB'),
  borsh.u64('adminTradeFeeNumerator'),
  borsh.u64('adminTradeFeeDenominator'),
  borsh.u64('adminWithdrawFeeNumerator'),
  borsh.u64('adminWithdrawFeeDenominator'),
  borsh.u64('tradeFeeNumerator'),
  borsh.u64('tradeFeeDenominator'),
  borsh.u64('withdrawFeeNumerator'),
  borsh.u64('withdrawFeeDenominator')
])

const SWAP_LAYOUT = borsh.struct([
  borsh.u8('instruction'),
  borsh.u64('amountIn'),
  borsh.u64('minimumAmountOut')
])

export default class SaberSwapService {
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

    const poolInfo = await SaberSwapService.getPoolAccountInfo(connection, router.poolAddress)
    const userSource = await TokenProgramService.findAssociatedTokenAddress(userAuthority, router.sourceToken)
    const userDestination = await TokenProgramService.findAssociatedTokenAddress(userAuthority, router.destinationToken)
    const keys = [
      { pubkey: router.poolAddress, isSigner: false, isWritable: false },
      { pubkey: router.poolAuthority, isSigner: false, isWritable: false },
      { pubkey: userAuthority, isSigner: true, isWritable: false },
      { pubkey: userSource, isSigner: false, isWritable: true },
      { pubkey: router.poolSource, isSigner: false, isWritable: true },
      { pubkey: router.poolDestination, isSigner: false, isWritable: true },
      { pubkey: userDestination, isSigner: false, isWritable: true },
      {
        pubkey:
          router.sourceToken.toString() === poolInfo.mintA.toString()
            ? poolInfo.adminFeeAccountB
            : poolInfo.adminFeeAccountA,
        isSigner: false,
        isWritable: true
      },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
    ]
    return new TransactionInstruction({
      keys,
      data,
      programId: SABER_PROGRAM_ID
    })
  }

  static calculateAmpFactor (state, now = new BN(Date.now() / 1000)) {
    const { initialAmpFactor, targetAmpFactor, startRampTs, stopRampTs } = state

    if (now.cmp(stopRampTs) >= 0) {
      return targetAmpFactor
    }

    if (now.cmp(startRampTs) <= 0) {
      return initialAmpFactor
    }

    const percent = now.cmp(stopRampTs) >= 0 ? new BN(1) : (now.cmp(startRampTs) <= 0 ? new BN(0) : now.sub(startRampTs).div(stopRampTs.sub(startRampTs)))

    const diff = Math.floor(parseFloat(targetAmpFactor.sub(initialAmpFactor).toString()) * parseFloat(percent.toString()))

    return new BN(diff)
  }

  static async getRate (connection, poolAddress, amountIn, amountPools, fromIndex, toIndex) {
    const accountInfo = await connection.getAccountInfo(poolAddress)
    const poolInfo = SaberSwapService.decodePoolAccount(accountInfo.data)

    const ampFactor = SaberSwapService.calculateAmpFactor({
      ...poolInfo
    })

    if (amountIn.toString() === '0') {
      return new BN(0)
    }

    const x = amountPools[fromIndex].add(amountIn)
    const y = computeY(ampFactor, fromIndex, toIndex, x, amountPools)

    const amountBeforeFee = amountPools[toIndex].sub(y)

    const baseFee = poolInfo.tradeFeeNumerator.mul(amountBeforeFee).div(poolInfo.tradeFeeDenominator)
    return amountBeforeFee.sub(baseFee)
  }

  static async getPoolAccountInfo (connection, poolAddress) {
    const accountInfo = await connection.getAccountInfo(poolAddress)

    const poolInfo = SaberSwapService.decodePoolAccount(accountInfo.data)
    return poolInfo
  }

  static decodePoolAccount (data) {
    const dataDecoded = BorshService.deserialize(STABLE_SWAP_LAYOUT, data)

    return dataDecoded
  }
}
