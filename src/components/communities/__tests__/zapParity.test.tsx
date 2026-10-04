import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const captured: Array<Record<string, unknown>> = [];

vi.mock("../../zaps/ZapModal", () => ({
  default: (props: Record<string, unknown>) => {
    captured.push(props);
    return null;
  },
}));

// Server rendering cannot click, so start every `useState(false)` as true. That
// opens ReportCard's zap modal on the first render.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: (init: unknown) => actual.useState(init === false ? true : init) };
});

import ReportCard from "../ReportCard";
import PostZapModal from "../PostZapModal";

const withoutHandlers = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => typeof v !== "function"));

describe("zap parity with ReportCard", () => {
  for (const authorName of [undefined, "Amina"]) {
    it(`passes the same ZapModal props (authorName=${authorName})`, () => {
      const post = { id: "e".repeat(64), pubkey: "a".repeat(64), content: "hello", createdAt: 1_700_000_000, authorName };

      captured.length = 0;
      renderToStaticMarkup(createElement(ReportCard, { report: post }));
      const theirs = captured.at(-1)!;

      captured.length = 0;
      renderToStaticMarkup(createElement(PostZapModal, { post, onClose: () => {} }));
      const ours = captured.at(-1)!;

      expect(theirs).toBeDefined();
      expect(withoutHandlers(ours)).toEqual(withoutHandlers(theirs));
      expect(Object.keys(ours).sort()).toEqual(Object.keys(theirs).sort());
    });
  }
});
