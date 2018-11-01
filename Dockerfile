FROM node:8.12.0-jessie
# Build up the dependencies
COPY package.json /home/node/app/package.json
COPY package-lock.json /home/node/app/package-lock.json
WORKDIR /home/node/app
RUN npm install

# Move over the actual script
COPY index.js /home/node/app/index.js

# Start the script
CMD ["node", "index.js"]
