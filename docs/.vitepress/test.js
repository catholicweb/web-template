import { getJSONLD } from "./seo.js";
import { read, write } from "./node_utils.js";
import { getAudio } from "./gospel.js";
import { getPreview } from "./oembed.js";



/*const file = "./docs/en/goizueta.md";
const { data } = read(file);
const config = read("./docs/public/pages/config.json");*/

async function run(argument) {
	//const res = getJSONLD(data, config, file);
	const res = await getPreview("https://sallebarne.eus");

	console.log(res);
}

run();
