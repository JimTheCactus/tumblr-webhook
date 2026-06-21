FROM node:24.15.0-slim
# Build up the dependencies
COPY tumblr-webbook/package.json /home/node/app/package.json
COPY tumblr-webbook/package-lock.json /home/node/app/package-lock.json
WORKDIR /home/node/app
RUN npm install

# Move over the actual script
COPY tumblr-webbook/index.mjs /home/node/app/index.mjs

# Start the script
CMD ["node", "index.mjs"]
