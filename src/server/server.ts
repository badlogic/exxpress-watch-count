import bodyParser from "body-parser";
import * as chokidar from "chokidar";
import compression from "compression";
import cors from "cors";
import express from "express";
import * as fs from "fs";
import * as http from "http";
import WebSocket, { WebSocketServer } from "ws";

const port = process.env.PORT ?? 3333;
const youtubeApiKey = process.env.YOUTUBE_API_KEY;
if (!youtubeApiKey) {
    console.error("Environment variable YOUTUBE_API_KEY missing");
    process.exit(-1);
}

const history: { timestamp: number; count: number }[] = [];

(async () => {
    if (!fs.existsSync("docker/data")) {
        fs.mkdirSync("docker/data");
    }
    if (fs.existsSync("docker/data/history.json")) {
        history.push(...JSON.parse(fs.readFileSync("docker/data/history.json", "utf-8")));
        for (let i = 0; i < history.length; i++) {
            let count = history[i].count;
            if (!count) count = 0;
            else if (typeof count == "string") count = parseInt(count);
            history[i].count = count;
        }
    } else {
    }

    const app = express();
    app.set("json spaces", 2);
    app.use(cors());
    app.use(compression());
    app.use(bodyParser.urlencoded({ extended: true }));

    app.get("/api/history", (req, res) => {
        res.json(history);
    });

    const update = async () => {
        const response = await fetch("https://www.googleapis.com/youtube/v3/videos?id=Z4z69xcu-eE&part=liveStreamingDetails&key=" + youtubeApiKey);
        if (!response.ok) {
            console.error("Could not fetch data");
        } else {
            const json = await response.json();
            fs.writeFileSync("docker/data/history.json", JSON.stringify(history, null, 2));
            let count = json.items[0].liveStreamingDetails.concurrentViewers;
            if (count) {
                count = parseInt(count);
            } else {
                count = 0;
            }
            history.push({ timestamp: new Date().getTime(), count: count });
        }

        setTimeout(update, 15000);
    };
    update();

    const server = http.createServer(app);
    server.listen(port, async () => {
        console.log(`App listening on port ${port}`);
    });

    setupLiveReload(server);
})();

function setupLiveReload(server: http.Server) {
    const wss = new WebSocketServer({ server });
    const clients: Set<WebSocket> = new Set();
    wss.on("connection", (ws: WebSocket) => {
        clients.add(ws);
        ws.on("close", () => {
            clients.delete(ws);
        });
    });

    chokidar.watch("html/", { ignored: /(^|[\/\\])\../, ignoreInitial: true }).on("all", (event, path) => {
        clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(`File changed: ${path}`);
            }
        });
    });
    console.log("Initialized live-reload");
}
