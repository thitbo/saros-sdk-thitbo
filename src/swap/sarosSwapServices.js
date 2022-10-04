/* eslint-disable new-cap */
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import get from 'lodash/get';
import { checkTypes, convertBalanceToWei } from '../functions';
import { genOwnerSolana, genConnectionSolana } from '../common';
import BaseAPI from '../controller/api/BaseAPI';
import LiquidityAmm from '../liquidity';
import { SolanaService } from '../SolanaService';
import { compact } from 'lodash';
import { AggregatorService } from './aggregator';

const UI_FEE_PERCENT = 0.1;
export class SarosSwapServices {
  constructor({ adapter, connection, payerAccount, listTokenSolana }) {
    this.connection = connection;
    this.adapter = adapter;
    this.payerAccount = payerAccount;
    this.listTokenSolana = listTokenSolana
    this.test = this.test.bind(this);
  }

  async test() {
    console.log('test ok type', this.adapter);
  }

  

  async findPoolLiquidity({ fromMint, toMint, slippage = 0.5, amount = 1 }) {
    // new flow swap  --------------------**------------------**---------------
    let base;
    let pair;

    const listToken = window.walletServices.tokenSolana;
    const fromCoin = listToken.find((token) => token.mintAddress === fromMint);
    const toCoin = listToken.find((token) => token.mintAddress === toMint);

    if (fromCoin && toCoin) {
      const getBaseData = this.adapter.postData('saros/swap/getPairsV2', {
        token0: fromCoin,
        token1: toCoin,
        amount,
        slippage: slippage * 100,
      });

      const getPairData = this.adapter.postData('saros/swap/getPairsV2', {
        token0: toCoin,
        token1: fromCoin,
        amount,
        slippage: slippage * 100,
      });

      const [baseData, pairData] = await Promise.all([
        getBaseData,
        getPairData,
      ]);

      base = baseData;
      pair = pairData;
    }
    const formatData = this.formatPoolInfo({ base: base, pair: pair });

    return formatData;
  }

  formatPoolInfo(data) {
    // this func is use only for "saros/swap/getPairsV2" format
    let amountOutBase;
    let amountOutPair;
    let impactOutBase;
    let impactOutPair;

    let listAmmCompareBase = [];
    let listAmmComparePair = [];

    let routerDataBase;
    let routerDataPair;

    let priceSaveBase;
    let priceSavePair;

    const { base, pair } = data;

    if (base && pair) {
      amountOutBase = get(base, 'router.routerData.amount', '');
      impactOutBase = get(base, 'router.routerData.impact', '');
      amountOutPair = get(pair, 'router.routerData.amount', '');
      impactOutPair = get(pair, 'router.routerData.impact', '');

      listAmmCompareBase = get(base, 'AmmCompareData', '');
      listAmmComparePair = get(pair, 'AmmCompareData', '');

      priceSaveBase = get(base, 'youSave', '');
      priceSavePair = get(pair, 'youSave', '');

      routerDataBase = get(base, 'router.routerData', '');
      routerDataPair = get(pair, 'router.routerData', '');
    }

    return {
      // pool,

      ammCompareData: {
        base: listAmmCompareBase,
        pair: listAmmComparePair,
      },

      swapRate: {
        base: amountOutBase,
        pair: amountOutPair,
      },
      priceImpact: {
        base: impactOutBase,
        pair: impactOutPair,
      },

      routerData: {
        base: routerDataBase,
        pair: routerDataPair,
      },

      youSave: {
        base: priceSaveBase,
        pair: priceSavePair,
      },
    };
  }

  calculateUiFee(amountOut) {
    if (!amountOut) return '';
    const uiFee = parseFloat(amountOut) * (UI_FEE_PERCENT / 100);
    return uiFee;
  }

  async onGetSwapRate({fromMint, toMint, amount, slippage = 0.5}) {

    const isRightType = checkTypes(
      [fromMint, toMint, amount, slippage = 0.5], 
      ['string', 'string', 'number', 'number'])

    console.log('isRightType', isRightType);
    if(!isRightType){
      console.log('err props type');
      return
    }

    try{
      const listToken = this.listTokenSolana;
      const fromToken = listToken.find(
        (token) => token.mintAddress === fromMint
      );
      const toToken = listToken.find((token) => token.mintAddress === toMint);
      const signers = [this.payerAccount];

      const response = await this.adapter.postData('saros/swap/getPairsV2', {
        token0: fromToken,
        token1: toToken,
        amount,
        slippage: slippage * 100,
      });

      if (!response) return {};
      return response
    }catch(e){
      console.log('err', e);
      return {};
    }
  }

