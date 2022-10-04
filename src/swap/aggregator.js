import { PublicKey, Transaction } from '@solana/web3.js'
import { isProduction } from 'common/functions'
import { solToken } from 'common/orca/quote/stable-quote'
import { TokenProgramInstructionService } from 'common/pool/tokenProgramInstructionService'
import { TokenProgramService } from 'common/pool/tokenProgramService'
import FindAmmServices from 'common/swap/findAmmServices'
import { get } from 'lodash'

const ADDRESS_FEE = new PublicKey('5UrM9csUEDBeBqMZTuuZyHRNhbRW4vQ1MgKJDrKU1U2v')

export class AggregatorService {
  static async buildSwapTransaction (
    connection,
    routers,
    userAuthority,
    listAmm,
    signers,
    dataUiFeeSaros
  ) {
    const transaction = new Transaction()
    // if hasCloseAccountSol === true no need close account sol
    let hasCloseAccountSol = false
    for (const route of routers) {
      await TokenProgramService.resolveOrCreateAssociatedTokenAddress(
        connection,
        userAuthority,
        route.sourceToken,
        transaction,
        signers,
        route.amountIn.toString()
      )

      await TokenProgramService.resolveOrCreateAssociatedTokenAddress(
        connection,
        userAuthority,
        route.destinationToken,
        transaction,
        signers
      )

      const AMM = await AggregatorService.getAMM(route.type)
      const swapInstruction = await AMM.buildSwapInstruction(
        connection,
        route,
        userAuthority,
        listAmm
      )
      transaction.add(swapInstruction)
      // create swap instruction
    }

    // clean instruction
    for (const route of routers) {
      if (route.sourceToken.toString() === solToken.mint.toString()) {
        const sourceAddress =
          await TokenProgramService.findAssociatedTokenAddress(
            userAuthority,
            solToken.mint
          )
        const closeInstruction = TokenProgramService.closeAccountSol(
          userAuthority,
          sourceAddress
        )
        if (!hasCloseAccountSol) {
          transaction.add(closeInstruction)
        }
        hasCloseAccountSol = true
      }

      if (route.destinationToken.toString() === solToken.mint.toString()) {
        const destinationAddress =
          await TokenProgramService.findAssociatedTokenAddress(
            userAuthority,
            solToken.mint
          )
        const closeInstruction = TokenProgramService.closeAccountSol(
          userAuthority,
          destinationAddress
        )
        if (!hasCloseAccountSol) {
          transaction.add(closeInstruction)
        }
        hasCloseAccountSol = true
      }
    }
    if (!isProduction) {
      const feeAddress =
      await TokenProgramService.resolveOrCreateAssociatedTokenAddress(
        connection,
        ADDRESS_FEE,
        get(dataUiFeeSaros, 'mintAddress'),
        transaction,
        signers,
        get(dataUiFeeSaros, 'amount', '').toString()
      )
      const tokeInfo = routers.length > 1 ? routers[1] : routers[0]
      const sourceTokenAddress =
      await TokenProgramService.findAssociatedTokenAddress(
        userAuthority,
        get(tokeInfo, 'destinationToken')
      )
      const transferTokenInstruction = TokenProgramInstructionService.transfer(
        userAuthority,
        sourceTokenAddress,
        feeAddress,
        get(dataUiFeeSaros, 'amount', '')
      )
      transaction.add(transferTokenInstruction)
    }
    return transaction
  }

  static async getAMM (type) {
    try {
      return FindAmmServices.getAmmByType(type)
    } catch (err) {
      console.log({ err })
    }
  }
}
