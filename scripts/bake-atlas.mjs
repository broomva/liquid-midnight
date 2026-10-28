// Bake the ASCII ramp into design/shaders/ascii-atlas.png (white glyphs on transparent) for the pen.dev ASCII shader.
// Same geometry as kit/ascii.js atlas(): cell = ceil(fs*.62) x ceil(fs*1.2), JetBrains Mono 500.
import { chromium } from "playwright";
import { serve } from "./serve.mjs";

const RAMP = " .·:-=+*%#@";
const FS = 44;
const server = serve(0);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${server.port}/specimen/`);
  const data = await page.evaluate(
    async ([ramp, fs]) => {
      await document.fonts.load(`500 ${fs}px "JetBrains Mono"`);
      const cw = Math.ceil(fs * 0.62);
      const ch = Math.ceil(fs * 1.2);
      const cv = document.createElement("canvas");
      cv.width = cw * ramp.length;
      cv.height = ch;
      const x = cv.getContext("2d");
      x.font = `500 ${fs}px "JetBrains Mono"`;
      x.fillStyle = "#fff";
      x.textAlign = "center";
      x.textBaseline = "middle";
      [...ramp].forEach((s, i) => {
        x.fillText(s, i * cw + cw / 2, ch / 2);
      });
      return cv.toDataURL("image/png");
    },
    [RAMP, FS],
  );
  await Bun.write(new URL("../design/shaders/ascii-atlas.png", import.meta.url).pathname, Buffer.from(data.split(",")[1], "base64"));
  console.log("baked design/shaders/ascii-atlas.png");
} finally {
  await browser.close();
  server.stop(true);
}
