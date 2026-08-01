import { describe, expect, it } from "vitest";
import { LOADING_MESSAGES, loadingMessage } from "../src/loading/loadingMessage";

describe("frases de carga", () => {
  it("elige siempre una de la lista", () => {
    for (const value of [0, .17, .5, .99]) {
      expect(LOADING_MESSAGES).toContain(loadingMessage(() => value));
    }
  });

  it("no se sale de la lista si el azar devuelve el extremo", () => {
    expect(loadingMessage(() => 1)).toBe(LOADING_MESSAGES[0]);
  });
});
