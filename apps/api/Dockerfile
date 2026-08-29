# API e worker do Casa. Mesma imagem, comandos diferentes.
#
# Contexto de build é a RAIZ do monorepo: o package-lock.json e o
# packages/contracts vivem lá.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY packages/contracts/package.json packages/contracts/
# Sem --omit=dev: o tsx é o runtime aqui. Trocar por build compilado quando o
# tamanho da imagem virar problema — hoje não é.
RUN npm ci --workspace @casa/api --workspace @casa/contracts --include-workspace-root

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
WORKDIR /app/apps/api
# Não roda como root: se alguém escapar do processo, que não seja com tudo.
USER node
EXPOSE 3333
CMD ["npx", "tsx", "src/server.ts"]
