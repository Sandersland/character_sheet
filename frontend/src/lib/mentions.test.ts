import { describe, expect, it } from "vitest";

import type { CampaignEntity } from "@/types/character";
import {
  matchEntities,
  mentionBodyToFragment,
  normalizeForMatch,
  parseMentionBody,
  parseTrigger,
  serializeMentionDom,
  type MentionResolved,
} from "@/lib/mentions";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

function entity(partial: Partial<CampaignEntity> & { id: string; name: string }): CampaignEntity {
  return {
    campaignId: "c1",
    type: "NPC",
    aliases: [],
    notes: null,
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

describe("parseMentionBody", () => {
  it("returns a single text segment for plain text", () => {
    expect(parseMentionBody("just text")).toEqual([{ type: "text", value: "just text" }]);
  });

  it("splits a token out of surrounding text", () => {
    expect(parseMentionBody(`Met @[${A}] today`)).toEqual([
      { type: "text", value: "Met " },
      { type: "mention", id: A },
      { type: "text", value: " today" },
    ]);
  });

  it("handles back-to-back and multiple tokens", () => {
    expect(parseMentionBody(`@[${A}]@[${B}]`)).toEqual([
      { type: "mention", id: A },
      { type: "mention", id: B },
    ]);
  });

  it("leaves a malformed token as text", () => {
    expect(parseMentionBody("@[] and @[nope]")).toEqual([
      { type: "text", value: "@[] and @[nope]" },
    ]);
  });
});

describe("normalizeForMatch", () => {
  it("strips apostrophes, punctuation and diacritics", () => {
    expect(normalizeForMatch("Baldur's Gate")).toBe("baldurs gate");
    expect(normalizeForMatch("Café Owlbear!")).toBe("cafe owlbear");
  });
});

describe("matchEntities", () => {
  const entities = [
    entity({ id: A, name: "Goblin Chief", aliases: ["Grik"] }),
    entity({ id: B, name: "Café", aliases: [] }),
  ];

  it("matches by alias", () => {
    expect(matchEntities(entities, "grik").map((e) => e.id)).toEqual([A]);
  });

  it("matches across diacritics", () => {
    expect(matchEntities(entities, "cafe").map((e) => e.id)).toEqual([B]);
  });

  it("returns all for an empty query", () => {
    expect(matchEntities(entities, "")).toHaveLength(2);
  });
});

describe("parseTrigger", () => {
  it("activates on a simple @query", () => {
    expect(parseTrigger("hello @que")).toEqual({ active: true, query: "que", triggerStart: 6 });
  });

  it("returns null with no @", () => {
    expect(parseTrigger("no trigger here")).toBeNull();
  });

  it("parses a reserved type prefix", () => {
    expect(parseTrigger("@item:swo")).toEqual({
      active: true,
      typeFilter: "ITEM",
      query: "swo",
      triggerStart: 0,
    });
  });

  it("keeps the buffer across spaces and apostrophes", () => {
    const t = parseTrigger("we reached @baldur's ga");
    expect(t).toEqual({ active: true, query: "baldur's ga", triggerStart: 11 });
  });

  it("treats an unrecognized prefix as part of the query", () => {
    expect(parseTrigger("@foo:bar")).toEqual({ active: true, query: "foo:bar", triggerStart: 0 });
  });

  it("does not trigger inside a word (email)", () => {
    expect(parseTrigger("mail me at bob@foo")).toBeNull();
  });

  it("does not trigger on an already-inserted token", () => {
    expect(parseTrigger(`done @[${A}]`)).toBeNull();
  });
});

describe("mention DOM serialization (#269)", () => {
  const resolve =
    (map: Record<string, MentionResolved>) =>
    (id: string): MentionResolved | null =>
      map[id] ?? null;

  function build(body: string, map: Record<string, MentionResolved> = {}): HTMLElement {
    const root = document.createElement("div");
    root.appendChild(mentionBodyToFragment(body, resolve(map)));
    return root;
  }

  it("renders a known token as an @Name chip, not the uuid", () => {
    const root = build(`Met @[${A}] today`, { [A]: { name: "Goblin Chief", type: "NPC" } });
    const chip = root.querySelector("[data-mention-id]") as HTMLElement;
    expect(chip).not.toBeNull();
    expect(chip.dataset.mentionId).toBe(A);
    expect(chip.textContent).toBe("@Goblin Chief");
    expect(chip.getAttribute("contenteditable")).toBe("false");
    expect(root.textContent).not.toContain(A);
  });

  it("renders an unknown id as literal token text", () => {
    const root = build(`Met @[${A}] today`);
    expect(root.querySelector("[data-mention-id]")).toBeNull();
    expect(root.textContent).toContain(`@[${A}]`);
  });

  it("round-trips DOM back to the @[<uuid>] body string", () => {
    const body = `Met @[${A}] and @[${B}] here`;
    const root = build(body, {
      [A]: { name: "Goblin Chief", type: "NPC" },
      [B]: { name: "Sword of Truth", type: "ITEM" },
    });
    expect(serializeMentionDom(root)).toBe(body);
  });

  it("round-trips an unknown token unchanged", () => {
    const body = `before @[${A}] after`;
    expect(serializeMentionDom(build(body))).toBe(body);
  });

  it("serializes <br> and block elements as newlines", () => {
    const root = document.createElement("div");
    root.innerHTML = "line one<br>line two<div>line three</div>";
    expect(serializeMentionDom(root)).toBe("line one\nline two\nline three");
  });

  it("drops a trailing placeholder <br>", () => {
    const root = document.createElement("div");
    root.innerHTML = "text<br>";
    expect(serializeMentionDom(root)).toBe("text");
  });
});
