FROM node:20.18.0

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install -g npm@latest --update-notifier=false

RUN npm install --update-notifier=false

ADD . /usr/src/app

RUN npm run build-ts

RUN npm prune --omit=dev

CMD ["node", "dist/index.js"]

EXPOSE 8181
