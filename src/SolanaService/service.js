import { PublicKey } from "@solana/web3.js"
import { get } from "lodash"
import { encodeMessErr, genConnectionSolana, signTransaction } from "../common"

export class SolanaService {
  static async isAddressInUse (connection, address
  ) {
    const programInf = await connection.getAccountInfo(address)
    return programInf !== null
  }

  static async isAddressAvailable (connection, address
  ) {
    const programInf = await connection.getAccountInfo(address)
    return programInf === null
  }

  static async postBaseSendTxsNew (
    conn,
    transactions,
    signer,
    accountSol,
    isWaitDone,
    callBack,
    callBackFinal,
    dataReturn
  ) {
    try {
      const rpc = get(window, 'walletServices.setting.transaction')
      const connection = conn || genConnectionSolana(rpc)
      let action = 'sendTransaction'
      console.log('signer', signer);
      const isMobile = true
      if (isMobile) {
        console.log('oke mobile');
        const publicKey = new PublicKey(accountSol)
        transactions.feePayer = publicKey
        transactions.recentBlockhash = (
          await connection.getRecentBlockhash('max')
        ).blockhash
        transactions = await signTransaction(transactions)
        if (signer.length > 1) {
          const getSignerValid = signer.slice().filter((it) => it.secretKey)
          transactions.partialSign(...getSignerValid)
        }
        transactions = transactions.serialize()
        action = 'sendRawTransaction'
      }
  
      const tx = await connection[action](transactions, signer, {
        skipPreflight: true,
        preflightCommitment: 'confirmed'
      }).catch((err) => {
        console.log({ err })
        const data = JSON.stringify(get(err, 'logs', ''))
        return { isErr: true, data: encodeMessErr(data) }
      })
      const { isErr } = tx
      if (isErr) {
        return tx
      }
      console.log({ tx })
      callBack && callBack(tx, dataReturn)
      connection.onSignatureWithOptions(
        tx,
        async () => {
          if (isWaitDone) {
            callBackFinal && callBackFinal(tx, dataReturn)
          }
        },
        {
          commitment: 'confirmed'
        }
      )
      return tx
    } catch (err) {
      console.log('txs solana err: ', err)
      return { isErr: true, data: encodeMessErr(err) }
    }
  }
}
