FROM node:gallium-alpine
WORKDIR /node-proxy

COPY node-proxy /node-proxy

RUN chmod +x /node-proxy/docker_start.sh

#安装环境
RUN npm install --omit=dev

RUN rm -rf /etc/localtime && ln -s /usr/share/zoneinfo/Asi
a/Shanghai /etc/localtime

EXPOSE 5344

# 设置容器启动时执行的命令
ENTRYPOINT ["/node-proxy/docker_start.sh"]
# CMD ["node", "app.js"]
CMD ["npm", "run", "serve"]
