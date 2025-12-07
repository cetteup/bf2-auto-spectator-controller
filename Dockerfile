FROM node:24.11.1

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci

ADD . /usr/src/app

RUN npm run build

RUN npm prune --omit=dev

CMD ["node", "dist/bin/controller.js"]

EXPOSE 8181
