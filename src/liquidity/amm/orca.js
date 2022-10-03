import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import * as borsh from '@project-serum/borsh'
import { TokenProgramService } from 'common/pool/tokenProgramService'
import { TOKEN_PROGRAM_ID } from '../programId'

const ORCA_PROGRAM_ID = new PublicKey(
  '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP'
)

export default class OrcaSwapService {
  static async buildSwapInstruction (
    connection,
    router,
    userAuthority,
    listAmm
  ) {
    const dataLayout = borsh.struct([
      borsh.u8('instruction'),
      borsh.u64('amountIn'),
      borsh.u64('minimumAmountOut')
    ])
    const data = OrcaSwapService.serialize(
      dataLayout,
      {
        instruction: 1, // Swap instruction
        amountIn: router.amountIn,
        minimumAmountOut: router.amountOut
      },
      128
    )

    const poolParams = listAmm.find(
      (item) => item.poolAddress.toString() === router.poolAddress.toString()
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

    const [authorityForPoolAddress] = await PublicKey.findProgramAddress(
      [poolParams.address.toBuffer()],
      ORCA_PROGRAM_ID
    )
    const { inputPoolToken, outputPoolToken } = OrcaSwapService.getTokens(
      poolParams,
      router.sourceToken.toString()
    )

    const keys = [
      { pubkey: poolParams.poolAddress, isSigner: false, isWritable: false },
      { pubkey: authorityForPoolAddress, isSigner: false, isWritable: false },
      { pubkey: userAuthority, isSigner: true, isWritable: false },
      { pubkey: userSource, isSigner: false, isWritable: true },
      {
        pubkey:
          router.sourceToken.toString() === inputPoolToken.mint.toString()
            ? inputPoolToken.addr
            : outputPoolToken.addr,
        isSigner: false,
        isWritable: true
      },

      {
        pubkey:
          router.destinationToken.toString() === outputPoolToken.mint.toString()
            ? outputPoolToken.addr
            : inputPoolToken.addr,
        isSigner: false,
        isWritable: true
      },
      { pubkey: userDestination, isSigner: false, isWritable: true },
      { pubkey: poolParams.poolTokenMint, isSigner: false, isWritable: true },
      { pubkey: poolParams.feeAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
    ]

    return new TransactionInstruction({
      keys,
      programId: ORCA_PROGRAM_ID,
      data
    })
  }

  static getTokens (poolParams, inputTokenId) {
    if (poolParams.tokens[inputTokenId] === undefined) {
      // throw new Error('Input token not part of pool');
      return null
    }

    const tokenAId = poolParams.tokenIds[0]
    const tokenBId = poolParams.tokenIds[1]

    const forward = tokenAId === inputTokenId

    const inputOrcaToken = forward
      ? poolParams.tokens[tokenAId]
      : poolParams.tokens[tokenBId]
    const outputOrcaToken = forward
      ? poolParams.tokens[tokenBId]
      : poolParams.tokens[tokenAId]
    const inputMint = forward ? tokenAId : tokenBId
    const outputMint = forward ? tokenBId : tokenAId
    const inputAddress = inputOrcaToken.addr || inputOrcaToken.address
    const outputAddress = outputOrcaToken.addr || outputOrcaToken.address
    return {
      inputPoolToken: {
        ...inputOrcaToken,
        mint: new PublicKey(inputMint),
        addr: inputAddress ? new PublicKey(inputAddress) : ''
      },
      outputPoolToken: {
        ...outputOrcaToken,
        mint: new PublicKey(outputMint),
        addr: outputAddress ? new PublicKey(outputAddress) : ''
      }
    }
  }

  static serialize (layout, data, maxSpan) {
    const buffer = Buffer.alloc(maxSpan)
    const span = layout.encode(data, buffer)
    return buffer.slice(0, span)
  }
}
