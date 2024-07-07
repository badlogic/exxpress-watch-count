import { Chart, registerables } from "chart.js";
import { PropertyValueMap, html, nothing, render } from "lit";
import { repeat } from "lit-html/directives/repeat.js";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { customElement, state } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { BaseElement, dom } from "../app";
import { heartIcon, reblogIcon, replyIcon, speechBubbleIcon } from "../utils/icons";
import { router } from "../utils/routing";
import { pageContainerStyle } from "../utils/styles";
import { getTimeDifference } from "../utils/utils";
import { removeStopwords, deu } from "stopword";
import { WordCloudController, WordElement } from "chartjs-chart-wordcloud";
Chart.register(...registerables);
Chart.register(WordCloudController, WordElement);

type Word = { count: number; text: string };

interface UserInfo {
    screen_name: string;
    name: string;
    description: string;
    profile_image_url_https: string;
}

interface ItemContent {
    itemType: string;
    tweet_results: {
        result: {
            core: {
                user_results: {
                    result: {
                        legacy: UserInfo;
                    };
                };
            };
            legacy: {
                bookmark_count: number;
                created_at: string;
                favorite_count: number;
                quote_count: number;
                reply_count: number;
                retweet_count: number;
                full_text: string;
                is_quote_status: boolean;
                quoted_status_permalink?: {
                    display: string;
                    expanded: string;
                };
                retweeted_status_result?: {
                    result: {
                        core: {
                            user_results: {
                                result: {
                                    legacy: UserInfo;
                                };
                            };
                        };
                        legacy: {
                            full_text: string;
                        };
                        quoted_status_result: {
                            result: {
                                core: {
                                    user_results: {
                                        result: {
                                            legacy: UserInfo;
                                        };
                                    };
                                };
                                legacy: {
                                    full_text: string;
                                };
                            };
                        };
                    };
                };
                id_str: string;
                user_id_str: string;
            };
            note_tweet?: {
                note_tweet_results: {
                    result: {
                        text: string;
                    };
                };
            };
            quoted_status_result?: {
                result: {
                    core: {
                        user_results: {
                            result: {
                                legacy: UserInfo;
                            };
                        };
                    };
                    legacy: {
                        full_text: string;
                    };
                    quoted_status_result: {
                        result: {
                            core: { user_results: { result: { legacy: UserInfo } } };
                            legacy: {
                                full_text: string;
                            };
                        };
                    };
                };
            };
        };
    };
}

interface Entry {
    content: {
        __typename: string;
        displayType: string;
        itemContent: ItemContent;
        items: { entryId: string; item: { itemContent: ItemContent } }[];
    };
}

interface TweetUser {
    account: string;
    name: string;
    description: string;
    avatar: string;
}

interface Tweet {
    user: TweetUser;
    url: string;
    createdAt: Date;
    text: string;
    bookmarks: number;
    favorites: number;
    retweets: number;
    quotes: number;
    replies: number;
    isQuoting?: { url: string; user: TweetUser; text: string };
    isRetweeting?: string;
}

