/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createApmCursorBus, ApmCursorState } from '../apm_cursor_context';

describe('createApmCursorBus', () => {
  const state: ApmCursorState = { time: 1704067200000, yRatio: 0.5 };

  it('delivers published states to a subscriber', () => {
    const bus = createApmCursorBus();
    const received: Array<ApmCursorState | null> = [];
    bus.subscribe((s) => received.push(s));

    bus.publish(state);
    bus.publish(null);

    expect(received).toEqual([state, null]);
  });

  it('fans out to multiple subscribers', () => {
    const bus = createApmCursorBus();
    const a = jest.fn();
    const b = jest.fn();
    bus.subscribe(a);
    bus.subscribe(b);

    bus.publish(state);

    expect(a).toHaveBeenCalledWith(state);
    expect(b).toHaveBeenCalledWith(state);
  });

  it('stops delivering after unsubscribe', () => {
    const bus = createApmCursorBus();
    const cb = jest.fn();
    const unsubscribe = bus.subscribe(cb);

    bus.publish(state);
    unsubscribe();
    bus.publish(state);

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('isolates separate buses (independent sync groups)', () => {
    const busA = createApmCursorBus();
    const busB = createApmCursorBus();
    const cbA = jest.fn();
    const cbB = jest.fn();
    busA.subscribe(cbA);
    busB.subscribe(cbB);

    busA.publish(state);

    expect(cbA).toHaveBeenCalledWith(state);
    expect(cbB).not.toHaveBeenCalled();
  });
});
