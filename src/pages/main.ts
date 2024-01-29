import { PropertyValueMap, html } from "lit";
import { Api } from "../api.js";
import { BaseElement, getScrollParent } from "../app.js";
import { pageContainerStyle, pageContentStyle } from "../utils/styles.js";
export { Store } from "../utils/store.js";
import { Chart, registerables } from "chart.js";
import { customElement, property } from "lit/decorators.js";
Chart.register(...registerables);
import "moment";
import "chartjs-adapter-moment";

@customElement("main-page")
export class MainPage extends BaseElement {
    @property()
    error?: string;

    history: { timestamp: number; count: number }[] = [];
    historySelf: { timestamp: number; count: number }[] = [];
    historyGrace: { timestamp: number; count: number }[] = [];

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.fetchHistory();
    }

    async fetchHistory() {
        const response = await Api.history();
        if (response instanceof Error) {
            this.error = "Whoops, da lief etwas falsch";
            return;
        }
        const responseSelf = await Api.historySelf();
        if (responseSelf instanceof Error) {
            this.error = "Whoops, da lief etwas falsch";
            return;
        }
        const responseGrace = await Api.historyGrace();
        if (responseGrace instanceof Error) {
            this.error = "Whoops, da lief etwas falsch";
            return;
        }
        this.history = response;
        this.historySelf = responseSelf;
        this.historyGrace = responseGrace;
        this.renderStats();
        console.log("Updated chart data");
        setTimeout(() => this.fetchHistory(), 15000);
    }

    renderStats() {
        const history = this.history;
        const historySelf = this.historySelf;
        const historyGrace = this.historyGrace;
        const current = this.querySelector<HTMLSpanElement>("#current")!;
        const hourCanvas = this.querySelector<HTMLCanvasElement>("#hour")!;
        const dayCanvas = this.querySelector<HTMLCanvasElement>("#day")!;
        const weekCanvas = this.querySelector<HTMLCanvasElement>("#week")!;
        const monthCanvas = this.querySelector<HTMLCanvasElement>("#month")!;
        const versusCanvas = this.querySelector<HTMLCanvasElement>("#versus")!;
        current.innerText = history[history.length - 1].count.toString();
        const now = new Date().getTime();

        const binData = (data: { timestamp: number; count: number }[], binSize: number, startTime: number, endTime: number) => {
            // Initialize bins for the entire time frame
            const bins: { [key: string]: { total: number; count: number } } = {};
            for (let t = startTime; t < endTime; t += binSize) {
                bins[t] = { total: 0, count: 0 };
            }

            // Function to find the correct bin start time
            const getBinStartTime = (timestamp: number) => {
                return startTime + Math.floor((timestamp - startTime) / binSize) * binSize;
            };

            // Assign data to bins
            data.forEach((entry) => {
                const binKey = getBinStartTime(entry.timestamp);
                if (bins[binKey] !== undefined) {
                    bins[binKey].total += entry.count;
                    bins[binKey].count++;
                }
            });

            // Calculate averages and handle empty bins
            return Object.keys(bins).map((key) => {
                const bin = bins[key];
                return {
                    timestamp: parseInt(key),
                    count: bin.count > 0 ? Math.round(bin.total / bin.count) : 0,
                };
            });
        };

        const createChart = (
            canvas: HTMLCanvasElement,
            data: { timestamp: number; count: number }[],
            binSize: number,
            startTime: number,
            endTime: number
        ) => {
            const scrollY = getScrollParent(this)!.scrollTop;
            const binnedData = binData(data, binSize, startTime, endTime);
            if ((canvas as any).__chart) {
                const chart: Chart = (canvas as any).__chart;
                chart.data.datasets[0].data = binnedData.map((entry) => entry.count);
                chart.update();
                return;
            }

            const chartOptions = {
                animation: false, // Disable animations
                scales: {
                    x: {
                        grid: { display: false },
                    },
                    y: {
                        beginAtZero: true,
                        grid: { display: true, color: "#ccc2" },
                        ticks: {
                            stepSize: 1, // This will force the step size between ticks to be 1.
                            // Create a user callback to return only integer values.
                            callback: function (value: any, index: any, values: any) {
                                if (Math.floor(value) === value) {
                                    return value;
                                }
                            },
                        },
                    },
                },
                plugins: {
                    legend: {
                        display: false, // Hide the legend box and all labels
                    },
                },
            };
            const chart = new Chart(canvas, {
                type: "bar",
                data: {
                    labels: binnedData.map((entry) => ""),
                    datasets: [
                        {
                            label: "⌀ Zuseher",
                            data: binnedData.map((entry) => entry.count),
                            backgroundColor: "rgba(75, 192, 192, 0.2)",
                            borderColor: "rgba(75, 192, 192, 1)",
                            borderWidth: 1,
                        },
                    ],
                },
                options: chartOptions as any,
            });
            (canvas as any).__chart = chart;
        };

        const filterHistory = (timeFrame: number) => {
            return history.filter((entry) => now - entry.timestamp <= timeFrame);
        };

        const minute = 60000;
        const hour = 3600000;
        const day = 86400000;

        createChart(hourCanvas, filterHistory(hour), minute, now - hour, now);
        createChart(dayCanvas, filterHistory(24 * hour), hour, now - 24 * hour, now);
        createChart(weekCanvas, filterHistory(7 * day), day, now - 7 * day, now);
        createChart(monthCanvas, filterHistory(30 * day), day, now - 30 * day, now);

        const createVersusChart = (
            canvas: HTMLCanvasElement,
            data1: { timestamp: number; count: number }[],
            data2: { timestamp: number; count: number }[],
            data3: { timestamp: number; count: number }[],
            hours: number
        ) => {
            const filter = (array: { timestamp: number; count: number }[], hours: number) => {
                const oneDayAgo = Date.now() - hours * 60 * 60 * 1000;
                return array.filter((item) => item.timestamp > oneDayAgo);
            };
            data1 = filter(data1, hours);
            data2 = filter(data2, hours);
            data3 = filter(data3, hours);

            if ((canvas as any).__chart) {
                const chart: Chart<
                    "line",
                    {
                        x: Date;
                        y: number;
                    }[],
                    unknown
                > = (canvas as any).__chart;
                chart.data.datasets[0].data = data1.map((entry) => ({ x: new Date(entry.timestamp), y: entry.count }));
                chart.data.datasets[1].data = data2.map((entry) => ({ x: new Date(entry.timestamp), y: entry.count }));
                chart.data.datasets[2].data = data3.map((entry) => ({ x: new Date(entry.timestamp), y: entry.count }));
                chart.update();
                return;
            }
            const chartOptions = {
                animation: false, // Disable animations
                scales: {
                    x: {
                        type: "time", // Set x-axis to time
                        time: {
                            unit: "hour", // Adjust according to your data (second, minute, etc.)
                        },
                        grid: { display: false },
                    },
                    y: {
                        beginAtZero: true,
                        grid: { display: true, color: "#ccc2" },
                        ticks: {
                            stepSize: 1,
                            callback: function (value: any, index: any, values: any) {
                                if (Math.floor(value) === value) {
                                    return value;
                                }
                            },
                        },
                    },
                },
            };
            const chart = new Chart(canvas, {
                type: "line",
                data: {
                    datasets: [
                        {
                            label: "eXXpress",
                            data: data1.map((entry) => ({ x: new Date(entry.timestamp), y: entry.count })),
                            backgroundColor: "rgba(75, 192, 192, 0.2)",
                            borderColor: "rgba(75, 192, 192, 1)",
                            borderWidth: 1,
                            pointRadius: 0,
                        },
                        {
                            label: "Zuseher Zähler",
                            data: data2.map((entry) => ({ x: new Date(entry.timestamp), y: entry.count })),
                            backgroundColor: "rgba(132, 99, 255, 0.2)",
                            borderColor: "rgba(132, 99, 255, 1)",
                            borderWidth: 1,
                            pointRadius: 0,
                        },
                        {
                            label: "Gorilla Grace",
                            data: data3.map((entry) => ({ x: new Date(entry.timestamp), y: entry.count })),
                            backgroundColor: "rgba(255, 0, 0, 0.2)",
                            borderColor: "rgba(255, 0, 0, 0.7)",
                            borderWidth: 1,
                            pointRadius: 0,
                        },
                    ],
                },
                options: { ...(chartOptions as any), responsive: true, aspectRatio: 1 / 1 },
            });
            (canvas as any).__chart = chart;
        };

        const hours = parseInt(this.querySelector<HTMLInputElement>("#versusHours")?.value ?? "12") ?? 12;
        createVersusChart(versusCanvas, history, historySelf, historyGrace, hours);
        queueMicrotask(() => {
            getScrollParent(this)!.scrollTop = scrollY;
        });
    }

    render() {
        return html`<div class="${pageContainerStyle}">
            <div class="${pageContentStyle} items-center gap-4 my-4 text-[#ccc] px-4">
                <h1>e<span class="text-red-400">XX</span>press TV Zuseher Zähler</h1>
                <div class="italic text-sm text-center">
                    Ein Projekt zur mentalen Entlastung von
                    <a class="text-blue-400" href="https://twitter.com/florianklenk/status/1748772531954160125">Florian Klenk</a>
                </div>
                <img class="rounded-md w-full max-w-[400px] mx-4" src="/images/schmittschuetz.jpg" />
                <a
                    class="text-blue-400 italic text-xs font-semibold -mt-2"
                    href="https://www.derstandard.at/story/2000124600520/gehobener-boulevard-in-richard-schmitts-exxpress"
                    >FOTO: STANDARD, Fischer</a
                >
                <div class="text-center text-sm">"Staatlich geförderte Sachen zum Lachen mit Eva und Richard" präsentiert</div>
                <div class="text-center font-semibold">Österreichs teuerster & unbeliebtester Livestream</div>
                <a
                    class="text-lg font-semibold underline text-blue-400 text-center"
                    href="https://www.profil.at/oesterreich/mehrere-kuendigungen-bei-online-medium-exxpress/402608612"
                    >Staatliche Förderung</a
                >
                <span class="text-[32px] font-semibold text-red-400">€ 1.013.000 EUR</span>
                <span class="text-lg font-semibold underline">Zuseher aktuell</span>
                <span class="text-[32px] font-semibold text-red-400" id="current"></span>
                <span class="text-lg font-semibold underline">⌀ Zuseher pro Minute, letzte Stunde</span>
                <canvas class="max-w-[750px]" id="hour"></canvas>
                <span class="text-lg font-semibold underline">⌀ Zuseher pro Stunde, letzte 24 Stunden</span>
                <canvas class="max-w-[750px]" id="day"></canvas>
                <span class="text-lg font-semibold underline">⌀ Zuseher pro Tag, letzte 7 Tage</span>
                <canvas class="max-w-[750px]" id="week"></canvas>
                <span class="text-lg font-semibold underline">⌀ Zuseher pro Tag, letzte 30 Tage</span>
                <canvas class="max-w-[750px]" id="month"></canvas>

                <span class="text-lg font-semibold underline">eXXpress TV Livestream</span>
                <img class="h-12 w-12" src="images/vs.png" />
                <a href="https://www.youtube.com/watch?v=5LqKABevwYQ" class="text-blue-400 text-lg font-semibold underline"
                    >Zuseher Zähler Livestream (nicht mehr live)</a
                >
                <a href="https://www.youtube.com/watch?v=yfSyjwY6zSQ" class="text-blue-400 text-lg font-semibold underline"
                    >Gorilla Grace Livestream</a
                >
                <canvas class="max-w-[750px]" id="versus"></canvas>
                <div class="flex items-center gap-2">
                    <span>Letzte</span>
                    <input
                        class="bg-transparent border border-divider p-2 rounded appearance-none"
                        style="-webkit-appearance: none; -moz-appearance: textfield;"
                        id="versusHours"
                        type="number"
                        min="1"
                        max="72"
                        value="12"
                        @change=${() => this.renderStats()}
                    />
                    <span>Stunde(n)</span>
                </div>

                <span class="mt-2 text-xs italic text-center"
                    >Mit Spucke und Tixo gebaut von <a class="text-blue-400" href="https://twitter.com/badlogicgames">Mario Zechner</a>, Ideas guy
                    <a class="text-blue-400" href="https://twitter.com/JustRefleX">riffraff Austrian</a></span
                >
                <div class="text-xs italic text-center">
                    Datenschutz: Es werden keine Daten gesammelt, nicht einmal deine IP Adresse. Es werden keine Services Dritter eingebunden, die
                    Daten sammeln könnten.
                </div>
            </div>
        </div>`;
    }
}
