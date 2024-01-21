# exxpress-watch-count

A simple app that shows the historical and live watch count of Austria's most useless, state funded publication, eXXpress. Why they
get funding is anyone's guess. Nobody is watching this shit.

### Environment

```
export EXPRESS_WATCH_COUNT_YOUTUBE_KEY="<your YouTube API key>"
```

### Development

1. Install & run Docker
2. Install NodeJS +19

```
npm run dev
```

In VS Code run the `server` and `client` launch configurations.

### Deployment

1. Deploy backend & frontend: `./publish.sh server`
1. Deploy just the frontend: `./publish.sh`
