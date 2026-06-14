/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Box } from './box.entity'

// A cloud box id must be the same opaque 12-character Base62 string the engine
// mints for local boxes (src/boxlite/src/runtime/id.rs BoxIDMint: 12 chars,
// alphabet [0-9A-Za-z]). apps/api used to mint a 36-character UUID instead, so
// `box.id` had two different shapes depending on the backend. These cases pin
// the cloud mint to the engine's format — revert the constructor to uuidv4()
// and the first case goes red.
const ENGINE_BOX_ID = /^[0-9A-Za-z]{12}$/

describe('Box entity id', () => {
  it('mints a 12-character Base62 id matching the engine BoxID format', () => {
    const box = new Box('us-east-1', 'my-box')

    expect(box.id).toMatch(ENGINE_BOX_ID)
  })

  it('mints a distinct id for each box', () => {
    const a = new Box('us-east-1')
    const b = new Box('us-east-1')

    expect(a.id).not.toEqual(b.id)
  })
})
