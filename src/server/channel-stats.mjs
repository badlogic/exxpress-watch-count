const apiKey = process.env.EXPRESS_WATCH_COUNT_YOUTUBE_KEY;
const channels = ["gutenachtoesterreich", "eXXpressTV", "kronetv", "oe24TV", "heuteat"];

import * as fs from "fs";

async function fetchFromApi(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
}

async function getChannelInfo(channelName) {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${channelName}&key=${apiKey}`);
    if (!response.ok) {
        console.error("Could not fetch channel info for " + channelName, await response.text());
        process.exit(-1);
    }
    return (await response.json()).items[0].snippet;
}

async function getUploadsPlaylistId(channelId) {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`;
    const data = await fetchFromApi(url);
    return data.items[0].contentDetails.relatedPlaylists.uploads;
}

async function getVideosFromPlaylist(playlistId) {
    let videos = [];
    let pageToken = "";
    do {
        const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&pageToken=${pageToken}&key=${apiKey}`;
        const data = await fetchFromApi(url);
        const videoIds = data.items.map((item) => item.snippet.resourceId.videoId).join(",");
        const videoDetails = await getVideoDetails(videoIds);
        videos = videos.concat(videoDetails);
        pageToken = data.nextPageToken || "";
        console.log("Fetched " + videos.length + " videos");
    } while (pageToken);
    return videos;
}

async function getVideoDetails(videoIds) {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoIds}&key=${apiKey}`;
    const data = await fetchFromApi(url);
    return data.items.map((item) => {
        return {
            title: item.snippet.title,
            description: item.snippet.description,
            stats: item.statistics,
            publishedAt: item.snippet.publishedAt,
        };
    });
}

async function getAllVideos(channelName) {
    try {
        const info = await getChannelInfo(channelName);
        const playlistId = await getUploadsPlaylistId(info.channelId);
        const videos = await getVideosFromPlaylist(playlistId);
        fs.writeFileSync("html/data/" + channelName + ".json", JSON.stringify({ info, videos }, null, 2), "utf-8");
    } catch (error) {
        console.error(error);
    }
}

for (const channelName of channels) {
    getAllVideos(channelName);
}
