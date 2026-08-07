import { read, fg } from "./node_utils.js";

export default {
  async load() {
    // Arrays donde almacenarás los bloques
    const fundraisings = [];
    const maps = [];
    const pages = [];

    const files = await fg("**/*.md", { cwd: "./docs", absolute: false });

    for (const file of files) {
      const { data } = read("./docs/" + file);
      // Chequea si existe data.sections._block
      if (data.sections && Array.isArray(data.sections)) {
        pages.push({
          title: data.title,
          image: data.image,
          tags: data.tags,
          description: data.description,
          lang: data.lang,
          url: "/" + file.replace(/index\.md$/, "").replace(/\.md$/, ""),
        });
        data.sections.forEach((section) => {
          if (section._block === "fundraising") {
            section.lang = data.lang;
            // Guard against a missing/zero `goal` (else Infinity/NaN, which
            // JSON.stringify collapses to null and breaks the progress bar).
            section.progress = section.goal ? Math.round((section.raised / section.goal) * 100) : 0;
            fundraisings.push(section);
          } else if (section._block === "map") {
            maps.push({
              lang: data.lang,
              geo: section.geo,
              image: section.image || data.image,
              title: section.city || data.title,
              name: section.name,
              url: "/" + file.replace(/index\.md$/, "").replace(/\.md$/, ""),
            });
          }
        });
      }
    }

    return { fundraisings, maps, pages };
  },
};
