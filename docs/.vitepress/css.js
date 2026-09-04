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
  const fonts = [theme.headingFont, theme.bodyFont];
  let preloads = [];

  for (const fontName of fonts) {
    const fileName = `${camelCase(fontName)}.woff2`;
    const fontPath = `./docs/public/${fileName}`;

    if (!fs.existsSync(fontPath)) {
      // Corrected the URL construction
      const googleUrl = `https://fonts.googleapis.com/css2?family=${fontName.replace(/\s+/g, "+")}&subset=latin,latin-ext&display=swap`;
      await downloadAndSubset(googleUrl, fontPath);
    }

    preloads.push(["link", { rel: "preload", href: `/${fileName}`, as: "font", type: "font/woff2", crossorigin: "" }]);
  }

  return { preloads };
}

export const getHue = (hex) => {
  try {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      d = max - min;
    if (d === 0) return 0;
    let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return h * 60;
  } catch (e) {
    return 0;
  }
};

export async function printCSS() {

  const theme = config.theme ?? {};

  const css = generateThemeCSS(theme);

  const baseDir = path.resolve("");

  fs.writeFileSync(baseDir + "/docs/.vitepress/theme/style.css", css, "utf8");
}
