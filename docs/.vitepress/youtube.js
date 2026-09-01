import { read, write } from "./node_utils.js";

const API_KEY = process.env.YT_API_KEY; // Leer API Key de env

async function getUploadsPlaylistId(CHANNEL_ID) {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${CHANNEL_ID}&key=${API_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!data.items || data.items.length === 0) {
    throw new Error("No se encontró el canal.");
  }

  return data.items[0].contentDetails.relatedPlaylists.uploads;
}

async function getAllPlaylistId(CHANNEL_ID, pageToken = "") {
  let url = `https://www.googleapis.com/youtube/v3/playlists?part=snippet&channelId=${CHANNEL_ID}&key=${API_KEY}`;
  if (pageToken) url += `&pageToken=${pageToken}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!data.items) return [];
  const playlist = data.items.map((item) => ({
    playlistId: item.id,
    title: item.snippet.title,
  }));

  if (data.nextPageToken) {
    return playlist.concat(await getAllPlaylistId(CHANNEL_ID, data.nextPageToken));
  }

  return playlist;
}

// Función para obtener vídeos de una página de la playlist y detenerse si se encuentra un vídeo ya en la caché
async function getNewVideos(playlistId, cachedIds, pageToken = "") {
  let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=200&key=${API_KEY}`;
  if (pageToken) url += `&pageToken=${pageToken}`;

  const response = await fetch(url);
  const data = await response.json();
  if (!data.items) return { newVideos: [], nextPageToken: null };

  let newVideos = [];
  for (const item of data.items) {
    const video = {
      videoId: item.snippet.resourceId.videoId,
      title: item.snippet.title,
      publishedAt: item.snippet.publishedAt,
      //playlistId: playlistId,
    };
    // Si el vídeo ya existe en caché, se asume que el resto ya se descargó previamente.
    if (cachedIds.has(video.videoId)) {
      return { newVideos, nextPageToken: null };
    }
    newVideos.push(video);
    // Add the video if it is important
    // (Removed writeNotification — no longer polls for starred videos)
  }
  return { newVideos, nextPageToken: data.nextPageToken || null };
}

// Función de actualización que realiza llamadas de forma iterativa
async function updateVideos(playlistId, cachedVideos, playlist) {
  // Usamos un Set con los IDs ya guardados para búsqueda rápida
  const cachedIds = new Set(cachedVideos.map((v) => v.videoId));
  let allNewVideos = [];
  let pageToken = "";
  let stop = false;

  while (!stop) {
    const { newVideos, nextPageToken } = await getNewVideos(playlistId, cachedIds, pageToken);
    allNewVideos = allNewVideos.concat(newVideos);
    if (!nextPageToken) stop = true;
    else pageToken = nextPageToken;
  }
  if (playlist) allNewVideos = allNewVideos.map((v) => ({ ...v, playlist }));
  // Como los nuevos vídeos vienen primero, los concatenamos delante
  return [...allNewVideos, ...cachedVideos];
}

async function getChannelIdFromUrl(channelUrl) {
  // 1. Extract the identifier (handle, username, or ID)
  const url = new URL(channelUrl);
  const pathSegments = url.pathname.split("/").filter((p) => p); // Splits and removes empty strings

  if (pathSegments.length === 0) {
    console.error("Invalid URL path.");
    return null;
  }

  let identifier = pathSegments.pop(); // The last segment is usually the identifier
  let apiParams = "";

  // 2. Determine the API parameter based on the URL type
  if (identifier.startsWith("@")) {
    // Handle URL: e.g., /@47herri
    apiParams = `forHandle=${encodeURIComponent(identifier)}`;
  } else if (pathSegments[0] === "c" || pathSegments[0] === "user") {
    // Custom URL or Legacy Username: e.g., /c/customname or /user/username
    // The identifier is already correct (customname or username)
    if (pathSegments[0] === "c") {
      apiParams = `forCustomUrl=${encodeURIComponent(identifier)}`;
    } else {
      apiParams = `forUsername=${encodeURIComponent(identifier)}`;
    }
  } else if (pathSegments[0] === "channel" && identifier.startsWith("UC")) {
    // Permanent Channel ID: e.g., /channel/UCsNn_j0E53HwG2N7N-bQJgA
    // No API call needed, we can return the ID directly
    return identifier;
  } else {
    // Fallback/Unknown format
    console.warn("Could not determine the channel identifier type from the URL.");
    return null;
  }

  // 3. Construct and make the API call
  const apiUrl = `https://www.googleapis.com/youtube/v3/channels?part=id&${apiParams}&key=${API_KEY}`;

  try {
    const response = await fetch(apiUrl);

    if (!response.ok) {
      // Throw an error if the API request itself failed (e.g., 400, 500)
      throw new Error(`API request failed with status: ${response.status}`);
    }

    const data = await response.json();

    // 4. Extract the ID from the response
    if (data.items && data.items.length > 0) {
      return data.items[0].id;
    } else {
      console.warn("Channel not found for the given identifier.");
      return null;
    }
  } catch (error) {
    console.error("Error fetching channel data:", error.message);
    return null;
  }
}

export async function fetchVideos(channelUrl) {
  // `videos` is declared in function scope (not inside the `try` block below) so
  // that the `catch` block can return the previously-known list instead of
  // throwing ReferenceError when an upstream call fails mid-fetch.
  let videos = read("./docs/public/videos.json", []);
  try {
    const config = read("./docs/public/config.json");
    if (!API_KEY) {
      console.error("Error: La API Key no está definida. Asegúrate de exportarla.");
      return videos;
    }

    // The known-videos list is materialized by the fetch step (fetch.js
    // downloads docs/public/videos.json from the data host), so this build only
    // pages through NEW YouTube videos on top of the previously published list.

    console.log("Fetching videos...");
    const youtubeStr = (config.info.social || []).find((s) =>
      s.toLowerCase().includes("youtube")
    );
    // Sites without a YouTube channel in their social config skip video
    // fetching gracefully — YouTube is optional.
    if (!youtubeStr) {
      console.log("No YouTube channel configured in social; skipping video fetch.");
      return videos;
    }
    const CHANNEL_ID = await getChannelIdFromUrl(youtubeStr);
    // Get main videos
    const playlistId = await getUploadsPlaylistId(CHANNEL_ID);
    videos = await updateVideos(playlistId, videos);

    // Get playlists
    const playlists = await getAllPlaylistId(CHANNEL_ID);
    for (var i = 0; i < playlists.length; i++) {
      videos = await updateVideos(playlists[i].playlistId, videos, playlists[i].title);
    }

    console.log("Fetched ", videos.length, " videos.");
    // Save videos
    write("./docs/public/videos.json", videos); // Guardar el resultado en un archivo
    return videos || [];
  } catch (error) {
    console.error("Error loading youtube data:", error);
    return videos || [];
  }
}
