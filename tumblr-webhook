#!/bin/sh
docker run -d \
    --restart always \
    -v "${PWD}/config.json:/home/node/app/config.json" \
    --name tumblr-webhook \
    com.jimthecactus/tumblr-webhook

