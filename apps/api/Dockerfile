FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./

COPY packages/types/package.json packages/types/package.json
COPY packages/validation/package.json packages/validation/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/romaji/package.json packages/romaji/package.json
COPY packages/config/package.json packages/config/package.json
COPY apps/api/package.json apps/api/package.json
COPY services/importer/package.json services/importer/package.json

RUN npm ci

COPY apps/api apps/api
COPY packages packages
COPY services/importer services/importer
COPY package.json .

EXPOSE 3000

CMD ["npm", "run", "start", "--workspace=@kotoba/api"]