import { PublicKey } from '@solana/web3.js';
import bigdecimal from 'bigdecimal';
import { get } from 'lodash';

export const SOL_BLOCK_TIME = 0.4; // 0.4s
export const BLOCKS_PER_YEAR = (60 / SOL_BLOCK_TIME) * 60 * 24 * 365; // 78840000
export const PRECISION_MULTIPLIER = 10 ** 9;

export const convertWeiToBalance = (strValue, iDecimal = 18) => {
  try {
    if (parseFloat(strValue) === 0) return 0;
    const multiplyNum = new bigdecimal.BigDecimal(Math.pow(10, iDecimal));
    const convertValue = new bigdecimal.BigDecimal(String(strValue));
    return convertValue.divide(multiplyNum).toString();
  } catch (err) {
    return 0;
  }
};

export const convertBalanceToWei = (strValue, iDecimal = 18) => {
  try {
    const multiplyNum = new bigdecimal.BigDecimal(Math.pow(10, iDecimal));
    const convertValue = new bigdecimal.BigDecimal(String(strValue));
    return multiplyNum.multiply(convertValue).toString().split('.')[0];
  } catch (err) {
    return 0;
  }
};

export const renderAmountSlippage = (amount, slippage) => {
  return (parseFloat(amount) * parseFloat(slippage)) / 100;
};

export const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const getPriceBaseId = async (id) => {
  const response = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`
  );
  const body = await response.json();
  return get(body, `${id}.usd`, 0);
};

const getType = (value) => {
  return Object.prototype.toString.call(value).match(/\s(\w+)/)[1].toLowerCase()
};

export const checkTypes = ( params, types ) => {
  const paramsArr = Array.prototype.slice.call(params)
  let result = true
  for (let i = 0; i < types.length; ++i) {
    if (getType(paramsArr[i]) !== types[i]) {
      console.log('param ' + i + ' must be of type ' + types[i])
      result = false
    }
  }
  return result
}

export const validateSolanaAddress = (listAddress = []) => {
  let result = true
  for (let i = 0; i < listAddress.length; ++i) {
    try {
      const address = new PublicKey(listAddress[i])
    } catch (error) {
      result = false
    }
  }
  return result
}
