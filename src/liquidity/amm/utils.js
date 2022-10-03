import { sha256 } from 'js-sha256'
import { union, u8, blob } from '@solana/buffer-layout'
import BN from 'bn.js'

export const ZERO = new BN(0)
export const ONE = new BN(1)
export const TWO = new BN(2)

function shaGen (prefix, name) {
  const preimage = `${prefix}:${name}`
  return Buffer.from(sha256.digest(preimage)).slice(0, 8)
}

export function instructionDiscriminator (name) {
  return shaGen('global', name)
}

// Calculates unique 8 byte discriminator prepended to all anchor accounts.
export async function accountDiscriminator (name) {
  return shaGen('account', name)
}

export const rustEnum = (variants, property) => {
  const unionLayout = union(u8(), blob(0), property)

  variants.forEach((variant, index) =>
    unionLayout.addVariant(index, variant, variant.property || '')
  )
  return unionLayout
}

export function computeD (ampFactor, amounts) {
  const nCoin = new BN(amounts.length)
  const ann = ampFactor.mul(nCoin)
  const s = amounts.reduce((curr, prev) => curr.add(prev), ZERO)

  if (s.eq(ZERO)) {
    return ZERO
  }

  let dPrev = ZERO
  let d = s

  for (let i = 0; i < 255; i++) {
    let db = d
    for (const amount of amounts) {
      db = db.mul(d).div(amount.mul(nCoin))
    }

    dPrev = d

    d = ann
      .mul(s)
      .add(db.mul(nCoin))
      .mul(d)
      .div(ann.sub(ONE).mul(d).add(nCoin.add(ONE).mul(db)))

    if (d.gte(dPrev)) {
      if (d.sub(dPrev).lte(ONE)) {
        break
      }
    } else {
      if (dPrev.sub(d).lte(ONE)) {
        break
      }
    }
  }

  return d
}

export function computeY (ampFactor, i, j, x, amounts) {
  const nCoin = new BN(amounts.length)
  const d = computeD(ampFactor, amounts)
  let c = d
  let s = ZERO

  const ann = ampFactor.mul(nCoin)

  let _x = ZERO
  for (let _i = 0; +_i < amounts.length; _i++) {
    if (_i === i) {
      _x = x
    } else if (_i !== j) {
      _x = amounts[_i]
    } else {
      continue
    }
    s = s.add(_x)
    c = c.mul(d).div(_x.mul(nCoin))
  }

  c = c.mul(d).div(ann.mul(nCoin))

  const b = s.add(d.div(ann))
  let yPrev = ZERO
  let y = d

  for (let i = 0; i < 255; i++) {
    yPrev = y
    y = y.mul(y).add(c).div(TWO.mul(y).add(b).sub(d))

    if (y.gt(yPrev)) {
      if (y.sub(yPrev).lte(ONE)) {
        break
      }
    } else if (yPrev.sub(y).lte(ONE)) {
      break
    }
  }

  return y
}
