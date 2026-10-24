import { EventEmitter } from "node:events";
import type { TestEvent } from "./api";

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export function publish(testId: string, event: TestEvent) {
  emitter.emit(testId, event);
}

export function subscribe(testId: string, listener: (event: TestEvent) => void): () => void {
  emitter.on(testId, listener);
  return () => emitter.off(testId, listener);
}
