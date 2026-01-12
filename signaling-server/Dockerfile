FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY signaling-server.js .

EXPOSE 8080

CMD ["node", "signaling-server.js"]
