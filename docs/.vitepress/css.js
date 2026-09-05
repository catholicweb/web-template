import { read, write, fs, path } from "./node_utils.js";
import subsetFont from "subset-font";
import generateThemeCSS from "./themeBuilder.js"

const config = read("./docs/public/config.json");

async function downloadAndSubset(fontUrl, fontPath) {
  try {
    console.log(`Fetching CSS from: ${fontUrl}`);
    const cssResponse = await fetch(fontUrl);
    const cssText = await cssResponse.text();

    const ttfUrl = cssText.match(/url\((.*?)\)/)[1].replace(/['"]/g, "");

    const fontResponse = await fetch(ttfUrl);
    const arrayBuffer = await fontResponse.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    fs.writeFileSync(fontPath, inputBuffer);

    let characters = "";
    for (let i = 32; i <= 255; i++) characters += String.fromCharCode(i);

    const subsetBuffer = await subsetFont(inputBuffer, characters, {
      targetFormat: "woff2",
    });

    // Use the specific filename passed in
    fs.writeFileSync(fontPath, subsetBuffer);
    console.log(`Saved: ${fontPath}`);
  } catch (e) {
    console.log(e);
  }
}

export function camelCase(str) {
  if (!str) return "";
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

export function toArray(x) {
  const arr = Array.isArray(x) ? x : [x];
  return arr
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export async function getFontCSS(theme) {
  console.log(theme)
  const pair = theme.fontPair ?? "Basque Smile|Source Sans 3";
  const fonts = pair.split("|").map(s => s.trim()).filter(Boolean);
  let preloads = [];

  for (const fontName of fonts) {
    const fileName = `${camelCase(fontName)}.woff2`;
    const fontPath = `./docs/public/assets/${fileName}`;

    if (!fs.existsSync(fontPath)) {
      // Corrected the URL construction
      const googleUrl = `https://fonts.googleapis.com/css2?family=${fontName.replace(/\s+/g, "+")}&subset=latin,latin-ext&display=swap`;
      await downloadAndSubset(googleUrl, fontPath);
    }

    preloads.push(["link", { rel: "preload", href: `/assets/${fileName}`, as: "font", type: "font/woff2", crossorigin: "" }]);
  }

  return { preloads };
}

export async function printCSS() {

  const theme = config.theme ?? {};

  const css = generateThemeCSS(theme);

  const baseDir = path.resolve("");

  fs.writeFileSync(baseDir + "/docs/.vitepress/theme/style.css", css, "utf8");
}