function convertRawJson(entries: Entry[]) {
    const toTweet = (
        user: UserInfo,
        legacy: Entry["content"]["itemContent"]["tweet_results"]["result"]["legacy"],
        noteTweet?: Entry["content"]["itemContent"]["tweet_results"]["result"]["note_tweet"],
        quoteTweet?: Entry["content"]["itemContent"]["tweet_results"]["result"]["quoted_status_result"]
    ): Tweet => {
        let quoteUser: TweetUser | undefined = {
            account: legacy.quoted_status_permalink?.expanded.split("/")[3] ?? "",
            name: legacy.quoted_status_permalink?.expanded.split("/")[3] ?? "",
            description: "",
            avatar: "",
        };
        let text = legacy.full_text;
        if (noteTweet) text = noteTweet.note_tweet_results.result.text;
        if (legacy.full_text.startsWith("RT @")) {
            text = legacy.retweeted_status_result?.result.legacy.full_text ?? "";
            user = legacy.retweeted_status_result?.result.core.user_results.result.legacy ?? user;
            if (legacy.retweeted_status_result?.result.quoted_status_result) {
                const quoteUserRaw = legacy.retweeted_status_result?.result.quoted_status_result.result.core.user_results.result.legacy;
                quoteUser.account = quoteUserRaw.screen_name;
                quoteUser.name = quoteUserRaw.name;
                quoteUser.avatar = quoteUserRaw.profile_image_url_https;
                quoteUser.description = quoteUserRaw.description;
            }
        }
        if (legacy.is_quote_status && quoteTweet) {
            const quoteUserRaw = quoteTweet.result.core.user_results.result.legacy;
            quoteUser.account = quoteUserRaw.screen_name;
            quoteUser.name = quoteUserRaw.name;
            quoteUser.avatar = quoteUserRaw.profile_image_url_https;
            quoteUser.description = quoteUserRaw.description;
        }
        let tweetUser = { account: user.screen_name, name: user.name, description: user.description, avatar: user.profile_image_url_https };
        return {
            user: tweetUser,
            url: `https://twitter.com/${legacy.user_id_str}/status/${legacy.id_str}`,
            createdAt: new Date(legacy.created_at),
            text,
            bookmarks: legacy.bookmark_count,
            favorites: legacy.favorite_count,
            retweets: legacy.retweet_count,
            quotes: legacy.quote_count,
            replies: legacy.reply_count,
            isQuoting: legacy.is_quote_status
                ? {
                      url: legacy.quoted_status_permalink?.expanded ?? "",
                      user: quoteUser,
                      text: quoteTweet
                          ? quoteTweet.result.legacy.full_text
                          : legacy.retweeted_status_result?.result.quoted_status_result.result.legacy.full_text ?? "",
                  }
                : undefined,
            isRetweeting: legacy.full_text.startsWith("RT @") ? legacy.full_text.split(":")[0].replace("RT @", "") : undefined,
        };
    };
    const filteredTweets: Tweet[] = [];
    const filteredEntries: Entry[] = [];
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (
            entry.content.__typename == "TimelineTimelineItem" &&
            entry.content.itemContent?.itemType == "TimelineTweet" &&
            entry.content.itemContent?.tweet_results.result.legacy
        ) {
            const legacy = entry.content.itemContent.tweet_results.result.legacy;
            const noteTweet = entry.content.itemContent.tweet_results.result.note_tweet;
            const quotedTweet = entry.content.itemContent.tweet_results.result.quoted_status_result;
            filteredTweets.push(
                toTweet(entry.content.itemContent.tweet_results.result.core.user_results.result.legacy, legacy, noteTweet, quotedTweet)
            );
        } else if (entry.content.displayType == "VerticalConversation") {
            for (const item of entry.content.items) {
                if (item.item.itemContent.itemType != "TimelineTweet") {
                    filteredEntries.push(entry);
                    break;
                }
                const legacy = item.item.itemContent.tweet_results.result.legacy;
                const noteTweet = item.item.itemContent.tweet_results.result.note_tweet;
                const quotedTweet = item.item.itemContent.tweet_results.result.quoted_status_result;
                filteredTweets.push(
                    toTweet(item.item.itemContent.tweet_results.result.core.user_results.result.legacy, legacy, noteTweet, quotedTweet)
                );
            }
        } else {
            filteredEntries.push(entry);
        }
    }
    console.log(filteredTweets);
    return filteredTweets;
}

