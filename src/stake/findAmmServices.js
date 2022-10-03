import SarosServices from '../liquidity/amm/saros'
import OrcaServices from '../liquidity/amm/orca'
import AldrinServices from '../liquidity/amm/aldrin'
import SaberServices from '../liquidity/amm/saber'
import RaydiumService from '../liquidity/amm/raydium'
import CremaService from '../liquidity/amm/crema'
import CropperService from '../liquidity/amm/cropper'

export default class FindAmmServices {
  static getAmmByType (type) {
    console.log({ type })
    return FindAmmServices[type]()
  }

  static saros () {
    return SarosServices
  }

  static orca () {
    return OrcaServices
  }

  static aldrin () {
    return AldrinServices
  }

  static saber () {
    return SaberServices
  }

  static raydium () {
    return RaydiumService
  }

  static crema () {
    return CremaService
  }

  static cropper () {
    return CropperService
  }
}