  async onGetSwapInstructions({ fromMint, toMint, amount, slippage = 0.5 }) {
    const isRightType = checkTypes(
      [fromMint, toMint, amount, slippage], 
      ['string', 'string', 'number', 'number'])

    console.log('isRightType', isRightType);
    if(!isRightType){
      console.log('err props type');
      return
    }

    try {
      const listToken = this.listTokenSolana;
      const fromToken = listToken.find(
        (token) => token.mintAddress === fromMint
      );
      const toToken = listToken.find((token) => token.mintAddress === toMint);
      const signers = [this.payerAccount];

      const response = await this.adapter.postData('saros/swap/getPairsV2', {
        token0: fromToken,
        token1: toToken,
        amount,
        slippage: slippage * 100,
      });

      if (!response) return {};

      const smartRouter = get(response, 'router.routerData.router');
      const amountOut = get(response, 'router.routerData.amount', '');

      const uiFee = this.calculateUiFee(amountOut);
      const dataFeeTxs = {
        ...toToken,
        mintAddress: new PublicKey(get(toToken, 'mintAddress')),
        amount: new BN(
          parseFloat(uiFee) <= 0
            ? 0
            : convertBalanceToWei(uiFee, get(toToken, 'decimals', 6))
        ),
      };

      const routers = smartRouter.map((route) => {
        const type = get(route, 'type.type');
        const routeAddress = get(route, 'address', '');
        const poolAuthority = get(route, 'authority', ''); // chua tien trong pool
        const poolSource = get(route, 'token0', '');
        const poolDestination = get(route, 'token1', '');
        const amountIn = new BN(get(route, 'amountIn'));
        const amountOut = new BN(get(route, 'amountOut'));
        return {
          poolAddress: new PublicKey(routeAddress.toString()),
          poolAuthority: new PublicKey(poolAuthority.toString()),
          poolSource: new PublicKey(poolSource.toString()),
          poolDestination: new PublicKey(poolDestination.toString()),
          amountIn,
          amountOut,
          sourceToken: new PublicKey(get(route, 'token0')),
          destinationToken: new PublicKey(get(route, 'token1')),
          type,
        };
      });

      const dataPool = await LiquidityAmm.getAllAmm();
      const listPool = [
        // ...dataPool.saros,
        ...dataPool.orca,
        // ...dataPool.aldrin,
        // ...dataPool.crema,
        // ...dataPool.cropper
        // ...dataPool.saber,
        // ...dataPool.whirlpool,
        // ...dataPool.mercurial,
        // ...dataPool.raydium
      ];

      console.log('routers', routers);

      const transactionList = await AggregatorService.buildSwapTransaction(
        this.connection,
        routers,
        this.payerAccount.publicKey,
        listPool,
        signers,
        dataFeeTxs
      );

      return transactionList;
    } catch (e) {
      console.log('err', e);
    }
  }


  // async fetchTokenSolana() {
  //   try {
  //     const getAllTokenSolana = await this.adapter.getData('solanaToken');
  //     if (getAllTokenSolana) {
  //       return getAllTokenSolana;
  //     } else return [];
  //   } catch (e) {
  //     console.log(e);
  //     return [];
  //   }
  // }

  async getTopMintAddressSwap() {
    try {
      const response = await this.adapter.getData('saros/token/topMint');
      if (!response) return [];
      console.log('response top mint', response);
      const filterList = this.listTokenSolana.filter(item => response.includes(item.mintAddress) )
       return filterList
    } catch (e) {
      console.log(e);
      return [];
    }
  }

  async getHistorySwap({ page = 1, size = 10 }) {
    try {
      const params = {
        page: page,
        size: size,
      };
      const res = await this.adapter.getData('saros/swap/history', params); // useBaseAdapter
      if (!res) return [];
      return res;
    } catch (e) {
      console.log(e);
      return [];
    }
  }

  // async getRecentSwapList() {
  //   try {
  //     const res = await this.adapter.getData('favorite', {
  //       type: 'sarosRecentSwap',
  //       version: '2',
  //     });

  //     if (res && res.success) {
  //       const listRecentSwap = get(res, 'data[0].bonusValue', []);
  //       return listRecentSwap;
  //     } else return [];
  //   } catch (e) {
  //     console.log(e);
  //     return [];
  //   }
  // }

  // async updateRecentSwapList(list = []) {
  //   try {
  //     const resListSwap = await this.adapter.getData('favorite/take', {
  //       // useBaseAdapter
  //       type: 'sarosRecentSwap',
  //       bonusValue: compact(list),
  //     });
  //     if (resListSwap && resListSwap.success) {
  //       return true;
  //     } else return false;
  //   } catch (e) {
  //     console.log(e);
  //     return false;
  //   }
  // }
}
