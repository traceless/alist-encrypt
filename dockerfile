FROM node:gallium-alpine
WORKDIR /node-proxy
# 复 制 项 目 文 件 到 容 器
COPY node-proxy /node-proxy
# 给 启 动 脚 本 执 行 权 限
RUN chmod +x /node-proxy/docker_start.sh
RUN npm install --omit=dev
# 设 置 时 区
RUN rm -rf /etc/localtime && ln -s /usr/share/zoneinfo/Asi
a/Shanghai /etc/localtime
# 暴 露 端 口
EXPOSE 5344
# 设 置 容 器 启 动 时 执 行 的 命 令
ENTRYPOINT ["/node-proxy/docker_start.sh"]
#CMD ["node", "app.js"]
CMD ["npm", "run", "serve"]
