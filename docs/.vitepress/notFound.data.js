import { read, fg } from "./node_utils.js";
import { getCode } from "./naming.js";

// VitePress data loader that mirrors blocks.data.js — reads the per-language
// 404.md files emitted by createFiles.js so the theme NotFound fallback can render
// the same Good Shepherd + message content on any broken URL (not just /404).
export default {
  async load() {
    const entries = [];
    const files = await fg(["**/404.md"], { cwd: "./docs", absolute: false });
    for (const f of files) {
      const { data } = read("./docs/" + f);
      if (data?.sections?.length)
        entries.push({ code: getCode(data.lang), title: data.title, sections: data.sections });
    }
    return { entries };
  },
};
