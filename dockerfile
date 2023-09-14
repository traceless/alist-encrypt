FROM node:gallium-alpine AS backend
WORKDIR /build
COPY node-proxy/. .
RUN npm i && npm run webpack

FROM node:gallium-alpine
WORKDIR /node-proxy
COPY --from=backend /build/dist /node-proxy
RUN pwd
RUN ls -la
RUN rm -rf /etc/localtime && ln -s /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
EXPOSE 5344
ENTRYPOINT ["node", "index.js"]