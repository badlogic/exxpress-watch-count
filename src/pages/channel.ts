import { customElement, state } from "lit/decorators.js";
import { BaseElement } from "../app";
import { pageContainerStyle, pageContentStyle } from "../utils/styles";
import { PropertyValueMap, html } from "lit";
import { Chart, registerables } from "chart.js";
import { map } from "lit/directives/map.js";
import { router } from "../utils/routing";
Chart.register(...registerables);

interface Video {
    title: string;
    description: string;
    stats: { viewCount: number; commentCount: number };
    publishedAt: string;
}

@customElement("channel-page")
export class ChannelPage extends BaseElement {
    @state()
    isLoading = true;

    @state()
    mostViewed: Video[] = [];

    @state()
    error?: string;

    data: Video[] = [];
    info: { title: string; thumbnails: { medium: { url: string } } } = { title: "", thumbnails: { medium: { url: "" } } };

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.load();
    }

    chart(canvasId: string, data: Video[], yAxisLabel: string, values: (video: Video) => number) {
        const chartOptions = {
            animation: false, // Disable animations
            scales: {
                x: {
                    grid: { display: false },
                },
                y: {
                    beginAtZero: true,
                    grid: { display: true, color: "#ccc2" },
                    title: {
                        display: true,
                        text: yAxisLabel,
                    },
                },
            },
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    enabled: true,
                    callbacks: {
                        label: (context: any) => {
                            const video = data[context.dataIndex];
                            return [video.title, "Published: " + video.publishedAt, "Views: " + video.stats.viewCount.toString()];
                        },
                    },
                },
            },
        };
        const canvas = this.querySelector<HTMLCanvasElement>(canvasId)!;
        if ((canvas as any).__chart) {
            const chart: Chart<"line", number[], unknown> = (canvas as any).__chart;
            chart.data.labels = data.map((entry) => "");
            chart.data.datasets[0].data = data.map((entry) => values(entry));
            chart.update();
            return;
        }
        const chart = new Chart(canvas, {
            type: "bar",
            data: {
                labels: data.map((entry) => ""),
                datasets: [
                    {
                        label: yAxisLabel,
                        data: data.map((entry) => values(entry)),
                        backgroundColor: "rgba(75, 192, 192, 0.6)",
                        borderWidth: 0,
                    },
                ],
            },
            options: chartOptions as any,
        });
        (canvas as any).__chart = chart;
    }

    async load() {
        try {
            const channel = router.getCurrentParams()!.get("channel");
            const response = await fetch("/data/" + channel + ".json");
            if (!response.ok) {
                alert("Whoops, da lief was schief");
                return;
            }
            const channelJson = await response.json();
            this.data = channelJson.videos;
            this.info = channelJson.info;
            const currentDate = new Date();
            this.data = this.data.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
            this.renderStats();
        } catch (e) {
            this.error = "Konnte Channel Daten nicht laden";
        }
    }

    async renderStats() {
        const numVideos = parseInt(this.querySelector<HTMLInputElement>("#numVideos")!.value);
        const data = [...this.data].splice(0, numVideos);
        this.mostViewed = [...data].sort((a, b) => b.stats.viewCount - a.stats.viewCount).splice(0, 100);
        this.chart("#videoViews", data, "Zuseher", (video) => video.stats.viewCount);
        this.chart("#videoComments", data, "Kommentare", (video) => video.stats.commentCount);
    }

    render() {
        const channel = router.getCurrentParams()!.get("channel");

        return html`<div class="${pageContainerStyle}">
            <div class="flex flex-col w-full  items-center gap-2 my-4 text-[#ccc]">
                <h1 class="flex gap-2 items-center">
                    <img class="rounded-full h-20 w-20" src="${this.info.thumbnails.medium.url}" /><span
                        >${this.info.title} YouTube Kanal Statistiken</span
                    >
                </h1>
                <div class="italic text-sm text-center -mt-2">Jeder Balken zeigt die Zuseher- bzw Kommentarzahl eines Videos des Kanals</div>
                <div class="flex gap-2 items-center -mt-2">
                    <span>Zeige die letzten</span>
                    <input
                        class="bg-transparent border border-divider p-2 rounded appearance-none"
                        style="-webkit-appearance: none; -moz-appearance: textfield;"
                        id="numVideos"
                        type="number"
                        min="1"
                        max="1000"
                        value="100"
                        @change=${() => this.renderStats()}
                    />
                    <span>Videos</span>
                </div>
                <canvas class="w-full flex-grow px-4" id="videoViews"></canvas>
                <canvas class="w-full flex-grow px-4" id="videoComments"></canvas>
                <h1 class="text-xl">Meistgesehene Videos</h1>
                <div class="flex flex-col gap-2">
                    ${map(
                        this.mostViewed,
                        (video) =>
                            html`<div class="flex flex-col gap-1">
                                <span class="underline text-lg">${video.title}</span><span>${video.stats.viewCount} Zuseher</span>
                            </div>`
                    )}
                </div>
            </div>
        </div>`;
    }
}
