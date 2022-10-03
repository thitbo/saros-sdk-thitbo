import { PublicKey } from '@solana/web3.js'
import { BorshService } from 'common/pool/borshService'
import { SarosSwapInstructionService } from 'common/pool/saros_swap/sarosSwapIntructions'
import BaseAPI from 'controller/api/BaseAPI'
import RPCSolana from 'controller/api/rpcSolana'
import { chunk, get } from 'lodash'
import SaberSwapService from './amm/saber'
import SarosAmmService, { SAROS_SWAP_PROGRAM_ADDRESS_V1 } from './amm/saros'
import {
  ALDRIN_POOLS_PROGRAM_ADDRESS,
  CURVE,
  POOL_LAYOUT,
  POOL_V2_LAYOUT
} from './amm/aldrin'
import base58 from 'bs58'
import { accountDiscriminator } from './utils'
import { genConnectionSolana } from 'common/solana'
import MercurialSwapService, { MERCURIAL_PROGRAM_ID } from './amm/mercurial'
import CropperSwapService from './amm/cropper'
import OrcaWhirlpoolSwapService from './amm/orca_whirpools'
import { TokenProgramInstructionService } from 'common/pool/tokenProgramInstructionService'
import { BN } from 'bn.js'

export const SAROS_AMM = 'saros'
export const ORCA_AMM = 'orca'
export const RAYDIUM_AMM = 'raydium'
export const SABER_AMM = 'saber'
export const ALDRIN_AMM = 'aldrin'
export const CREMA_AMM = 'crema'
export const CROPPER_AMM = 'cropper'
export const WHIRL_POOL = 'orca_whirpools'
export const MERCURIAL = 'mercurial'

// export interface Router {
//   address: Publickey
//   poolAddress: PublicKey
//   poolAuthority: PublicKey
//   poolSource: PublicKey
//   poolDestination: PublicKey
//   token0Mint: string
//   token1Mint: string
//   token0Account: Publickey
//   token1Account: Publickey
//   amountIn: BN
//   amountOut: BN,
//   sourceToken: PublicKey, -> account mint
//   destinationToken: PublicKey, -> account mint
//   type: string
//   address: publicKey
// }

// ______________ E-N-D____________
export const API_URL = 'https://api.aldrin.com/graphql'

export default class LiquidityAmm {
  static async getAllAmm () {
    const getPoolTokenOrca = BaseAPI.getData('ammMarket/pool/tokens')
    console.log('getPoolTokenOrca', getPoolTokenOrca);
    const [
      resPoolToken
    ] = await Promise.all([
      getPoolTokenOrca
    ])
    const [
      orcaPool
    ] = await Promise.all([
      this.convertPoolOrca(get(resPoolToken, 'orca', []))
    ])

    return {
      orca: orcaPool
    }
  }

  static async convertPoolOrca (poolList) {
    const newListFormat = Object.keys(poolList).map((key) => {
      const item = poolList[key]
      const ids = get(item, 'tokenIds', [])
      const token0Mint = ids[0]
      const token1Mint = ids[1]

      const address0 = get(item, `tokens.${token0Mint}.addr`)
      const address1 = get(item, `tokens.${token1Mint}.addr`)
      const data = {
        ...item,
        poolTokenMint: new PublicKey(item.poolTokenMint.toString()),
        feeAccount: new PublicKey(item.feeAccount.toString()),
        authority: new PublicKey(item.authority.toString()),
        address: new PublicKey(item.address.toString()),
        poolAddress: new PublicKey(item.address),
        token0Mint,
        token1Mint,
        token0Account: new PublicKey(address0),
        token1Account: new PublicKey(address1),
        type: ORCA_AMM,
        poolAuthority: new PublicKey(item.authority.toString()),
        poolSource: new PublicKey(address0),
        poolDestination: new PublicKey(address1)
      }
      return data
    })

    return newListFormat
  }



  
  // static fetchApi = async (url) => {
  //   try {
  //     const response = await fetch(url)
  //     return response.json()
  //   } catch (err) {
  //     return null
  //   }
  // };
}
