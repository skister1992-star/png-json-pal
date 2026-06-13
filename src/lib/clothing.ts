export const CLOTHING_GROUPS: { label: string; items: string[] }[] = [
  {
    label: "Oberteil",
    items: [
      "T-Shirt", "Hemd", "Bluse", "Pullover", "Hoodie", "Sweatshirt",
      "Top", "Tanktop", "Crop-Top", "Jacke", "Mantel", "Blazer", "Weste",
      "Kleid", "Kapuzenpullover",
    ],
  },
  {
    label: "Hose",
    items: [
      "Jeans", "Hose", "Shorts", "Leggings", "Jogginghose", "Rock",
      "Minirock", "Cargohose", "Anzughose",
    ],
  },
  {
    label: "Schuhe",
    items: [
      "Sneaker", "Stiefel", "High Heels", "Sandalen", "Halbschuhe",
      "Stiefeletten", "Turnschuhe", "Pumps", "Boots",
    ],
  },
  {
    label: "Unterwäsche",
    items: [
      "BH", "Slip", "String", "Höschen", "Boxershorts", "Unterhemd",
      "Body", "Korsett", "Strapse", "Strümpfe", "Strumpfhose",
    ],
  },
  {
    label: "Accessoires",
    items: [
      "Halskette", "Ohrringe", "Armband", "Ring", "Gürtel", "Mütze",
      "Hut", "Schal", "Handschuhe", "Krawatte", "Fliege", "Uhr",
      "Haarband", "Choker",
    ],
  },
];

// German uses inflected adjective endings; we pick a generic neuter/strong form
// that reads naturally with the items above (e.g. "rotes T-Shirt", "blaue Jeans").
// For simplicity we offer the base color name and prepend it as-is.
export const CLOTHING_COLORS: string[] = [
  "schwarz", "weiß", "grau", "braun", "beige", "rot", "pink", "lila",
  "blau", "hellblau", "dunkelblau", "türkis", "grün", "dunkelgrün",
  "gelb", "orange", "gold", "silber",
];
