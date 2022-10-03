// --------- PARAMS TYPE SWAP INSTRUCTION -----------

import { TransactionInstruction } from '@solana/web3.js'
import LiquidityAmm from 'common/liquidity'
import {
  STABLE_SWAP_LAYOUT_AMM_SABER,
  SWAP_LAYOUT_SABER
} from 'common/liquidity/layout'
import { SABER_PROGRAM_ID, TOKEN_PROGRAM_ID } from 'common/liquidity/programId'
import { TokenProgramService } from 'common/pool/tokenProgramService'

export class SwapInstructionServices {
  static async SaberSwapInstruction (connection, router, userAuthority) {
    const data = Buffer.alloc(SWAP_LAYOUT_SABER.span)
    SWAP_LAYOUT_SABER.encode(
      {
        instruction: 1, // Swap instruction
        amountIn: router.amountIn,
        minimumAmountOut: router.amountOut
      },
      data
    )

    const poolInfo = await LiquidityAmm.getPoolAccountInfoBaseLayout(
      connection,
      router.poolAddress,
      STABLE_SWAP_LAYOUT_AMM_SABER
    )

    const userSource = TokenProgramService.findAssociatedTokenAddress(
      userAuthority,
      router.sourceToken
    )
    const userDestination = TokenProgramService.findAssociatedTokenAddress(
      userAuthority,
      router.destinationToken
    )

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
}
