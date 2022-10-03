import { sha256 } from 'js-sha256'
import { union, u8, blob } from '@solana/buffer-layout'

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
