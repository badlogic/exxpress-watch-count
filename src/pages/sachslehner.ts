import { customElement, state } from "lit/decorators.js";
import { BaseElement } from "../app";
import { pageContainerStyle, pageContentStyle } from "../utils/styles";
import { PropertyValueMap, html } from "lit";
import { Chart, registerables } from "chart.js";
import { map } from "lit/directives/map.js";
Chart.register(...registerables);

interface Video {
    title: string;
    description: string;
    stats: { viewCount: number };
    publishedAt: string;
}

@customElement("sachslehner-page")
export class SachslehnerPage extends BaseElement {
    @state()
    isLoading = true;

    @state()
    mostViewed: Video[] = [];

    data: Video[] = [];

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.load();
    }

    async load() {
        const response = await fetch("data/eXXpressTV.json");
        if (!response.ok) {
            alert("Whoops, da lief was schief");
            return;
        }
        this.data = (await response.json()).videos;
        const currentDate = new Date();
        this.mostViewed = this.data.sort((a, b) => b.stats.viewCount - a.stats.viewCount).splice(0, 100);
        this.data = this.data
            .filter((entry) => entry.stats.viewCount < 1000000)
            .filter((entry) => new Date().getTime() - new Date(entry.publishedAt).getTime() < 365 * 24 * 60 * 60 * 1000)
            .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

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
                        text: "Zuseher",
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
                            // Assuming 'this.data' is accessible in this scope
                            // and contains the same order of elements as the chart data
                            const video = this.data[context.dataIndex];
                            return [video.title, "Published: " + video.publishedAt, "Views: " + video.stats.viewCount.toString()];
                        },
                    },
                },
            },
        };
        const canvas = this.querySelector<HTMLCanvasElement>("#videoViews")!;
        const chart = new Chart(canvas, {
            type: "bar",
            data: {
                labels: this.data.map((entry) => ""),
                datasets: [
                    {
                        label: "Zuseher",
                        data: this.data.map((entry) => entry.stats.viewCount),
                        backgroundColor: this.data.map((entry) => (entry.title.includes("Sachslehner") ? "#00cc00" : "#aa0000")),
                        borderWidth: 0,
                    },
                ],
            },
            options: chartOptions as any,
        });
    }

    render() {
        return html`<div class="${pageContainerStyle}">
            <div class="flex flex-col w-full  items-center gap-4 my-4 text-[#ccc]">
                <h1>Frau Sachslehner Zuseher Zähler</h1>
                <div class="italic text-sm text-center">Jeder Balken zeigt die Zuseherzahl eines eXXpress Videos der letzten 6 Monate</div>
                <div class="italic text-sm text-center -mt-2">Eventuell muss man ein bissl reinzoomen...</div>
                <div class="flex gap-4 text-xs">
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-4 bg-[#00cc00] rounded"></div>
                        Mit Sachslehner
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-4 bg-[#aa0000] rounded"></div>
                        Ohne Sachslehner
                    </div>
                </div>
                <canvas class="w-full flex-grow px-4" id="videoViews"></canvas>
                <h1 class="text-xl">Top 100 meistgesehen Videos</h1>
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
