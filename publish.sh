#!/bin/bash
set -e
npm run build
host=slayer.marioslab.io
host_dir=/home/badlogic/exxpress.marioslab.io
current_date=$(date "+%Y-%m-%d %H:%M:%S")
commit_hash=$(git rev-parse HEAD)
echo "{\"date\": \"$current_date\", \"commit\": \"$commit_hash\"}" > html/version.json

ssh -t $host "mkdir -p $host_dir/docker/data/postgres"
rsync -avz --exclude node_modules --exclude .git --exclude data --exclude docker/data ./ $host:$host_dir

if [ "$1" == "server" ]; then
    echo "Publishing client & server"
    ssh -t $host "export EXPRESS-WATCH-COUNT_DB=$EXPRESS-WATCH-COUNT_DB && export EXPRESS-WATCH-COUNT_DB_USER=$EXPRESS-WATCH-COUNT_DB_USER && export EXPRESS-WATCH-COUNT_DB_PASSWORD=$EXPRESS-WATCH-COUNT_DB_PASSWORD && cd $host_dir && ./docker/control.sh stop && ./docker/control.sh start && ./docker/control.sh logs"
else
    echo "Publishing client only"
fi