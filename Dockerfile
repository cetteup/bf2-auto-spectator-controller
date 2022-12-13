FROM node:16.19.0

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install -g npm@8.4.1 --update-notifier=false

RUN npm install --update-notifier=false

ADD . /usr/src/app

RUN npm run build-ts

RUN npm prune --production

CMD ["node", "dist/index.js"]

EXPOSE 8181
