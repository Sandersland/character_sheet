// ── Equipment packs ───────────────────────────────────────────────────────────
// Each pack matches a catalog Item by name (e.g. "Scholar's Pack") and lists
// the individual items it expands into at character creation. Seeded from the
// 5e Basic Rules; custom packs can be added without a code deploy.
export interface PackContentSeed {
  itemName: string;
  quantity?: number;
}
export interface PackSeed {
  name: string;
  description?: string;
  contents: PackContentSeed[];
}

export const PACKS: PackSeed[] = [
  {
    name: "Dungeoneer's Pack",
    description: "Includes a backpack, crowbar, hammer, 10 pitons, 10 torches, a tinderbox, 10 days of rations, a waterskin, and 50 feet of hempen rope.",
    contents: [
      { itemName: "Backpack" },
      { itemName: "Crowbar" },
      { itemName: "Hammer" },
      { itemName: "Piton", quantity: 10 },
      { itemName: "Torch", quantity: 10 },
      { itemName: "Tinderbox" },
      { itemName: "Rations", quantity: 10 },
      { itemName: "Waterskin" },
      { itemName: "Hempen Rope (50 ft)" },
    ],
  },
  {
    name: "Explorer's Pack",
    description: "Includes a backpack, a bedroll, a mess kit, a tinderbox, 10 torches, 10 days of rations, a waterskin, and 50 feet of hempen rope.",
    contents: [
      { itemName: "Backpack" },
      { itemName: "Bedroll" },
      { itemName: "Mess Kit" },
      { itemName: "Tinderbox" },
      { itemName: "Torch", quantity: 10 },
      { itemName: "Rations", quantity: 10 },
      { itemName: "Waterskin" },
      { itemName: "Hempen Rope (50 ft)" },
    ],
  },
  {
    name: "Burglar's Pack",
    description: "Includes a backpack, a bag of 1000 ball bearings, 10 feet of string, a bell, 5 candles, a crowbar, a hammer, 10 pitons, a hooded lantern, 2 flasks of oil, 5 days of rations, a tinderbox, a waterskin, and 50 feet of hempen rope.",
    contents: [
      { itemName: "Backpack" },
      { itemName: "Ball Bearings" },
      { itemName: "String (10 ft)" },
      { itemName: "Bell" },
      { itemName: "Candle", quantity: 5 },
      { itemName: "Crowbar" },
      { itemName: "Hammer" },
      { itemName: "Piton", quantity: 10 },
      { itemName: "Hooded Lantern" },
      { itemName: "Oil Flask", quantity: 2 },
      { itemName: "Rations", quantity: 5 },
      { itemName: "Tinderbox" },
      { itemName: "Waterskin" },
      { itemName: "Hempen Rope (50 ft)" },
    ],
  },
  {
    name: "Priest's Pack",
    description: "Includes a backpack, a blanket, 10 candles, a tinderbox, an alms box, 2 blocks of incense, a censer, vestments, 2 days of rations, and a waterskin.",
    contents: [
      { itemName: "Backpack" },
      { itemName: "Blanket" },
      { itemName: "Candle", quantity: 10 },
      { itemName: "Tinderbox" },
      { itemName: "Alms Box" },
      { itemName: "Incense Block", quantity: 2 },
      { itemName: "Censer" },
      { itemName: "Vestments" },
      { itemName: "Rations", quantity: 2 },
      { itemName: "Waterskin" },
    ],
  },
  {
    name: "Diplomat's Pack",
    description: "Includes a chest, 2 map or scroll cases, fine clothes, a bottle of ink, an ink pen, a lamp, 2 flasks of oil, 5 sheets of paper, a vial of perfume, sealing wax, and soap.",
    contents: [
      { itemName: "Chest" },
      { itemName: "Map Case", quantity: 2 },
      { itemName: "Fine Clothes" },
      { itemName: "Ink and Quill" },
      { itemName: "Lamp" },
      { itemName: "Oil Flask", quantity: 2 },
      { itemName: "Paper Sheet", quantity: 5 },
      { itemName: "Perfume Vial" },
      { itemName: "Sealing Wax" },
      { itemName: "Soap" },
    ],
  },
  {
    name: "Entertainer's Pack",
    description: "Includes a backpack, a bedroll, 2 costumes, 5 candles, 5 days of rations, a waterskin, and a disguise kit.",
    contents: [
      { itemName: "Backpack" },
      { itemName: "Bedroll" },
      { itemName: "Costume Clothes", quantity: 2 },
      { itemName: "Candle", quantity: 5 },
      { itemName: "Rations", quantity: 5 },
      { itemName: "Waterskin" },
      { itemName: "Disguise Kit" },
    ],
  },
  {
    name: "Scholar's Pack",
    description: "Includes a backpack, a book of lore, a bottle of ink, an ink pen, 10 sheets of parchment, a little bag of sand, and a small knife.",
    contents: [
      { itemName: "Backpack" },
      { itemName: "Book of Lore" },
      { itemName: "Ink and Quill" },
      { itemName: "Parchment Sheet", quantity: 10 },
      { itemName: "Tinderbox" },
      { itemName: "Knife" },
    ],
  },
];