function binTweets(tweets: Tweet[]) {
    const byHourOfDay = new Map<number, Tweet[]>();
    const byWeekDay = new Map<string, Tweet[]>();
    const byDate = new Map<string, Tweet[]>();
    const byMonth = new Map<string, Tweet[]>();
    const weekDayNames = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
    const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

    tweets.forEach((tweet) => {
        const createdAt = new Date(tweet.createdAt);
        const hour = createdAt.getHours();
        const weekDay = weekDayNames[createdAt.getDay()];
        const date = createdAt.toISOString().split("T")[0];
        const month = monthNames[createdAt.getMonth()] + " " + createdAt.getFullYear();

        if (!byHourOfDay.has(hour)) byHourOfDay.set(hour, []);
        if (!byWeekDay.has(weekDay)) byWeekDay.set(weekDay, []);
        if (!byDate.has(date)) byDate.set(date, []);
        if (!byMonth.has(month)) byMonth.set(month, []);

        byHourOfDay.get(hour)!.push(tweet);
        byWeekDay.get(weekDay)!.push(tweet);
        byDate.get(date)!.push(tweet);
        byMonth.get(month)!.push(tweet);
    });

    let hours: { hour: string; count: number; tweets: Tweet[] }[] = [];
    for (let i = 0; i < 24; i++) {
        hours[i] = { hour: i + ":00", count: byHourOfDay.get(i)?.length ?? 0, tweets: byHourOfDay.get(i) ?? [] };
    }

    let days: { day: string; count: number; tweets: Tweet[] }[] = [];
    weekDayNames.push(weekDayNames[0]);
    weekDayNames.splice(0, 1);
    let i = 0;
    for (const day of weekDayNames) {
        days[i++] = { day: day, count: byWeekDay.get(day)?.length ?? 0, tweets: byWeekDay.get(day) ?? [] };
    }

    let months: { month: string; count: number; tweets: Tweet[] }[] = [];
    i = 0;
    byMonth.forEach((value, key) => {
        months[i++] = { month: key, count: value.length, tweets: value };
    });
    months.reverse();

    return { byHourOfDay: hours, byWeekDay: days, byDate, byMonth: months };
}

function extractHandles(text: string): string[] {
    const handleRegex = /@\w+/g;
    const matches = text.match(handleRegex);
    return matches || [];
}

