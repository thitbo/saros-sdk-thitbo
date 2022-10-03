import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import * as borsh from '@project-serum/borsh'
import { TokenProgramService } from 'common/pool/tokenProgramService'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { BorshService } from 'common/pool/borshService'

const ADMIN = new PublicKey('DyDdJM9KVsvosfXbcHDp4pRpmbMHkRq3pcarBykPy4ir')
const CROPPER_PROGRAM_ID = new PublicKey(
  'CTMAxxk34HjKWxQ3QLZK1HpaLXmBveao3ESePXbiyfzh'
)

const STABLE_SWAP_LAYOUT = borsh.struct([
  borsh.u8('version'),
  borsh.u8('isInitialized'),
  borsh.u8('nonce'),
  borsh.publicKey('ammId'),
  borsh.publicKey('dexProgramId'),
  borsh.publicKey('marketId'),
  borsh.publicKey('tokenProgramId'),
  borsh.publicKey('tokenA'),
  borsh.publicKey('tokenB'),
  borsh.publicKey('poolMint'),
  borsh.publicKey('tokenAMint'),
  borsh.publicKey('tokenBMint')
])

const SWAP_LAYOUT = borsh.struct([
  borsh.u8('instruction'),
  borsh.u64('amountIn'),
  borsh.u64('minimumAmountOut')
])

export default class CropperSwapService {
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

    const feeAccount = await TokenProgramService.findAssociatedTokenAddress(
      ADMIN,
      router.sourceToken
    )

    const poolInfo = await CropperSwapService.getPoolAccountInfo(
      connection,
      router.poolAddress
    )

    const [authority] = await PublicKey.findProgramAddress(
      [poolInfo.ammId.toBuffer()],
      CROPPER_PROGRAM_ID
    )

    const keys = [
      { pubkey: router.poolAddress, isSigner: false, isWritable: false },
      { pubkey: authority, isSigner: false, isWritable: false },
      { pubkey: userAuthority, isSigner: true, isWritable: false },
      {
        pubkey: new PublicKey('3hsU1VgsBgBgz5jWiqdw9RfGU6TpWdCmdah1oi4kF3Tq'),
        isSigner: false,
        isWritable: false
      },
      { pubkey: userSource, isSigner: false, isWritable: true },
      {
        pubkey:
          router.sourceToken.toString() === poolInfo.tokenAMint.toString()
            ? router.poolSource
            : router.poolDestination,
        isSigner: false,
        isWritable: true
      },
      {
        pubkey:
          router.destinationToken.toString() === poolInfo.tokenBMint.toString()
            ? router.poolDestination
            : router.poolSource,
        isSigner: false,
        isWritable: true
      },
      { pubkey: userDestination, isSigner: false, isWritable: true },
      { pubkey: poolInfo.poolMint, isSigner: false, isWritable: true },
      { pubkey: feeAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
    ]

    return new TransactionInstruction({
      keys,
      data,
      programId: CROPPER_PROGRAM_ID
    })
  }

  static async getPoolAccountInfo (connection, poolAddress) {
    const accountInfo = await connection.getAccountInfo(poolAddress)

    const poolInfo = CropperSwapService.decodePoolAccount(accountInfo.data)
    return poolInfo
  }

  static decodePoolAccount (data) {
    const dataDecoded = BorshService.deserialize(STABLE_SWAP_LAYOUT, data)

    return dataDecoded
  }
}
