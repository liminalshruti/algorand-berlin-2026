import { addEqualityTesters } from '@algorandfoundation/algorand-typescript-testing'
import { beforeAll, expect } from 'vitest'

// Lets tests compare Algorand TypeScript / ARC-4 values directly with toEqual.
beforeAll(() => {
  addEqualityTesters({ expect })
})
