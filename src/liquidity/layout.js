import * as borsh from '@project-serum/borsh'

const FEE_LAYOUT_AMM_SABER = borsh.struct([
  borsh.u64('adminTradeFeeNumerator'),
  borsh.u64('adminTradeFeeDenominator'),
  borsh.u64('adminWithdrawFeeNumerator'),
  borsh.u64('adminWithdrawFeeDenominator'),
  borsh.u64('tradeFeeNumerator'),
  borsh.u64('tradeFeeDenominator'),
  borsh.u64('withdrawFeeNumerator'),
  borsh.u64('withdrawFeeDenominator')
])

export const STABLE_SWAP_LAYOUT_AMM_SABER = borsh.struct([
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
  FEE_LAYOUT_AMM_SABER
])

export const SWAP_LAYOUT_SABER = borsh.struct([
  borsh.u8('instruction'),
  borsh.u64('amountIn'),
  borsh.u64('minimumAmountOut')
])