const createChart = (canvas: HTMLCanvasElement, label: string, labels: string[], data: number[], clicked = (index: number) => {}) => {
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
        onClick: function (event: any, elements: any[]) {
            if (elements.length > 0) {
                clicked(elements[0].index);
            }
        },
    };
    const chart = new Chart(canvas, {
        type: "bar",
        data: {
            labels,
            datasets: [
                {
                    label,
                    data: data,
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

function replaceSpecialChars(str: string): string {
    // Added more special characters to the regex pattern
    const result = str.replace(/[.,!?@#$%^&*()_+\-=\[\]{};':„"\\|,.<>\/?~`]/g, " ");
    return result;
}

function calculateWordFrequencies(texts: string[]): Word[] {
    const wordFrequencies: Record<string, Word> = {};
    const stopWords = [...deu];
    for (const text of texts) {
        const filtered = text
            .split(" ")
            .filter((token) => !(token.startsWith("http") || token.includes("/")))
            .join(" ");
        const tokensWithStopword = replaceSpecialChars(filtered)
            .split(" ")
            .filter((token) => !(token.startsWith("http") || token.includes("/")))
            .map((token) => (token.endsWith(".") ? token.substring(0, token.length - 1) : token))
            .map((token) => token.toLowerCase())
            .map((token) => token.trim())
            .filter((token) => token.length > 0);
        const tokens = removeStopwords(tokensWithStopword, stopWords);

        for (let token of tokens) {
            token = token.toLowerCase().trim();
            if (token.length < 2) continue;
            if (/^\d+$/.test(token)) continue;
            if (token.startsWith("@")) continue;
            let word = wordFrequencies[token];
            if (!word) {
                word = {
                    count: 0,
                    text: token,
                };
                wordFrequencies[token] = word;
            }
            word.count++;
        }
    }
    return Object.values(wordFrequencies).sort((a, b) => b.count - a.count);
}

function formatTweetText(input: string) {
    const hashtagRegex = /#([\p{L}\p{N}_-]+)/gu;
    const mentionRegex = /@([\p{L}\p{N}_-]+)/gu;

    const text = input
        .replace(hashtagRegex, '<span class="text-blue-400">#$1</span>')
        .replace(mentionRegex, '<a href="https://twitter.com/$1" class="text-blue-400">@$1</a>')
        .trim();
    // prettier-ignore
    return html`<div class="whitespace-pre-wrap">${unsafeHTML(text)}</div>`;
}

function renderTweet(tweet: Tweet, user: TweetUser) {
    return html`<div
        class="border border-[#333333] rounded-md max-w-[600px] mt-4 p-4 cursor-pointer flex flex-col"
        @click=${() => {
            window.open(tweet.url, "_blank");
        }}
    >
        ${user.account.toLowerCase() != tweet.user.account.toLowerCase()
            ? html`<div class="flex items-center gap-2 mb-2 text-[#aaa]">
                  <img src="${user.avatar}" class="h-4 w-4 rounded-full" /><span class="text-sm font-semibold">${user.name} retweeted</span>
              </div>`
            : nothing}
        <div class="flex items-center gap-2 mb-2">
            <img src="${tweet.user.avatar}" class="h-6 w-6 rounded-full" /><span class="font-semibold">${tweet.user.name}</span>
            <span class="text-sm">${getTimeDifference(tweet.createdAt)}</span>
        </div>
        ${formatTweetText(tweet.text)}
        ${tweet.isQuoting
            ? html`<div class="mt-4 border border-[#333333] rounded-md p-4">
                  <div class="flex items-center gap-2 mb-2">
                      <img src="${tweet.isQuoting.user.avatar}" class="h-6 w-6 rounded-full" /><span class="font-semibold"
                          >${tweet.isQuoting.user.name}</span
                      >
                  </div>
                  ${formatTweetText(tweet.isQuoting.text)}
              </div>`
            : nothing}
        <div class="flex gap-2 items-center justify-center mt-2">
            <i class="icon w-4 h-4">${replyIcon}</i><span> ${tweet.replies}</span> <i class="icon w-4 h-4 ml-4">${speechBubbleIcon}</i
            ><span> ${tweet.quotes}</span> <i class="icon w-4 h-4 ml-4">${reblogIcon}</i><span> ${tweet.retweets}</span
            ><i class="icon w-4 h-4 ml-4">${heartIcon}</i><span> ${tweet.favorites}</span>
        </div>
    </div>`;
}

function toggleTweets(ev: Event) {
    const target = ev.target as HTMLElement;
    target.parentElement?.parentElement?.querySelector("#tweets")?.classList.toggle("hidden");
    target.innerText = target.innerText == "Tweets zeigen" ? "Tweets verstecken" : "Tweets zeigen";
}

function renderTweets(tweets: Tweet[], container: HTMLElement, user: TweetUser) {
    container.innerHTML = "";
    container.append(
        dom(
            html`<div>
                ${repeat(
                    tweets,
                    (tweet) => tweet.url,
                    (tweet) => renderTweet(tweet, user)
                )}
            </div>`
        )[0]
    );
}

function renderStats(stats: { user: TweetUser; tweets: Tweet[] }[], element: HTMLElement, user: TweetUser) {
    render(
        html`${map(
            stats,
            (stat) =>
                html`<div class="border border-[#333333] rounded-md max-w-[600px] p-4 flex flex-col">
                    <div class="flex gap-2 items-center">
                        ${stat.user.avatar.length > 0
                            ? html`<img src="${stat.user.avatar}" class="h-6 w-6 rounded-full" />`
                            : html`<div class="h-6 w-6 bg-[#ccc] rounded-full flex items-center justify-center">🫥</div>`}
                        <a class="text-blue-400 text-lg" href="https://twitter.com/${stat.user.account}">${stat.user.name}</a
                        ><span class="text-green-400 font-semibold">${stat.tweets.length}x</span>
                        <button class="text-primary" @click=${(ev: Event) => toggleTweets(ev)}>Tweets zeigen</button>
                    </div>
                    <div class="max-w-[600px]">${stat.user.description}</div>
                    <div id="tweets" class="hidden">${map(stat.tweets, (tweet) => renderTweet(tweet, user))}</div>
                </div>`
        )}`,
        element
    );
}

@customElement("twitter-page")
export class TwitterPage extends BaseElement {
    @state()
    isLoading = true;

    @state()
    tweets: Tweet[] = [];
    users = new Map<string, TweetUser>();
    user!: TweetUser;

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.load();
    }

    async load() {
        try {
            const response = await fetch("/data/" + router.getCurrentParams()!.get("account")! + ".json");
            if (!response.ok) {
                alert("Whoops, da lief was schief");
                return;
            }
            const entries = (await response.json()) as Entry[];
            this.tweets = convertRawJson(entries);
            for (const tweet of this.tweets) {
                this.users.set(tweet.user.account.toLowerCase(), tweet.user);
                if (tweet.isQuoting) {
                    this.users.set(tweet.isQuoting.user.account.toLowerCase(), tweet.isQuoting.user);
                }
            }
            this.user = this.users.get(router.getCurrentParams()!.get("account")!)!;
            this.renderData();
        } catch (e) {
            console.error(e);
        } finally {
            this.isLoading = false;
        }
    }

    renderCharts() {
        // Charts
        const tweets = binTweets(this.tweets);
        const barClickHandler = (data: { tweets: Tweet[] }[], list: HTMLElement) => {
            let lastIndex = -1;
            return (index: number) => {
                list.innerHTML = "";
                if (index == lastIndex) {
                    lastIndex = -1;
                } else {
                    lastIndex = index;
                    const t = data[index].tweets;
                    list.append(
                        dom(
                            html`<div>
                                ${repeat(
                                    t,
                                    (tweet) => tweet.url,
                                    (tweet) => renderTweet(tweet, this.user)
                                )}
                            </div>`
                        )[0]
                    );
                }
            };
        };
        createChart(
            this.querySelector("#tweetsPerHour")!,
            "Tweets pro Tageszeit",
            tweets.byHourOfDay.map((hour) => hour.hour),
            tweets.byHourOfDay.map((hour) => hour.count),
            barClickHandler(tweets.byHourOfDay, this.querySelector<HTMLDivElement>("#tweetsPerHourList")!)
        );
        createChart(
            this.querySelector("#tweetsPerDay")!,
            "Tweets pro Wochentag",
            tweets.byWeekDay.map((day) => day.day),
            tweets.byWeekDay.map((day) => day.count),
            barClickHandler(tweets.byWeekDay, this.querySelector<HTMLDivElement>("#tweetsPerDayList")!)
        );

        createChart(
            this.querySelector("#tweetsPerMonth")!,
            "Tweets pro Monat",
            tweets.byMonth.map((month) => month.month),
            tweets.byMonth.map((month) => month.count),
            barClickHandler(tweets.byMonth, this.querySelector<HTMLDivElement>("#tweetsPerMonthList")!)
        );

        createChart(
            this.querySelector("#likesPerMonth")!,
            "Likes + Retweets pro Monat",
            tweets.byMonth.map((month) => month.month),
            tweets.byMonth.map((month) => {
                let count = 0;
                for (const tweet of month.tweets) {
                    count += tweet.favorites + tweet.retweets;
                }
                return count;
            }),
            barClickHandler(tweets.byMonth, this.querySelector<HTMLDivElement>("#likesPerMonthList")!)
        );
    }

    renderTopWorstTweets() {
        // Top/worst tweets
        const topTweets = this.tweets
            .filter((tweet) => tweet.user.account.toLowerCase() == router.getCurrentParams()?.get("account")!)
            .sort((a, b) => {
                const ratiob = b.favorites + b.retweets - b.replies;
                const ratioa = a.favorites + a.retweets - a.replies;
                return ratiob - ratioa;
            })
            .slice(0, 10);
        renderTweets(topTweets, this.querySelector("#topTweets")!, this.user);

        const worstTweets = this.tweets
            .sort((a, b) => {
                const ratiob = b.favorites + b.retweets - b.replies;
                const ratioa = a.favorites + a.retweets - a.replies;
                return ratioa - ratiob;
            })
            .slice(0, 10);
        renderTweets(worstTweets, this.querySelector("#worstTweets")!, this.user);
    }

    renderMentions() {
        // Mentions
        const mentions = new Map<string, Tweet[]>();
        for (const tweet of this.tweets) {
            const handles = new Set<string>(extractHandles(tweet.text));
            for (const handle of handles) {
                const tweets = mentions.get(handle) ?? [];
                if (!tweets.includes(tweet)) tweets.push(tweet);
                mentions.set(handle, tweets);
            }
        }
        const seen = new Map<string, { user: TweetUser; tweets: Tweet[] }>();
        const sortedMentions = Array.from(mentions)
            .map((mention) => {
                const handle = mention[0].replace("@", "");
                const user = this.users.get(handle.toLowerCase()) ?? {
                    account: handle,
                    name: handle,
                    description: "",
                    avatar: "",
                };
                return { user, tweets: mention[1].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) };
            })
            .filter((mention) => {
                if (seen.has(mention.user.account.toLowerCase())) {
                    seen.get(mention.user.account.toLowerCase())?.tweets.push(...mention.tweets);
                    return false;
                } else {
                    seen.set(mention.user.account.toLowerCase(), mention);
                    return true;
                }
            })
            .sort((a, b) => b.tweets.length - a.tweets.length);
        renderStats(sortedMentions, this.querySelector("#mentions")!, this.user);
    }

    renderRetweetsAndQuotes() {
        // Retweets and quotes
        const retweets = new Map<string, { user: TweetUser; tweets: Tweet[] }>();
        const quotes = new Map<string, { user: TweetUser; tweets: Tweet[] }>();
        for (const tweet of this.tweets) {
            if (tweet.isQuoting) {
                const quotedTweets = quotes.get(tweet.isQuoting.user.account) ?? { user: tweet.isQuoting.user, tweets: [] };
                quotedTweets.tweets.push(tweet);
                quotes.set(tweet.isQuoting.user.account, quotedTweets);
            }

            if (tweet.isRetweeting) {
                const retweetedTweets = retweets.get(tweet.isRetweeting) ?? { user: tweet.user, tweets: [] };
                retweetedTweets.tweets.push(tweet);
                retweets.set(tweet.isRetweeting, retweetedTweets);
            }
        }

        const sortedRetweets = Array.from(retweets)
            .map((retweet) => {
                retweet[1].tweets.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
                return retweet[1];
            })
            .sort((a, b) => b.tweets.length - a.tweets.length);
        const sortedQuotes = Array.from(quotes)
            .map((quote) => {
                quote[1].tweets.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
                return quote[1];
            })
            .sort((a, b) => b.tweets.length - a.tweets.length);

        renderStats(sortedQuotes, this.querySelector<HTMLDivElement>("#mostQuotes")!, this.user);
        renderStats(sortedRetweets, this.querySelector<HTMLDivElement>("#mostRetweets")!, this.user);
    }

    renderWordCloud() {
        const wordsFreqs = calculateWordFrequencies(this.tweets.map((tweet) => tweet.text));
        const wordCloudCanvas = this.querySelector("#wordCloud") as HTMLCanvasElement;
        const words = wordsFreqs.map((word) => word.text).slice(0, 100);
        const maxCount = wordsFreqs.reduce((prevWord, word) => (prevWord.count < word.count ? word : prevWord)).count;
        const wordFrequencies = wordsFreqs.map((word) => 10 + (word.count / maxCount) * 72).slice(0, 100);
        let ctx = wordCloudCanvas.getContext("2d");
        if (ctx) {
            new Chart(ctx, {
                type: WordCloudController.id,
                data: {
                    labels: words,
                    datasets: [
                        {
                            data: wordFrequencies,
                        },
                    ],
                },
                options: {
                    plugins: {
                        tooltip: {
                            enabled: false,
                        },
                        legend: {
                            display: false, // Hide the legend box and all labels
                        },
                    },
                },
            });
        }
    }

    renderData() {
        this.renderCharts();
        this.renderTopWorstTweets();
        this.renderMentions();
        this.renderRetweetsAndQuotes();
        this.renderWordCloud();
    }

    search() {
        const results = this.querySelector<HTMLDivElement>("#searchResults")!;
        results.innerHTML = "";
        const query = this.querySelector<HTMLInputElement>("#query")!.value.trim();
        if (query.length < 3) return;

        const queryTokens = query
            .split(" ")
            .filter((token) => token.trim().length >= 3)
            .map((token) => token.trim().toLowerCase());
        const matches = this.tweets
            .filter((tweet) => {
                const tweetTokens = replaceSpecialChars(tweet.text)
                    .split(" ")
                    .map((token) => token.trim().toLowerCase());
                for (const token of tweetTokens) {
                    for (const queryToken of queryTokens) {
                        if (token.includes(queryToken)) {
                            return true;
                        }
                    }
                }
                return false;
            })
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        console.log(matches.length);
        results.append(
            dom(
                html`<div class="flex flex-col">
                    <span>Resultate: ${matches.length} / ${this.tweets.length} Tweets, ${(matches.length / this.tweets.length).toFixed(2)}%</span>
                    ${repeat(
                        matches,
                        (tweet) => tweet.url,
                        (tweet) => renderTweet(tweet, this.user)
                    )}
                </div>`
            )[0]
        );
    }

    render() {
        const account = router.getCurrentParams()?.get("account");
        return html`<div class="${pageContainerStyle}">
            <div class="flex flex-col w-full  items-center gap-4 my-4 text-[#ccc]">
                <h1><a href="https://twitter.com/${account}" class="text-blue-400">@${account}</a> auf Twitter</h1>
                ${this.isLoading ? html`<loading-spinner></loading-spinner>` : nothing}
                <span class="italic text-center text-xs">Klicke auf einen Balken im Chart, um die dazugehörigen Tweets anzuzeigen</span>
                <span class="underline text-xl">Tweets nach Tageszeit</span>
                <canvas class="w-full flex-grow px-4 max-w-[720px] max-h-[400px]" id="tweetsPerHour"></canvas>
                <div id="tweetsPerHourList" class="px-4"></div>
                <span class="underline text-xl">Tweets pro Wochentag</span>
                <canvas class="w-full flex-grow px-4 max-w-[720px] max-h-[400px]" id="tweetsPerDay"></canvas>
                <div id="tweetsPerDayList" class="px-4"></div>
                <span class="underline text-xl">Tweets pro Monat</span>
                <canvas class="w-full flex-grow px-4 max-w-[720px] max-h-[400px]" id="tweetsPerMonth"></canvas>
                <div id="tweetsPerMonthList" class="px-4"></div>
                <span class="underline text-xl">Likes + Retweets pro Monat</span>
                <canvas class="w-full flex-grow px-4 max-w-[720px] max-h-[400px]" id="likesPerMonth"></canvas>
                <div id="likesPerMonthList" class="px-4"></div>
                <span class="underline text-xl">World Cloud</span>
                <canvas id="wordCloud" class="h-[50vh] max-h-[500px]"></canvas>
                <span class="underline text-xl">Top 10 Tweets</span>
                <span class="text-xs -mt-3">(Likes + Retweets - Replies) == Ratio :D</span>
                <div id="topTweets" class="px-4"></div>
                <span class="underline text-xl">Schlechteste 10 Tweets</span>
                <span class="text-xs -mt-3">(Likes + Retweets - Replies) == Ratio :D</span>
                <div id="worstTweets" class="px-4"></div>
                <span class="underline text-xl">Erwähnte Accounts</span>
                <div id="mentions" class="flex flex-col gap-4 px-4 w-full max-w-[632px]"></div>
                <span class="underline text-xl">Zitierte Accounts</span>
                <div id="mostQuotes" class="flex flex-col gap-4 px-4"></div>
                <span class="underline text-xl">Geretweetete Accounts</span>
                <div id="mostRetweets" class="flex flex-col gap-4 px-4"></div>
                <span class="underline text-xl">Tweets Stichwort Suche</span>
                <input
                    id="query"
                    class="textfield w-full max-w-[600px]"
                    @input=${() => this.search()}
                    placeholder="Ein oder mehrere Stichwörter ..."
                />
                <div id="searchResults" class="min-h-[20vh] px-4"></div>
            </div>
        </div>`;
    }
}
