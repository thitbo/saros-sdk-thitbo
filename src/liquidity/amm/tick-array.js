export const TICK_ARRAY_SIZE = 88
export const MIN_TICK_INDEX = -443636
export const MAX_TICK_INDEX = 443636

export class TickArrayIndex {
  static fromTickIndex (index, tickSpacing) {
    const arrayIndex = Math.floor(
      Math.floor(index / tickSpacing) / TICK_ARRAY_SIZE
    )
    let offsetIndex = Math.floor(
      (index % (tickSpacing * TICK_ARRAY_SIZE)) / tickSpacing
    )
    if (offsetIndex < 0) {
      offsetIndex = TICK_ARRAY_SIZE + offsetIndex
    }
    return new TickArrayIndex(arrayIndex, offsetIndex, tickSpacing)
  }

  toTickIndex () {
    return (
      this.arrayIndex * TICK_ARRAY_SIZE * this.tickSpacing +
      this.offsetIndex * this.tickSpacing
    )
  }

  toNextInitializableTickIndex () {
    return TickArrayIndex.fromTickIndex(
      this.toTickIndex() + this.tickSpacing,
      this.tickSpacing
    )
  }

  toPrevInitializableTickIndex () {
    return TickArrayIndex.fromTickIndex(
      this.toTickIndex() - this.tickSpacing,
      this.tickSpacing
    )
  }
}

export class TickArraySequence {
  checkArrayContainsTickIndex (sequenceIndex, tickIndex) {
    const tickArray = this.tickArrays[sequenceIndex].data
    if (!tickArray) {
      return false
    }
    return this.checkIfIndexIsInTickArrayRange(
      tickArray.startTickIndex,
      tickIndex
    )
  }

  getNumOfTouchedArrays () {
    return this.touchedArrays.filter((val) => !!val).length
  }

  getTouchedArrays (minArraySize) {
    let result = this.touchedArrays.reduce((prev, curr, index) => {
      if (curr) {
        prev.push(this.tickArrays[index].address)
      }
      return prev
    }, [])

    // Edge case: nothing was ever touched.
    if (result.length === 0) {
      return []
    }

    // The quote object should contain the specified amount of tick arrays to be plugged
    // directly into the swap instruction.
    // If the result does not fit minArraySize, pad the rest with the last touched array
    const sizeDiff = minArraySize - result.length
    if (sizeDiff > 0) {
      result = result.concat(Array(sizeDiff).fill(result[result.length - 1]))
    }

    return result
  }

  getTick (index) {
    const targetTaIndex = TickArrayIndex.fromTickIndex(index, this.tickSpacing)

    if (!this.isArrayIndexInBounds(targetTaIndex, this.aToB)) {
      throw new Error(
        'Provided tick index is out of bounds for this sequence.'
      )
    }

    const localArrayIndex = this.getLocalArrayIndex(
      targetTaIndex.arrayIndex,
      this.aToB
    )
    const tickArray = this.tickArrays[localArrayIndex].data

    this.touchedArrays[localArrayIndex] = true

    if (!tickArray) {
      throw new Error(
        `TickArray at index ${localArrayIndex} is not initialized.`
      )
    }

    if (!this.checkIfIndexIsInTickArrayRange(tickArray.startTickIndex, index)) {
      throw new Error(
        `TickArray at index ${localArrayIndex} is unexpected for this sequence.`
      )
    }

    return tickArray.ticks[targetTaIndex.offsetIndex]
  }

  /**
   * if a->b, currIndex is included in the search
   * if b->a, currIndex is always ignored
   * @param currIndex
   * @returns
   */
  findNextInitializedTickIndex (currIndex) {
    const searchIndex = this.aToB ? currIndex : currIndex + this.tickSpacing
    let currTaIndex = TickArrayIndex.fromTickIndex(
      searchIndex,
      this.tickSpacing
    )

    // Throw error if the search attempted to search for an index out of bounds
    if (!this.isArrayIndexInBounds(currTaIndex, this.aToB)) {
      throw new Error(
        `Swap input value traversed too many arrays. Out of bounds at attempt to traverse tick index - ${currTaIndex.toTickIndex()}.`
      )
    }

    while (this.isArrayIndexInBounds(currTaIndex, this.aToB)) {
      const currTickData = this.getTick(currTaIndex.toTickIndex())
      if (currTickData.initialized) {
        return {
          nextIndex: currTaIndex.toTickIndex(),
          nextTickData: currTickData
        }
      }
      currTaIndex = this.aToB
        ? currTaIndex.toPrevInitializableTickIndex()
        : currTaIndex.toNextInitializableTickIndex()
    }

    const lastIndexInArray = Math.max(
      Math.min(
        this.aToB
          ? currTaIndex.toTickIndex() + this.tickSpacing
          : currTaIndex.toTickIndex() - 1,
        MAX_TICK_INDEX
      ),
      MIN_TICK_INDEX
    )

    return { nextIndex: lastIndexInArray, nextTickData: null }
  }

  getLocalArrayIndex (arrayIndex, aToB) {
    return aToB
      ? this.startArrayIndex - arrayIndex
      : arrayIndex - this.startArrayIndex
  }

  /**
   * Check whether the array index potentially exists in this sequence.
   * Note: assumes the sequence of tick-arrays are sequential
   * @param index
   */
  isArrayIndexInBounds (index, aToB) {
    // a+0...a+n-1 array index is ok
    const localArrayIndex = this.getLocalArrayIndex(index.arrayIndex, aToB)
    const seqLength = this.tickArrays.length
    return localArrayIndex >= 0 && localArrayIndex < seqLength
  }

  checkIfIndexIsInTickArrayRange (startTick, tickIndex) {
    const upperBound = startTick + this.tickSpacing * TICK_ARRAY_SIZE
    return !(tickIndex < startTick || tickIndex > upperBound)
  }
}
